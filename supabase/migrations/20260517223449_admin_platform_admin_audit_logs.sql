-- Admin Platform · Task 1.7
-- 新建 admin_audit_logs 表（管理员后台操作审计日志）。
--
-- 设计要点（详见 design.md §5.2 / §6.2 / §7.5 / Requirements 23）:
--   - 用途：记录管理员后台所有写操作（用户管理、公共文档管理、公共分类/标签管理、
--     普通文档强制软删、系统设置变更）的审计流水。所有写入端 Route Handler 通过
--     `lib/audit/writeAuditLog` 写入；读端仅 GET /api/admin/audit-logs，不提供写入端点。
--     写入受 system_settings.audit_log_enabled 开关控制（切换该开关自身始终写日志）。
--   - 列设计：
--       * id uuid PRIMARY KEY DEFAULT gen_random_uuid()
--       * admin_user_id uuid NOT NULL REFERENCES public.profiles(id)
--           → 实际触发该次操作的管理员 profile id（公共文档场景下不是占位的系统账号）。
--             不级联：profile 软删/硬删时仍保留审计记录归属，避免历史日志因人员变动丢失追溯。
--       * admin_email text NOT NULL
--           → 冗余存储管理员邮箱，避免列表查询频繁 JOIN profiles，且当 profile 被硬删后仍可读。
--       * action_type text NOT NULL + CONSTRAINT audit_action_chk
--           → 18 个枚举值的白名单（用户 5 + 公共文档 5 + 公共分类 3 + 公共标签 3 +
--             普通文档强删 1 + 系统设置 1）；与 lib/audit/actionTypes.ts 联合类型保持一致。
--             用 CHECK 约束而非独立枚举表是因为：取值变化频率低、需要类型化代码侧约束、
--             避免无谓 JOIN。
--       * target_resource_type text NOT NULL + CONSTRAINT audit_target_chk
--           → 6 个枚举值（user / document / public_document / public_category /
--             public_tag / system_settings）；同样以 CHECK 约束实现白名单。
--       * target_resource_id uuid NULLABLE
--           → 可空：例如 system_settings.update 时按 key 定位、批量上传场景每个文件单独
--             一条记录，target_resource_id 已知；少量元操作（如纯审计查询）可不带具体 id。
--       * target_resource_label text NULLABLE
--           → 冗余存储目标资源的可读标识（用户邮箱/文档标题/分类名/标签名/设置 key），
--             便于审计列表展示，避免目标资源被改名/软删后失去上下文。
--       * request_ip text NULLABLE
--           → 触发请求的来源 IP，从 Route Handler 的 X-Forwarded-For / Request 中提取。
--             可空兼容内部脚本/系统任务调用。
--       * metadata jsonb NOT NULL DEFAULT '{}'::jsonb
--           → 操作专属上下文（密码重置不含 token、内容更新不含完整 markdown、
--             上传含 file_size/file_ext、设置更新含 before/after value 等）。
--             默认空对象，避免 NULL 判断。
--       * created_at timestamptz NOT NULL DEFAULT now()
--   - 索引（详见 design.md §6.2 查询模式）:
--       * audit_created_idx ON (created_at DESC)
--           → 默认列表按时间倒序翻页（无筛选场景）。
--       * audit_admin_created_idx ON (admin_user_id, created_at DESC)
--           → 按操作人筛选 + 时间倒序的复合查询模式。
--       * audit_action_created_idx ON (action_type, created_at DESC)
--           → 按操作类型筛选 + 时间倒序的复合查询模式。
--       目标资源类型筛选（target_resource_type）使用率较低且基数小，依赖 created_at
--       索引上的回表过滤即可，暂不为其单独建索引。
--   - RLS：authenticated 全禁，仅 service_role 可访问（在 task 1.9 中统一启用并配置 policy）。

