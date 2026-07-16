-- Admin Platform · Task 1.6
-- 新建 public_document_versions 表（公共文档 markdown 版本快照）。
--
-- 设计要点（详见 design.md §5.2 / §6.2 / §7.3 / §7.4）:
--   - 用途：公共文档（document_scope='public'）的 markdown 版本归档表，支持
--     "在线编辑 → 归档当前版本 → 写回新内容 → 异步派生" 与 "回滚到指定版本" 两条主流程。
--     每次保存/回滚前，将 document_contents.markdown_content 的"上一版"快照写入本表，
--     version_no 在文档维度内严格自增（参见 design.md Correctness Property 3）。
--   - 列设计：
--       * id uuid PRIMARY KEY DEFAULT gen_random_uuid()
--       * document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE
--           → 文档被硬删除时一并清理版本快照；软删除（documents.deleted=1）保留版本，
--             与 design.md Correctness Property 4「软删保留所有衍生数据」一致。
--       * version_no int NOT NULL CHECK (version_no >= 1)
--           → 文档维度的版本号，从 1 起递增（v1 = 上传 pipeline 解析得到的初始 markdown）。
--       * markdown_content text NOT NULL
--           → 该版本归档时的 markdown 全文快照。
--       * change_note text NULLABLE
--           → 管理员保存/回滚时填写的变更说明，可空。
--       * editor_user_id uuid NOT NULL REFERENCES public.profiles(id)
--           → 触发该次归档的管理员 profile id（不级联，profile 软删时仍保留版本归属）。
--       * created_at timestamptz NOT NULL DEFAULT now()
--   - 唯一性：UNIQUE (document_id, version_no)
--       → 单文档内 version_no 唯一，防止并发保存导致版本号冲突。事务内通过
--         SELECT ... FOR UPDATE 行锁 + max(version_no)+1 串行化生成下一个 version_no。
--   - 索引：(document_id, version_no DESC)
--       → 服务于 GET /versions 列表（按 version_no DESC 翻页）与 max(version_no)
--         的快速取值。UNIQUE (document_id, version_no) 自带的索引是升序，单独再建一个
--         降序复合索引让"取最新版本号"与"按倒序列出"都走 index-only scan。
--   - RLS：authenticated 全禁，仅 service_role 可访问（详见 task 1.9）。

-- 1. 创建 public_document_versions 表（公共文档 markdown 版本快照）。
CREATE TABLE IF NOT EXISTS public.public_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_no int NOT NULL CHECK (version_no >= 1),
  markdown_content text NOT NULL,
  change_note text,
  editor_user_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no)
);

COMMENT ON TABLE public.public_document_versions IS
  '公共文档 markdown 版本快照表，承载在线编辑/回滚的归档版本，version_no 在文档维度内严格自增';
COMMENT ON COLUMN public.public_document_versions.document_id IS
  '关联 documents.id（document_scope=public）；ON DELETE CASCADE，文档硬删时一并清理';
COMMENT ON COLUMN public.public_document_versions.version_no IS
  '文档维度版本号，从 1 起递增，必须 >= 1（CHECK 约束）；与 document_id 联合唯一';
COMMENT ON COLUMN public.public_document_versions.markdown_content IS
  '该版本归档时的 markdown 全文快照（保存/回滚前的"上一版"内容）';
COMMENT ON COLUMN public.public_document_versions.change_note IS
  '管理员保存/回滚时填写的变更说明，可空';
COMMENT ON COLUMN public.public_document_versions.editor_user_id IS
  '触发该次归档的管理员 profile id（关联 profiles.id，无级联）';

-- 2. 复合降序索引：(document_id, version_no DESC)
--    服务于 GET /versions 列表倒序翻页与 max(version_no) 取最新版本号。
--    UNIQUE (document_id, version_no) 自带升序索引；这里单独建降序索引以让降序场景
--    走 index-only scan，避免对单文档版本数较多时的 sort 开销。
CREATE INDEX IF NOT EXISTS public_doc_versions_doc_versionno_idx
  ON public.public_document_versions (document_id, version_no DESC);

COMMENT ON INDEX public.public_doc_versions_doc_versionno_idx IS
  '公共文档版本快照按 (document_id, version_no DESC) 的复合索引，服务于版本列表倒序翻页与最新版本号取值';
