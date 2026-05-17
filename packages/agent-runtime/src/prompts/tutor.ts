/**
 * `/tutor` Prompt 模板。
 *
 * 一轮 /tutor 会触发最多三类 LLM 调用：
 *   1. **章节级摘要压缩**（章节内容超长且代表性采样仍超出预算时） —— 把整章压缩成
 *      一段不超过 1500 字的中文摘要，保持术语 / 案例 / 结论；输出 JSON `{ summary }`。
 *   2. **生成本轮 explanation + question** —— 充当苏格拉底式私教，根据当前章节内容、
 *      上一轮回答评估（首轮为 null）、累计 understanding 分数（0-100）输出 JSON
 *      `{ explanation, question }`，与 `TutorTurnPayload` 对齐。
 *   3. **评估用户回答** —— 根据章节内容、上一轮提问、用户回答输出
 *      JSON `{ assessment: 'good' | 'partial' | 'confused' }`。
 *
 * 所有 LLM 调用均通过 `LLMTool.completeJson` 走 JSON mode + Zod 校验，
 * Prompt 仅负责中文私教语气与字段语义；Schema 校验由 Skill Handler 注入。
 */

export interface TurnUserPromptArgs {
  chapterTitle: string
  chapterContent: string
  /** 上一轮回答的评估；首轮 null（fresh 启动） */
  lastAssessment: 'good' | 'partial' | 'confused' | null
  /** 累计理解度 0-100；首轮 50 (neutral) */
  understanding: number
  /** 是否已经在同一章重复出题（partial / confused 时为 true，提示 LLM 用更易切入的角度） */
  retryOnSameChapter: boolean
}

export interface EvalUserPromptArgs {
  chapterTitle: string
  chapterContent: string
  question: string
  userAnswer: string
}

export interface ChapterSummaryPromptArgs {
  chapterTitle: string
  content: string
}

const tutorPrompts = {
  // ─── 1. 生成 explanation + question ───────────────────────────────────────
  turnSystem:
    '你是一名经验丰富的中文学科私教，正在用苏格拉底式方法带学生逐章精读一篇文档。' +
    '你的输出必须严格符合给定的 JSON Schema：包含 `explanation`（200-400 字的核心讲解，结构清晰、可分点）' +
    '和 `question`（一个开放式引导问题，启发学生思考本章关键观点或后续章节衔接）。' +
    '严禁输出 markdown 代码块、解释性前言、礼貌客套；只输出 JSON。',
  turnUser({
    chapterTitle,
    chapterContent,
    lastAssessment,
    understanding,
    retryOnSameChapter
  }: TurnUserPromptArgs): string {
    const lastEvalLine =
      lastAssessment === null
        ? '（无：本章为首轮）'
        : lastAssessment === 'good'
          ? 'good（学生上一章答得很好，可以适度提高深度）'
          : lastAssessment === 'partial'
            ? 'partial（学生上一章理解有偏差，需要换一个角度再讲一次同一章）'
            : 'confused（学生上一章明显困惑，需要更基础、更直观的讲解）'
    const retryHint = retryOnSameChapter
      ? '\n\n[注意] 这是同一章的二次讲解：请避免重复上一轮表述，换一个切入角度（例如先用一个具体例子，再回到原理），并提出一个更聚焦、更具体的问题。'
      : ''
    return [
      `[当前章节] ${chapterTitle}`,
      `[累计理解度] ${understanding}/100`,
      `[上一轮回答评估] ${lastEvalLine}`,
      '',
      '[章节内容]',
      chapterContent ||
        '（章节内容为空，请基于章节标题和你已知的领域常识进行讲解，但要在 explanation 末尾用一句话提示「文档对此章未提供文本内容」）',
      retryHint,
      '',
      '请按 JSON Schema 输出 `{ explanation, question }`。'
    ].join('\n')
  },

  // ─── 2. 评估用户回答 ──────────────────────────────────────────────────────
  evalSystem:
    '你是一名严格但友善的中文学科评估员，需要根据【当前章节内容】判断【学生对引导问题的回答】属于以下哪一档：' +
    '- good：理解充分、能用自己的话准确复述核心观点或给出合理推论；' +
    '- partial：抓到了部分要点但有偏差 / 遗漏 / 过度泛化；' +
    '- confused：明显答非所问 / 不理解 / 留空 / 与章节内容无关。' +
    '只输出 JSON `{ assessment }`，不要任何额外文字。',
  evalUser({ chapterTitle, chapterContent, question, userAnswer }: EvalUserPromptArgs): string {
    return [
      `[当前章节] ${chapterTitle}`,
      '',
      '[章节内容（节选）]',
      chapterContent || '（无）',
      '',
      `[引导问题] ${question || '（上一轮未记录问题，按学生回答的实质判断即可）'}`,
      '',
      `[学生回答] ${userAnswer || '（学生未回答 / 回答为空）'}`,
      '',
      '请按 JSON Schema 输出 `{ assessment }`。assessment 必须是 "good" / "partial" / "confused" 之一。'
    ].join('\n')
  },

  // ─── 3. 章节级摘要压缩 ────────────────────────────────────────────────────
  chapterSummarySystem:
    '你是一名擅长压缩长文档的中文助手。请把给定章节压缩成不超过 1500 字的中文摘要，' +
    '保留所有核心概念 / 关键术语 / 重要案例 / 主要结论；删除冗余举例与口语化连接词。' +
    '只输出 JSON `{ summary }`，不要 markdown 代码块。',
  chapterSummaryUser({ chapterTitle, content }: ChapterSummaryPromptArgs): string {
    return [
      `[章节标题] ${chapterTitle}`,
      '',
      '[章节原文]',
      content,
      '',
      '请按 JSON Schema 输出 `{ summary }`。'
    ].join('\n')
  }
} as const

export { tutorPrompts }

/**
 * @deprecated 旧占位字符串导出，保留向前兼容；新代码请使用 `tutorPrompts.*`。
 */
export const tutorPrompt = ''