-- 1. 创建 admin_audit_logs 表（管理员后台操作审计）。
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.profiles(id),
  admin_email text NOT NULL,
  action_type text NOT NULL,
  target_resource_type text NOT NULL,
  target_resource_id uuid,
  target_resource_label text,
  request_ip text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_action_chk CHECK (action_type IN (
    'user.block','user.unblock','user.delete','user.send_password_reset','user.role_change',
    'public_document.upload','public_document.metadata_update','public_document.content_update',
    'public_document.rollback','public_document.delete',
    'public_category.create','public_category.update','public_category.delete',
    'public_tag.create','public_tag.update','public_tag.delete',
    'document.force_delete','system_settings.update'
  )),
  CONSTRAINT audit_target_chk CHECK (target_resource_type IN (
    'user','document','public_document','public_category','public_tag','system_settings'
  ))
);

COMMENT ON TABLE public.admin_audit_logs IS
  '管理员后台操作审计日志表，记录所有写操作流水；写入受 system_settings.audit_log_enabled 控制，切换该开关自身始终写日志';
COMMENT ON COLUMN public.admin_audit_logs.admin_user_id IS
  '实际触发操作的管理员 profile id（关联 profiles.id，无级联，profile 软删/硬删时保留审计记录归属）';
COMMENT ON COLUMN public.admin_audit_logs.admin_email IS
  '冗余存储管理员邮箱，便于列表展示与 profile 硬删后仍可追溯';
COMMENT ON COLUMN public.admin_audit_logs.action_type IS
  '操作类型，受 audit_action_chk 白名单约束（18 个枚举值），与 lib/audit/actionTypes.ts 保持一致';
COMMENT ON COLUMN public.admin_audit_logs.target_resource_type IS
  '目标资源类型，受 audit_target_chk 白名单约束（6 个枚举值：user/document/public_document/public_category/public_tag/system_settings）';
COMMENT ON COLUMN public.admin_audit_logs.target_resource_id IS
  '目标资源 id，可空（部分元操作不带具体 id；system_settings 场景按 key 定位）';
COMMENT ON COLUMN public.admin_audit_logs.target_resource_label IS
  '目标资源可读标识冗余字段（用户邮箱/文档标题/分类名/标签名/设置 key），便于列表展示与软删后追溯';
COMMENT ON COLUMN public.admin_audit_logs.request_ip IS
  '触发请求的来源 IP（X-Forwarded-For / 直连），可空以兼容内部脚本调用';
COMMENT ON COLUMN public.admin_audit_logs.metadata IS
  '操作专属上下文 jsonb（密码重置不含 token、内容更新不含完整 markdown、设置更新含 before/after value 等），默认空对象';
COMMENT ON CONSTRAINT audit_action_chk ON public.admin_audit_logs IS
  'action_type 白名单 CHECK：限定 18 个允许的操作类型，与 lib/audit/actionTypes.ts 联合类型对齐';
COMMENT ON CONSTRAINT audit_target_chk ON public.admin_audit_logs IS
  'target_resource_type 白名单 CHECK：限定 6 个允许的目标资源类型';

-- 2. 索引：created_at DESC 单列
--    服务于无筛选场景下的默认时间倒序翻页。
CREATE INDEX IF NOT EXISTS audit_created_idx
  ON public.admin_audit_logs (created_at DESC);

COMMENT ON INDEX public.audit_created_idx IS
  '审计日志按 created_at DESC 的单列索引，服务于无筛选场景下的默认时间倒序翻页';

-- 3. 索引：(admin_user_id, created_at DESC) 复合
--    服务于「按操作人筛选 + 时间倒序」的复合查询模式。
CREATE INDEX IF NOT EXISTS audit_admin_created_idx
  ON public.admin_audit_logs (admin_user_id, created_at DESC);

COMMENT ON INDEX public.audit_admin_created_idx IS
  '审计日志按 (admin_user_id, created_at DESC) 的复合索引，服务于按操作人筛选 + 时间倒序的查询';

-- 4. 索引：(action_type, created_at DESC) 复合
--    服务于「按操作类型筛选 + 时间倒序」的复合查询模式。
CREATE INDEX IF NOT EXISTS audit_action_created_idx
  ON public.admin_audit_logs (action_type, created_at DESC);

COMMENT ON INDEX public.audit_action_created_idx IS
  '审计日志按 (action_type, created_at DESC) 的复合索引，服务于按操作类型筛选 + 时间倒序的查询';
