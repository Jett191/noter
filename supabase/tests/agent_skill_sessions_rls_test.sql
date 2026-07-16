-- noter-agent Task 1.3：agent_skill_sessions 表结构与 RLS 策略集成测试
--
-- 设计目标（依据 design.md / requirements.md 11.4 / 11.5 / 12.1）：
--   1. 表结构：字段、索引、触发器、expires_at 默认 now() + 24h
--   2. RLS：表上启用 RLS（relrowsecurity = true）
--   3. 仅 service_role 可访问；authenticated / anon 角色 SELECT/INSERT/UPDATE/DELETE
--      均返回「permission denied for table agent_skill_sessions」（SQLSTATE 42501）
--   4. 应用层 user_id 谓词正确隔离不同用户的 session（service_role 下）
--
-- 运行方式：
--   通过 supabase MCP execute_sql 整体执行；或本地：
--     psql "$SUPABASE_DB_URL" -f supabase/tests/agent_skill_sessions_rls_test.sql
--
-- 所有写操作均封装在 BEGIN/ROLLBACK 中，不会污染数据库。

\echo '====================================================='
\echo ' Test 1: 表结构 / 列定义 / expires_at 默认值'
\echo '====================================================='

-- 1.1 列定义（顺序、类型、默认值、可空性）
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agent_skill_sessions'
ORDER BY ordinal_position;

-- 1.2 索引（必须包含 active 复合索引与 skill+expires 索引）
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'agent_skill_sessions'
ORDER BY indexname;

-- 1.3 触发器（必须包含 updated_at 触发器）
SELECT tgname, pg_get_triggerdef(oid) AS trigger_def
FROM pg_trigger
WHERE tgrelid = 'public.agent_skill_sessions'::regclass AND NOT tgisinternal;

-- 1.4 expires_at 默认值 = now() + 24h（误差 < 5s）
BEGIN;
WITH inserted AS (
  INSERT INTO public.agent_skill_sessions (user_id, document_id, skill, state)
  SELECT p.id,
         d.id,
         '/tutor',
         '{"status":"active"}'::jsonb
  FROM public.profiles p
  JOIN public.documents d ON d.user_id = p.id AND d.deleted = 0
  WHERE p.deleted = 0
  ORDER BY p.created_at, d.created_at
  LIMIT 1
  RETURNING expires_at, created_at
)
SELECT 'expires_at_default = now() + 24h'::text AS test_case,
       EXTRACT(EPOCH FROM (expires_at - created_at)) AS diff_seconds,
       (EXTRACT(EPOCH FROM (expires_at - created_at)) BETWEEN 86395 AND 86405) AS passed
FROM inserted;
ROLLBACK;

\echo '====================================================='
\echo ' Test 2: RLS 启用 / Policy / Grant'
\echo '====================================================='

-- 2.1 RLS 已启用
SELECT relname, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname = 'agent_skill_sessions';

-- 2.2 仅有 service_role 的 policy（不为 authenticated / anon 创建任何 policy）
SELECT polname,
       polroles::regrole[] AS roles,
       polcmd AS cmd,
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS withcheck_expr
FROM pg_policy
WHERE polrelid = 'public.agent_skill_sessions'::regclass;

-- 2.3 表级权限：authenticated / anon 不应有任何权限；service_role / postgres 应有全部权限
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'agent_skill_sessions'
ORDER BY grantee, privilege_type;

\echo '====================================================='
\echo ' Test 3: authenticated / anon 角色 SQLSTATE 42501 拒绝'
\echo '====================================================='

-- 通过临时函数 SET LOCAL ROLE 模拟不同角色，捕获 SQLSTATE
CREATE OR REPLACE FUNCTION pg_temp.test_role_op(p_role text, p_op text)
RETURNS TABLE(role_name text, op text, sqlstate_code text, error_message text)
LANGUAGE plpgsql AS $$
DECLARE
  err_msg text;
  err_code text;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    IF p_op = 'SELECT' THEN
      PERFORM 1 FROM public.agent_skill_sessions LIMIT 1;
    ELSIF p_op = 'INSERT' THEN
      EXECUTE 'INSERT INTO public.agent_skill_sessions (user_id, document_id, skill) '
           || 'VALUES (gen_random_uuid(), gen_random_uuid(), ''/tutor'')';
    ELSIF p_op = 'UPDATE' THEN
      EXECUTE 'UPDATE public.agent_skill_sessions SET state = ''{}''::jsonb '
           || 'WHERE id = gen_random_uuid()';
    ELSIF p_op = 'DELETE' THEN
      EXECUTE 'DELETE FROM public.agent_skill_sessions WHERE id = gen_random_uuid()';
    END IF;
    role_name := p_role;
    op := p_op;
    sqlstate_code := '00000';
    error_message := 'NO ERROR';
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT, err_code = RETURNED_SQLSTATE;
    role_name := p_role;
    op := p_op;
    sqlstate_code := err_code;
    error_message := err_msg;
    RETURN NEXT;
  END;
  RESET ROLE;
