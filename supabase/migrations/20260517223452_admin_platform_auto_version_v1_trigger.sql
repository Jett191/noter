-- Admin Platform · Task 6.3
-- 当 pipeline 解析公共文档并生成 markdown_content 后,自动在
-- public_document_versions 中创建初始版本记录 (version_no=1)。
--
-- 实现方式:在 document_contents 表上创建 AFTER INSERT 触发器。
-- 当新行插入 document_contents 时,触发器检查:
--   1. 关联的 documents 行是否为公共文档 (document_scope='public')
--   2. 该文档是否尚无版本记录 (防止重复插入)
-- 满足条件时,自动 INSERT public_document_versions(version_no=1),
-- editor_user_id 使用系统账号 id (profiles.is_system_account=true)。
--
-- 设计依据 (design.md §6.2 / §7.2):
--   "pipeline 内部解析得到 markdown_content 后,自动 INSERT
--    public_document_versions(version_no=1)"
--   "具体位置实施时定" → 选择数据库触发器,因为:
--     - parse-document Edge Function 是独立部署的 Supabase Function,
--       noter-admin 应用无法直接修改其代码
--     - 触发器在数据层保证一致性,无论 markdown 由哪个入口写入
--     - 幂等:通过 NOT EXISTS 检查防止重复创建

-- 1. 创建触发器函数
CREATE OR REPLACE FUNCTION public.fn_auto_create_public_doc_version_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document_scope text;
  v_system_user_id uuid;
  v_version_exists boolean;
BEGIN
  -- 查询关联文档的 document_scope
  SELECT document_scope INTO v_document_scope
  FROM public.documents
  WHERE id = NEW.document_id;

  -- 仅处理公共文档
  IF v_document_scope IS DISTINCT FROM 'public' THEN
    RETURN NEW;
  END IF;

  -- 检查是否已存在版本记录(幂等保护)
  SELECT EXISTS (
    SELECT 1
    FROM public.public_document_versions
    WHERE document_id = NEW.document_id
  ) INTO v_version_exists;

  IF v_version_exists THEN
    RETURN NEW;
  END IF;

  -- 获取系统账号 id 作为 editor_user_id
  SELECT id INTO v_system_user_id
  FROM public.profiles
  WHERE is_system_account = true
  LIMIT 1;

  -- 如果找不到系统账号,使用文档的 user_id 作为 fallback
  IF v_system_user_id IS NULL THEN
    SELECT user_id INTO v_system_user_id
    FROM public.documents
    WHERE id = NEW.document_id;
  END IF;

  -- 插入初始版本记录 (version_no=1)
  INSERT INTO public.public_document_versions (
    document_id,
    version_no,
    markdown_content,
    change_note,
    editor_user_id
  ) VALUES (
    NEW.document_id,
    1,
    NEW.markdown_content,
    '初始版本(pipeline 解析生成)',
    v_system_user_id
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_auto_create_public_doc_version_v1() IS
  '当 document_contents 插入新行时,若关联文档为公共文档且尚无版本记录,自动创建 version_no=1';

-- 2. 创建触发器(仅在 INSERT 时触发)
DROP TRIGGER IF EXISTS trg_auto_create_public_doc_version_v1 ON public.document_contents;

CREATE TRIGGER trg_auto_create_public_doc_version_v1
  AFTER INSERT ON public.document_contents
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_create_public_doc_version_v1();

COMMENT ON TRIGGER trg_auto_create_public_doc_version_v1 ON public.document_contents IS
  'pipeline 解析公共文档后自动创建初始版本 (version_no=1) 到 public_document_versions';
