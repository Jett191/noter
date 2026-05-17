-- Admin Platform · Task 1.4
-- 为 tags 表新增 `is_official` 字段，用于标记官方公共标签（公共文档可关联）。
-- 同时增加部分唯一索引，保证未删除的官方公共标签按大小写不敏感的 name 全局唯一。
--
-- 设计要点（详见 design.md §5.1）:
--   - is_official:boolean，默认 false，向后兼容现有行；
--     true 表示由后台管理员维护的"公共标签"，可被公共文档（document_scope='public'）关联；
--     false 表示普通用户私人标签，沿用现有 noter-web 行为。
--   - 公共标签 name 唯一性通过 partial unique index `tags_official_name_uniq` 强制：
--       * 表达式 LOWER(name) → 大小写不敏感；
--       * 谓词 is_official = true AND deleted = 0
--         → 仅在"未删除的公共标签"范围内强制唯一，
--         软删除后允许重新创建同名公共标签。
--   - tags 表当前 schema（list_tables 探查）:
--       * name text NOT NULL；
--       * deleted integer NOT NULL DEFAULT 0 with CHECK (deleted IN (0, 1))。
--     与本 migration 的 partial index 谓词 `deleted = 0` 类型一致，无需类型转换。
--   - 使用 ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS 保证幂等。
--   - 该字段是后续 task 1.9 RLS 策略
--     （tags_select_official: USING (is_official = true AND deleted = 0)）
--     与 task 8 公共标签 CRUD API 的依赖。

-- 1. 新增 is_official 字段，标记官方公共标签。
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tags.is_official IS
  '是否为官方公共标签，true 表示由后台管理员维护、可被公共文档关联的公共标签，false 表示普通用户私人标签';

-- 2. 部分唯一索引：未删除的官方公共标签按 LOWER(name) 全局唯一
--    （大小写不敏感；软删除后释放 name 以便重建）。
CREATE UNIQUE INDEX IF NOT EXISTS tags_official_name_uniq
  ON public.tags (LOWER(name))
  WHERE is_official = true AND deleted = 0;

COMMENT ON INDEX public.tags_official_name_uniq IS
  '官方公共标签 name 唯一性约束（LOWER(name) 大小写不敏感，仅作用于 is_official=true 且 deleted=0 的行）';
