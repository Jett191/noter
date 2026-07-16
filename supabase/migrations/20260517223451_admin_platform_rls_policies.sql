-- Admin Platform · Task 1.9
-- 统一启用 / 调整 RLS 策略，支撑 noter-admin 后台与 noter-web 前端两端的访问控制。
--
-- 设计目标（详见 design.md §5.4 / Requirements 1, 12, 25）:
--
--   核心策略：service_role 完全绕过 RLS，所有 noter-admin 写入路径（公共文档上传、
--   元数据/内容编辑、版本回滚、分类/标签 CRUD、用户封禁/软删/重置密码、设置变更等）
--   均由 Route Handler 在服务端使用 service_role 客户端执行，因此本迁移只关心
--   authenticated 角色（noter-web 普通登录用户）能看到 / 不能看到什么。
--
--   现有 noter-document-management 模块已经为 documents / folders / tags 三张表
--   建立了 user_id = auth.uid() 的 SELECT/INSERT/UPDATE/DELETE policies（参见数据库
--   现状：documents_select_policy / folders_select / tags_select_policy 等）。
--   这些 policies **保留不动**，本迁移仅为这三张表「追加」一条额外的 SELECT policy，
--   用于让普通用户自然看到公共文档 / 系统文件夹 / 官方标签。Postgres RLS 多 policy
--   之间是 OR 关系，因此「自有数据 + 系统数据」会自然 UNION 在同一个查询中返回，
--   noter-web 的现有 `WHERE user_id = auth.uid()` 业务查询无需任何改动。
--
--   关键不变量：UPDATE / DELETE 仍然受现有 user_id = auth.uid() policies 约束。
--   公共文档 / 系统文件夹 / 官方标签的所有者是「系统账号」（profiles.is_system_account=true），
--   普通用户因 user_id 不匹配，自然无法修改或删除这些行；新追加的 SELECT policy 仅扩大
--   可见范围，不放开写入权限。
--
--   对于本期 admin 平台新增的 4 张表（public_categories / public_document_versions /
--   admin_audit_logs / system_settings），它们在 task 1.5-1.8 创建时**尚未启用 RLS**，
--   此处统一 ENABLE ROW LEVEL SECURITY，并按以下策略放开 SELECT：
--     * public_categories     —— 全员 SELECT（noter-web 需要展示分类筛选）
--     * system_settings       —— 全员 SELECT（noter-web 需要读 3 个开关：
--                                  allow_user_upload / allow_user_delete_own /
--                                  public_documents_visible；audit_log_enabled 仅
--                                  noter-admin 关心，但读放开无敏感数据泄露）
--     * public_document_versions —— 不创建任何 policy → authenticated 完全禁读
--                                    （管理员通过 service_role 在 Route Handler 中访问）
--     * admin_audit_logs      —— 不创建任何 policy → authenticated 完全禁读
--                                    （审计日志仅 noter-admin 后台可见，service_role
--                                     绕过 RLS；不向普通用户暴露任何行）
--
--   幂等性：所有 CREATE POLICY 之前 DROP POLICY IF EXISTS；ENABLE ROW LEVEL SECURITY
--   在已启用的表上重复执行无副作用。本迁移可安全地重复执行。
--
--   依赖：task 1.2 (documents.document_scope / deleted) / task 1.3 (folders.is_system_folder)
--         / task 1.4 (tags.is_official / deleted) / task 1.5-1.8 (新表创建)。

-- =============================================================================
-- 1. documents：追加公共文档 SELECT policy
-- =============================================================================
-- 现有 documents_select_policy(USING auth.uid()=user_id) 保留不动；本 policy 与
-- 之间是 OR 关系，使得 authenticated 用户能 SELECT 自己的私有文档 + 所有未软删的
-- 公共文档。INSERT/UPDATE/DELETE 仍受现有 user_id=auth.uid() policies 约束，普通
-- 用户无法修改公共文档（公共文档 user_id = 系统账号 id ≠ auth.uid()）。
DROP POLICY IF EXISTS documents_select_public ON public.documents;
CREATE POLICY documents_select_public ON public.documents
  FOR SELECT TO authenticated
  USING (document_scope = 'public' AND deleted = 0);

COMMENT ON POLICY documents_select_public ON public.documents IS
  '公共文档 SELECT 放开：authenticated 用户可读取所有 document_scope=public 且 deleted=0 的文档；与现有 documents_select_policy(user_id=auth.uid()) 为 OR 关系，让 noter-web 用户自然看到公共文档而无需修改业务查询';

