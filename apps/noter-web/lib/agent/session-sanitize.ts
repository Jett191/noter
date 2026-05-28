/**
 * Session 脱敏：投递前端前剔除 `state.questions[i].correctAnswer`。
 *
 * 在 Route Handler 层冗余实现一份本地脱敏（不跨包引用 agent-runtime 的 helper），
 * 与 `packages/agent-runtime/src/skills/quiz.ts` 中的 `stripCorrectAnswers` 形成
 * 双视图保护（Security Considerations: agent_skill_sessions 前端禁直读 +
 * correctAnswer 仅服务端可见）。
 *
 * 行为：
 *   - 输入未知形状的 state（来自 DB JSONB 列）时尽量保守地返回原始结构
 *   - 仅当 `state.questions` 是数组时，逐项剔除 `correctAnswer` 字段
 *   - 其他字段（status / config / userAnswers / gradingResult ...）原样保留
 *   - 返回新对象，不修改入参（防御性 immutability）
 */

export function sanitizeSessionState(state: unknown): unknown {
  if (!state || typeof state !== 'object') return state

  const obj = state as Record<string, unknown>
  const questions = obj.questions

  if (!Array.isArray(questions)) {
    // 没有 questions 字段或非数组（例如 /tutor session）→ 不做任何剥离
    return state
  }

  const sanitizedQuestions = questions.map((q) => {
    if (!q || typeof q !== 'object') return q
    // 解构忽略 correctAnswer，结构上保证返回对象不含该字段
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { correctAnswer: _ignored, ...rest } = q as Record<string, unknown>
    return rest
  })

  return {
    ...obj,
    questions: sanitizedQuestions
  }
}

/**
 * 对 SkillSession 完整对象脱敏（仅替换 state 字段）。
 */
export function sanitizeSession<T extends { state: unknown }>(session: T): T {
  return {
    ...session,
    state: sanitizeSessionState(session.state)
  }
}
