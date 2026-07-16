-- 创建 noter-agent 多轮 Skill 会话持久化表
-- 仅服务于 /tutor 与 /quiz 两个多轮 Skill；/brief、/explain、/actions 不写本表
-- 软删除约定：deleted = 0 表示正常，deleted = 1 表示已删除，与 documents 表保持一致
-- RLS 策略由后续 migration（task 1.2）启用，本 migration 仅创建表结构与索引

CREATE TABLE public.agent_skill_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  document_id uuid NOT NULL REFERENCES public.documents(id),
  skill text NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  deleted integer NOT NULL DEFAULT 0 CHECK (deleted = ANY (ARRAY[0, 1])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agent_skill_sessions IS
  'Noter Agent 多轮 Skill 会话表，持久化 /tutor 与 /quiz 的 session 状态（含题组、答案、评分等）';
COMMENT ON COLUMN public.agent_skill_sessions.id IS '会话 ID';
COMMENT ON COLUMN public.agent_skill_sessions.user_id IS '所属用户 ID';
COMMENT ON COLUMN public.agent_skill_sessions.document_id IS '关联文档 ID（每个 session 绑定单一文档）';
COMMENT ON COLUMN public.agent_skill_sessions.skill IS 'Skill 标识，例如 /tutor、/quiz';
COMMENT ON COLUMN public.agent_skill_sessions.state IS
  'Skill 特定状态 JSONB：/tutor 含 currentChapterIndex/exchangeHistory 等；/quiz 含 config/questions/userAnswers/gradingResult，questions[i].correctAnswer 仅服务端可见';
COMMENT ON COLUMN public.agent_skill_sessions.expires_at IS '会话过期时间，默认创建后 24 小时';
COMMENT ON COLUMN public.agent_skill_sessions.deleted IS '是否已删除，0 表示正常，1 表示删除（软删除约定与 documents 表一致）';
COMMENT ON COLUMN public.agent_skill_sessions.created_at IS '创建时间';
COMMENT ON COLUMN public.agent_skill_sessions.updated_at IS '更新时间，由触发器自动维护';

-- 复合索引：用于查询当前用户当前文档的活跃 session
-- (user_id, document_id, deleted, expires_at) 顺序匹配实际查询谓词
--   WHERE user_id = ? AND document_id = ? AND deleted = 0 AND expires_at > now()
CREATE INDEX agent_skill_sessions_active_idx
  ON public.agent_skill_sessions (user_id, document_id, deleted, expires_at);

-- 索引：用于定时任务扫描过期 session（按 skill 维度统计 / 清理）
CREATE INDEX agent_skill_sessions_skill_expires_idx
  ON public.agent_skill_sessions (skill, expires_at);

-- 触发器：updated_at 自动更新（复用 public.set_updated_at 函数）
CREATE TRIGGER agent_skill_sessions_set_updated_at
  BEFORE UPDATE ON public.agent_skill_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
