-- Admin Platform · Task 1.3
-- 为 folders 表新增 `is_system_folder` 字段，用于标记系统级文件夹
-- （即"Noter 官方"系统文件夹），承载所有公共文档（document_scope='public'）。
--
-- 设计要点（详见 design.md §5.1）:
--   - is_system_folder:boolean，默认 false，向后兼容现有行；
--     true 表示该文件夹由系统管理（挂在系统账号下），
--     普通用户通过后续追加的 RLS SELECT policy 自然可见但不可改。
--   - 使用 ADD COLUMN IF NOT EXISTS 保证幂等，可重复执行不报错。
--   - 该字段同时是后续 task 1.9 RLS 策略
--     （folders_select_system: USING (is_system_folder = true)）以及
--     task 1.10 seed 脚本（创建 Noter 官方系统文件夹）的依赖。

-- 1. 新增 is_system_folder 字段，标记系统级文件夹。
ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS is_system_folder boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.folders.is_system_folder IS
  '是否为系统级文件夹，true 表示由系统管理的 "Noter 官方" 文件夹（承载公共文档），false 表示普通用户文件夹';