-- =============================================================================
-- 2. folders：追加系统文件夹 SELECT policy
-- =============================================================================
-- 现有 folders_select(USING auth.uid()=user_id) 保留不动；本 policy 让 authenticated
-- 用户能看到所有 is_system_folder=true 的文件夹（即「Noter 官方」系统文件夹）。
-- UPDATE/DELETE 仍受现有 user_id=auth.uid() 约束，系统文件夹 user_id=系统账号 id，
-- 普通用户无法重命名 / 删除 / 移动。
DROP POLICY IF EXISTS folders_select_system ON public.folders;
CREATE POLICY folders_select_system ON public.folders
  FOR SELECT TO authenticated
  USING (is_system_folder = true);

COMMENT ON POLICY folders_select_system ON public.folders IS
  '系统文件夹 SELECT 放开：authenticated 用户可读取所有 is_system_folder=true 的文件夹（如「Noter 官方」）；与现有 folders_select(user_id=auth.uid()) 为 OR 关系，让 noter-web 文件夹树自然展示系统文件夹';

-- =============================================================================
-- 3. tags：追加官方标签 SELECT policy
-- =============================================================================
-- 现有 tags_select_policy(USING auth.uid()=user_id) 保留不动；本 policy 让
-- authenticated 用户能看到所有 is_official=true 且未软删的官方标签。
-- INSERT/UPDATE/DELETE 仍受 user_id=auth.uid() 约束，普通用户无法修改官方标签。
-- 业务上：公共文档关联的标签必须 is_official=true（task 5.3 元数据更新校验）。
DROP POLICY IF EXISTS tags_select_official ON public.tags;
CREATE POLICY tags_select_official ON public.tags
  FOR SELECT TO authenticated
  USING (is_official = true AND deleted = 0);

COMMENT ON POLICY tags_select_official ON public.tags IS
  '官方标签 SELECT 放开：authenticated 用户可读取所有 is_official=true 且 deleted=0 的官方标签；与现有 tags_select_policy(user_id=auth.uid()) 为 OR 关系，使公共文档详情中的标签对普通用户可见';

-- =============================================================================
-- 4. public_categories：启用 RLS + 全员 SELECT policy
-- =============================================================================
-- 公共文档分类对普通用户全开放（用于 noter-web 列表筛选 / 详情展示）；
-- 写入仅通过 noter-admin Route Handler + service_role 执行（task 8）。
ALTER TABLE public.public_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pc_select_all ON public.public_categories;
CREATE POLICY pc_select_all ON public.public_categories
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON POLICY pc_select_all ON public.public_categories IS
  '公共分类 SELECT 全员放开：所有 authenticated 用户可读取 public_categories 全表（含 deleted=1 行，调用方在业务查询中按需过滤）；写入仅通过 noter-admin Route Handler 以 service_role 身份执行';

-- =============================================================================
-- 5. public_document_versions：启用 RLS（不创建任何 policy → authenticated 全禁）
-- =============================================================================
-- 版本快照表仅服务于 noter-admin 后台的「版本历史」与「回滚」功能（task 7）；
-- 普通用户没有任何业务场景需要直接读取版本表，因此不为 authenticated 创建任何
-- policy（PostgreSQL RLS 默认拒绝）。所有访问通过 noter-admin Route Handler +
-- service_role 完成。
ALTER TABLE public.public_document_versions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 6. admin_audit_logs：启用 RLS（不创建任何 policy → authenticated 全禁）
-- =============================================================================
-- 审计日志表仅 noter-admin 后台可见（task 10.1 GET /api/admin/audit-logs），
-- 普通用户绝不能读取或写入。不为 authenticated 创建任何 policy，service_role
-- 通过绕过 RLS 完成所有读写。
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 7. system_settings：启用 RLS + 全员 SELECT policy
-- =============================================================================
-- noter-web 需要读取 3 项可见设置（allow_user_upload / allow_user_delete_own /
-- public_documents_visible）以做客户端门控；audit_log_enabled 虽仅 noter-admin
-- 关心，但 system_settings 全表无敏感数据，统一对 authenticated 放开 SELECT 更
-- 简洁。写入（PATCH /api/admin/system-settings, task 10.3）仅通过 service_role
-- 在事务内更新并同步写 admin_audit_logs。
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_settings_select_all ON public.system_settings;
CREATE POLICY system_settings_select_all ON public.system_settings
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON POLICY system_settings_select_all ON public.system_settings IS
  '系统设置 SELECT 全员放开：所有 authenticated 用户可读取 system_settings 全表（4 项 boolean 开关，无敏感数据）；写入仅通过 PATCH /api/admin/system-settings 以 service_role 身份在事务内更新并同步写 admin_audit_logs';
