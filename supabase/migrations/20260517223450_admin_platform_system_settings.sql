-- Admin Platform · Task 1.8
-- 新建 system_settings 表（4 项最小访问控制开关）并写入默认 seed 记录。
--
-- 设计要点（详见 design.md §5.2 / §6 / Requirements 23, 24）:
--   - 用途：以 key/value 形式承载管理员后台的 4 项访问控制配置开关，被 noter-web 与
--     noter-admin 双端读取；写端仅在 PATCH /api/admin/system-settings 中事务内更新，
--     同事务写一条 admin_audit_logs（action_type='system_settings.update'）。
--   - 4 项配置（与 lib/settings/defaults.ts 保持一致，默认值均为 true）:
--       * allow_user_upload          —— 普通用户能否上传私有文档
--       * allow_user_delete_own      —— 普通用户能否删除自己的私有文档
--       * public_documents_visible   —— 公共文档是否对普通用户可见
--       * audit_log_enabled          —— 是否写入 admin_audit_logs（切换该开关自身始终写日志）
--   - 列设计：
--       * key text PRIMARY KEY
--           → 设置项标识，配合 CHECK 白名单形成「枚举式 PK」，避免引入额外的 id 列。
--       * value jsonb NOT NULL
--           → 用 jsonb 而非 boolean 是为后续可能扩展的复杂值（数字/对象）保留余量；
--             当前 4 项都是 boolean，故强制 jsonb_typeof(value)='boolean'。
--       * updated_at timestamptz NOT NULL DEFAULT now()
--           → 上次修改时间，前端「设置」页展示。
--       * updated_by uuid REFERENCES public.profiles(id)
--           → 上次修改者 profile id；可空（首次 seed 由迁移直接写入，无操作管理员）。
--             不级联：管理员账号软删/硬删时仍保留来源痕迹，避免历史归属丢失。
--   - 约束：
--       * settings_key_chk CHECK (key IN (...))
--           → 4 项 key 白名单；与 lib/settings/defaults.ts 联合类型保持一致。
--       * settings_value_chk CHECK (jsonb_typeof(value) = 'boolean')
--           → 强制 value 为 boolean，防止误写入字符串/对象等其他 jsonb 类型。
--   - RLS：authenticated SELECT 放开（noter-web 需要读 allow_user_upload /
--     allow_user_delete_own / public_documents_visible），写入仅 service_role。
--     具体 policy 在 task 1.9 中统一启用。
--   - Seed：4 条记录默认 true，使用 ON CONFLICT (key) DO NOTHING 保证迁移幂等
--     （重复执行不会覆盖运行时已被管理员调整过的值）。

-- 1. 创建 system_settings 表（4 项最小访问控制开关）。
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  CONSTRAINT settings_key_chk CHECK (key IN (
    'allow_user_upload',
    'allow_user_delete_own',
    'public_documents_visible',
    'audit_log_enabled'
  )),
  CONSTRAINT settings_value_chk CHECK (jsonb_typeof(value) = 'boolean')
);

COMMENT ON TABLE public.system_settings IS
  '管理员后台 4 项最小访问控制开关（key/value 形式），被 noter-web 与 noter-admin 双端读取；写入仅通过 PATCH /api/admin/system-settings 事务内更新并同步写 admin_audit_logs';
COMMENT ON COLUMN public.system_settings.key IS
  '设置项标识，受 settings_key_chk 白名单约束（4 个枚举值），与 lib/settings/defaults.ts 联合类型保持一致';
COMMENT ON COLUMN public.system_settings.value IS
  '设置项值（jsonb，当前 4 项均为 boolean），受 settings_value_chk 强制 jsonb_typeof=boolean';
COMMENT ON COLUMN public.system_settings.updated_at IS
  '上次修改时间，前端「设置」页展示';
COMMENT ON COLUMN public.system_settings.updated_by IS
  '上次修改者 profile id（关联 profiles.id，无级联，软删/硬删时保留来源痕迹）；首次 seed 由迁移写入，故可空';
COMMENT ON CONSTRAINT settings_key_chk ON public.system_settings IS
  'key 白名单 CHECK：限定 4 个允许的设置项（allow_user_upload / allow_user_delete_own / public_documents_visible / audit_log_enabled），与 lib/settings/defaults.ts 联合类型对齐';
COMMENT ON CONSTRAINT settings_value_chk ON public.system_settings IS
  'value 类型 CHECK：强制 jsonb_typeof(value)=boolean，防止误写入字符串/对象等其他 jsonb 类型';

-- 2. Seed：4 条默认记录（默认值均为 true）。
--    使用 ON CONFLICT (key) DO NOTHING 保证迁移幂等：
--    重复执行不会覆盖运行时已被管理员调整过的值。
INSERT INTO public.system_settings (key, value) VALUES
  ('allow_user_upload',        'true'::jsonb),
  ('allow_user_delete_own',    'true'::jsonb),
  ('public_documents_visible', 'true'::jsonb),
  ('audit_log_enabled',        'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
