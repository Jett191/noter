-- Admin Platform · Task 1.1
-- 为 profiles 表加 is_system_account 字段，确保 role 兼容 'super_admin'，
-- 并通过 partial unique index 保证 super_admin 全局唯一。
--
-- 现状（来自 list_tables / pg_constraint 探查）:
--   - profiles.role 为 text，仅有 DEFAULT 'user'::text，**无 CHECK 约束**，
--     因此原生支持写入 'super_admin'，本 migration 无需 DROP/CREATE 约束。
--   - profiles.deleted 为 smallint，0 表示正常，1 表示已删除。
--   - 现有约束仅 PK(id) / UNIQUE(email) / FK(id→auth.users.id)。
--
-- 软删除约定保持一致：partial index 仅在 deleted = 0 范围内强制 super_admin 唯一，
-- 这样把超级管理员软删除后允许重新设立另一位 super_admin。

-- 1. 新增 is_system_account 字段，标记系统内部账号（公共文档归属者等）。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_system_account boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_system_account IS
  '是否为系统内部账号（用于公共文档归属等场景），true 表示系统账号，false 表示普通用户';

-- 2. 部分唯一索引：在未删除的 profiles 中，role='super_admin' 全局唯一。
--    采用 ((true)) 表达式索引 + 部分谓词，使整个表至多存在一行 super_admin。
CREATE UNIQUE INDEX IF NOT EXISTS profiles_super_admin_uniq
  ON public.profiles ((true))
  WHERE role = 'super_admin' AND deleted = 0;

COMMENT ON INDEX public.profiles_super_admin_uniq IS
  'super_admin 全局唯一性约束（仅作用于 deleted=0 的行）';