END $$;

-- 期望：所有 (authenticated|anon, *) 都返回 42501 + permission denied
--       (service_role, SELECT) 返回 00000
SELECT * FROM pg_temp.test_role_op('authenticated', 'SELECT')
UNION ALL SELECT * FROM pg_temp.test_role_op('authenticated', 'INSERT')
UNION ALL SELECT * FROM pg_temp.test_role_op('authenticated', 'UPDATE')
UNION ALL SELECT * FROM pg_temp.test_role_op('authenticated', 'DELETE')
UNION ALL SELECT * FROM pg_temp.test_role_op('anon',          'SELECT')
UNION ALL SELECT * FROM pg_temp.test_role_op('anon',          'INSERT')
UNION ALL SELECT * FROM pg_temp.test_role_op('anon',          'UPDATE')
UNION ALL SELECT * FROM pg_temp.test_role_op('anon',          'DELETE')
UNION ALL SELECT * FROM pg_temp.test_role_op('service_role',  'SELECT');

\echo '====================================================='
\echo ' Test 4: service_role 下应用层 user_id 谓词跨用户隔离'
\echo '====================================================='

-- service_role 下，前端无法直读，但后端通过 SQL 谓词 user_id = :userId 实现隔离。
-- 4.1 user1 读自己的 session：应返回 1 行
BEGIN;
INSERT INTO public.agent_skill_sessions (id, user_id, document_id, skill, state)
SELECT '00000000-0000-0000-0000-000000000001'::uuid,
       p.id,
       d.id,
       '/tutor',
       '{"status":"active","currentChapterIndex":0}'::jsonb
FROM public.profiles p
JOIN public.documents d ON d.user_id = p.id AND d.deleted = 0
WHERE p.deleted = 0
ORDER BY p.created_at, d.created_at
LIMIT 1;

SELECT 'user1_reads_own_session' AS test_case,
       count(*)::int AS rows_returned,
       1 AS expected,
       (count(*)::int = 1) AS passed
FROM public.agent_skill_sessions
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
  AND user_id = (SELECT user_id FROM public.agent_skill_sessions
                 WHERE id = '00000000-0000-0000-0000-000000000001'::uuid)
  AND deleted = 0;

-- 4.2 user2 读 user1 的 session：应返回 0 行（应用层 user_id 谓词隔离）
SELECT 'user2_reads_user1_session' AS test_case,
       count(*)::int AS rows_returned,
       0 AS expected,
       (count(*)::int = 0) AS passed
FROM public.agent_skill_sessions
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
  AND user_id = (SELECT id FROM public.profiles
                 WHERE id <> (SELECT user_id FROM public.agent_skill_sessions
                              WHERE id = '00000000-0000-0000-0000-000000000001'::uuid)
                   AND deleted = 0
                 LIMIT 1)
  AND deleted = 0;

-- 4.3 user1 更新自己的 session：rows_affected = 1
WITH upd AS (
  UPDATE public.agent_skill_sessions
  SET state = jsonb_set(state, '{currentChapterIndex}', '1')
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
    AND user_id = (SELECT user_id FROM public.agent_skill_sessions
                   WHERE id = '00000000-0000-0000-0000-000000000001'::uuid)
  RETURNING id
)
SELECT 'user1_updates_own_session' AS test_case,
       (SELECT count(*)::int FROM upd) AS rows_affected,
       1 AS expected,
       ((SELECT count(*)::int FROM upd) = 1) AS passed;

-- 4.4 user2 更新 user1 的 session：rows_affected = 0（应用层 user_id 谓词拦截）
WITH upd AS (
  UPDATE public.agent_skill_sessions
  SET state = jsonb_set(state, '{currentChapterIndex}', '99')
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
    AND user_id = (SELECT id FROM public.profiles
                   WHERE id <> (SELECT user_id FROM public.agent_skill_sessions
                                WHERE id = '00000000-0000-0000-0000-000000000001'::uuid)
                     AND deleted = 0
                   LIMIT 1)
  RETURNING id
)
SELECT 'user2_updates_user1_session' AS test_case,
       (SELECT count(*)::int FROM upd) AS rows_affected,
       0 AS expected,
       ((SELECT count(*)::int FROM upd) = 0) AS passed;

ROLLBACK;

\echo '====================================================='
\echo ' Test 5: pgvector 扩展可用（不影响 noter-document-management）'
\echo '====================================================='
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
