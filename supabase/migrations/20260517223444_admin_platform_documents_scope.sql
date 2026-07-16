-- Admin Platform · Task 1.2
-- 为 documents 表新增 `document_scope` 与 `public_category_id` 字段，
-- 加上区分公私文档与公共分类的 CHECK 约束，以及面向公共文档列表查询的复合索引。
--
-- 设计要点（详见 design.md §5.1）:
--   - document_scope:'private' / 'public' 二选一，默认 'private'，保持向后兼容；
--     约束通过 documents_scope_chk 强制取值范围。
--   - public_category_id:仅公共文档可关联公共分类；私有文档必须为 NULL，
--     由 documents_private_no_category_chk 强制不变量。
--   - 外键 documents → public_categories(id) 由后续 task 1.5 在创建 public_categories
--     表时一并加上，本 migration 不引入 FK，避免顺序耦合。
--   - 复合索引 (document_scope, deleted, created_at DESC) 服务公共文档列表与
--     普通用户私有文档列表（强制 scope 过滤后按 deleted、按时间倒序）。

-- 1. 新增字段：document_scope（公私范围）+ public_category_id（公共分类外键，FK 后置）
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS document_scope text NOT NULL DEFAULT 'private';

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS public_category_id uuid;

COMMENT ON COLUMN public.documents.document_scope IS
  '文档可见范围：private=用户私有文档，public=后台运营的公共文档';
COMMENT ON COLUMN public.documents.public_category_id IS
  '公共文档所属的公共分类 id（仅 document_scope=public 时允许非 NULL；FK 在 public_categories 创建时补充）';

-- 2. CHECK 约束：document_scope 取值仅限 'private' / 'public'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_scope_chk'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_scope_chk
      CHECK (document_scope IN ('private', 'public'));
  END IF;
END
$$;

-- 3. CHECK 约束：私有文档不允许关联公共分类
--    （等价于 public_category_id 仅在 scope='public' 时允许非 NULL）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_private_no_category_chk'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_private_no_category_chk
      CHECK (document_scope = 'public' OR public_category_id IS NULL);
  END IF;
END
$$;

-- 4. 复合索引：服务公共/私有文档列表的常用过滤与排序路径
CREATE INDEX IF NOT EXISTS documents_scope_deleted_created_idx
  ON public.documents (document_scope, deleted, created_at DESC);

COMMENT ON INDEX public.documents_scope_deleted_created_idx IS
  '按 (document_scope, deleted, created_at DESC) 的复合索引，服务公共/私有文档列表查询';
