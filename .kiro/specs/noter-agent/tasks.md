# Implementation Plan: Noter Agent

## Overview

基于 design.md 的 **Skill Router + Tool Layer** 架构落地 5 个 Skill（`/brief` / `/tutor` / `/explain` / `/actions` / `/quiz`）。

实现语言：TypeScript（统一 Node.js 运行时，由 noter-web Next.js 进程承载）。

**部署形态：** agent 核心实现为 monorepo 内部包 `packages/agent-runtime`（与 `packages/api`、`packages/ui` 等同级），由 `apps/noter-web/app/api/ai/chat/stream/route.ts` 通过 `import { runAgent } from '@noter/agent-runtime'` 直接调用、零网络跨服务、整体部署到一台服务器上。Route Handler 极薄（鉴权 + 文档归属/状态校验 + SSE 响应包装）；Skill 路由、Tool 调用、LLM/Embedding/检索、session 状态、SSE event 生成全部由 `packages/agent-runtime` 完成。旧 `apps/noter-agent` 独立 Deno 服务标记为待删除。

**核心约束：**
- 复用 noter-document-management 模块已建好的 `documents` / `document_contents` / `document_chunks` / `document_summaries` 表（只读不写）
- 仅新增 `agent_skill_sessions` 一张表，启用 RLS（`auth.uid() = user_id`）
- 所有 Tool 在 SQL 层强制 `document_id = :currentDocumentId AND user_id = :userId` 谓词
- 所有 Skill 输出必须落到 design 中定义的 `messageType` 之一，前端按 `messageType` 分支渲染

## Tasks

- [ ] 1. 数据层基础设施
  - [ ] 1.1 创建 agent_skill_sessions 表 migration
    - 使用 supabase power 的 apply_migration 执行
    - 字段：id（UUID PK）、user_id（FK→profiles）、document_id（FK→documents）、skill（text）、state（jsonb）、expires_at（timestamptz default now() + 24h）、deleted（int default 0）、created_at、updated_at
    - 索引：`(user_id, document_id, deleted, expires_at)` 复合索引（用于查询活跃 session）；`(skill, expires_at)` 用于过期清理
    - 触发器：`updated_at` 自动更新
    - 软删除约定与 documents 表保持一致
    - _Requirements: 11.1, 11.5_

  - [ ] 1.2 设计并启用 agent_skill_sessions RLS 策略
    - 启用 `auth.uid() = user_id` 的 SELECT/INSERT/UPDATE/DELETE 策略
    - 与 documents 表 RLS 保持一致风格（不在 RLS 中过滤 deleted，业务层处理）
    - 使用 supabase power 的 apply_migration 执行
    - _Requirements: 11.4, 12.1_

  - [ ] 1.3 验证表结构与 RLS 策略
    - 使用 supabase power 的 list_tables / list_extensions 确认表已创建
    - 编写 SQL 集成测试：相同用户可读写自己的 session，不同用户无法读取彼此 session
    - 验证 expires_at 默认值为 now() + 24h
    - _Requirements: 11.4, 11.5, 12.1_

- [ ] 2. monorepo 内部包 `packages/agent-runtime` 项目骨架
  - [ ] 2.1 创建 `packages/agent-runtime/` 目录与 package.json
    - `packages/agent-runtime/package.json`：name `@noter/agent-runtime`、type `module`、private: true、main 指向 `dist/index.js`、export `./src/index.ts`
    - `packages/agent-runtime/tsconfig.json`：继承 monorepo 根 `tsconfig.base.json`
    - 在 `apps/noter-web/package.json` 新增依赖 `"@noter/agent-runtime": "workspace:*"`
    - 创建以下文件占位：
      - `src/index.ts`（导出 runAgent）
      - `src/orchestrator.ts`
      - `src/router/{skill-router.ts,intent.ts}`
      - `src/skills/{registry.ts,types.ts,brief.ts,tutor.ts,explain.ts,actions.ts,quiz.ts}`
      - `src/tools/{summary.ts,outline.ts,chunk-search.ts,session.ts,llm.ts,embedding.ts}`
      - `src/sse/stream.ts`
      - `src/db/client.ts`
      - `src/prompts/{brief.ts,tutor.ts,explain.ts,actions.ts,quiz.ts}`
      - `src/types/{skill.ts,sse.ts,tool.ts,session.ts}`
    - _Requirements: 10.1_

  - [ ] 2.2 配置 agent-runtime 依赖与环境变量
    - 依赖：`@supabase/supabase-js`（与 noter-web 复用同一版本）、`zod`、dev: `vitest` / `fast-check`
    - 环境变量复用 noter-web `.env`：`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `MIMO_API_KEY` / `GEMINI_API_KEY`
    - 不再使用 Deno import map / std 库，TypeScript ESM
    - _Requirements: 10.1_

  - [ ] 2.3 实现 SSE 流式响应封装 `packages/agent-runtime/src/sse/stream.ts`
    - 提供 `createSSEStream()`：返回 `{ stream: ReadableStream<Uint8Array>, send(event), close(), error(err) }`
    - `send(event)` 接收 `SSEEvent`（必含 `event` 字段），序列化为 `data: {json}\n\n` 写入 stream
    - `close()` 输出 `data: [DONE]\n\n` 后关闭流
    - `error(err)` 输出 `event=error` 事件并关闭
    - _Requirements: 10.1, 10.2, 10.7, 10.8_

  - [ ] 2.4 实现对外入口 `runAgent` `packages/agent-runtime/src/index.ts`
    - 签名：`export function runAgent(input: RunAgentInput): RunAgentResult`
    - `RunAgentInput`：`{ userId, documentId, messages, command?, params?, sessionId?, abortSignal? }`
    - `RunAgentResult`：`{ stream: ReadableStream<Uint8Array> }`
    - 内部：创建 SSE stream → 调用 orchestrator → 返回 stream
    - **不**做鉴权或文档归属校验（Route Handler 负责）
    - _Requirements: 10.1_

- [ ] 3. Tool Layer 实现
  - [ ] 3.1 实现 SummaryTool `packages/agent-runtime/src/tools/summary.ts`
    - 方法：`getSummary(documentId, userId)` → 读 `document_summaries`（summary / key_points / keywords / suitable_scenarios / todos）
    - SQL 强制 `document_id = :documentId AND user_id = :userId AND deleted = 0`
    - 返回 `null` 而非抛错（让上层走降级路径）
    - _Requirements: 12.5, 11.7_

  - [ ] 3.2 实现 OutlineTool `packages/agent-runtime/src/tools/outline.ts`
    - 方法：`getOutline(documentId, userId)` → 读 `document_contents.outline`
    - 方法：`getChapterChunks(documentId, userId, headingPath)` → 按 `heading_path` 过滤 `document_chunks`，返回章节内全部分片，按 chunk_index 升序
    - 提供 token 估算辅助：拼接超过 8000 token 时按顺序截断
    - SQL 强制 `document_id` + `user_id` + `deleted = 0` 谓词
    - _Requirements: 12.5, 4.3, 15.2, 11.7_

  - [ ] 3.3 实现 ChunkSearchTool `packages/agent-runtime/src/tools/chunk-search.ts`
    - 方法：`vectorSearch(query, k=5)` / `keywordSearch(query, k=3)` / `hybridSearch(query, k=5)`
    - 每个方法在 SQL WHERE 中强制 `document_id = :currentDocumentId AND user_id = :userId AND deleted = 0`
    - 复用 noter-document-management 的 `hybrid_search` RPC，外层包一层 `document_chunks` 子查询过滤 documentId
    - 返回 `ChunkHit[]`：`{ chunkId, chunkIndex, headingPath, content, score }`
    - 必要时调用 EmbeddingTool 生成 query 向量
    - _Requirements: 12.5, 5.4_

  - [ ] 3.4 实现 SessionTool `packages/agent-runtime/src/tools/session.ts`
    - 方法：`load(sessionId, userId, documentId)` → 校验归属并加载 session；不存在 / 已过期 / 不归属返回 `null`
    - 方法：`upsert(session)` → INSERT 或 UPDATE，自动维护 updated_at
    - 方法：`interrupt(sessionId)` → 单条原子 UPDATE：`SET state = jsonb_set(state, '{status}', '"interrupted"'), expires_at = now() WHERE id = :sessionId`，返回受影响行数；调用方据此判断打断是否成功
    - 所有方法 SQL 含 `user_id = :userId` 谓词
    - _Requirements: 11.1, 11.4, 12.5, 8.2, 8.3, 13.5_

  - [ ] 3.5 实现 LLMTool `packages/agent-runtime/src/tools/llm.ts`
    - 方法：`stream(prompt, opts?)` → SSE 风格 AsyncIterable<chunk>，对接 MiMo LLM
    - 方法：`complete(prompt, opts?)` → 一次性返回完整文本
    - 方法：`completeJson(prompt, schema, opts?)` → 启用 JSON 模式 + Zod schema 校验，不合法时自动重试一次，仍失败抛错
    - 统一处理超时取消（AbortController）
    - _Requirements: 7.5, 7.13, 13.3, 13.4_

  - [ ] 3.6 实现 EmbeddingTool `packages/agent-runtime/src/tools/embedding.ts`
    - 方法：`embed(text)` → 调用 Gemini Embedding（gemini-embedding-2，768 维）
    - 与 vectorize-document Edge Function 复用同一 API 调用约定
    - _Requirements: 5.4_

  - [ ]* 3.7 编写 Tool 层单元测试与属性测试
    - 单元测试：SessionTool interrupt 原子性（受影响行数）、ChunkSearchTool 各方法返回结构、LLMTool completeJson 重试逻辑
    - **Property 3: 同文档作用域强制** —— fast-check fuzz 不同 user_id × document_id 组合，断言所有 Tool 生成的 SQL 都包含 `document_id = :currentDocumentId AND user_id = :userId` 谓词
    - **Property 5: `/explain` 引用片段完整性** —— fuzz `references[i]`，断言 chunkId 真实存在且 headingPath / snippet 与 DB 一致
    - **Property 7（数据完整性铺垫）：** 验证 SummaryTool 读出的 todos 与 DB 一致（为 5.4 actions 测试做准备）
    - **Validates: Requirements 12.5, 5.6**

- [ ] 4. Skill Router 与意图分类
  - [ ] 4.1 实现 SkillRegistry `packages/agent-runtime/src/skills/registry.ts`
    - 显式注册 5 个 SkillManifest（不动态扫描）
    - 字段：name / label / description / multiTurn / launchpadPriority / launchpadIcon / launchpadTagline / requiresParams
    - 优先级：`/brief=1, /tutor=2, /quiz=3, /actions=4, /explain=5`
    - `/explain.requiresParams = true`，其余 false
    - 提供 `getSkill(name)` / `listSkills()` 查询接口
    - _Requirements: 1.5, 1.6, 1.7, 2.3, 5.3_

  - [ ] 4.2 实现 SkillRouter 简化版两级路由 `packages/agent-runtime/src/router/skill-router.ts`
    - 入参：`{ command?, params?, message?, sessionId?, activeSession? }`
    - 第一级：`command` 非空 → 直接选用 command 指定 Skill，返回 `mode='fresh'`
    - 第二级：`activeSession` 存在且 skill ∈ {`/tutor`, `/quiz`} → 直接返回 `mode='resume'`，把用户消息整体作为 params 传给 Skill Handler
    - 兜底：自然语言走关键词 + LLM 兜底意图分类，匹配不到时回落 `/explain`
    - **本期不调用 OnTopic_Classifier、不发送 off_topic_notice 事件、不发送 clarification 事件**
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 2.8_

  - [ ] 4.4 实现慢路径意图分类 `packages/agent-runtime/src/router/intent.ts`
    - 关键词表：`speedy/quick → /brief`、`tutor/teach → /tutor`、`what is X → /explain X`、`todo/actions → /actions`、`quiz/test → /quiz`
    - 关键词无明显命中时 LLM 兜底分类
    - 仍无明显匹配时统一回落到 `/explain`
    - 提取 concept 等参数
    - _Requirements: 14.3, 14.4_

  - [ ] 4.5 实现 Skill_Switch 顺序打断逻辑
    - 在 router 中：第一级 command 命中且存在不同 skill 的 activeSession 时，先调用 `SessionTool.interrupt(activeSession.id)`
    - 必须在 interrupt 返回 affectedRows ≥ 1 之后才执行新 Skill
    - 中途失败：直接返回错误，不启动新 Skill
    - 同时通过 SSE `session_banner` 事件推送 `{ skill: oldSkill, status: 'interrupted' }`
    - 在消息流追加 system 提示「已退出 X，开始新的 Y...」
    - 本期采用顺序约束（先 mark interrupted、后启动新 Skill），**不要求事务原子性**
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 4.6 编写 Router 属性测试
    - **Property 1: Skill Router 显式 command 优先** —— fuzz 同时含 command 和 message 的输入，断言始终选用 command
    - **Property 2: 多轮 session 续签作用域** —— fuzz activeSession 存在 + command 为空，断言 `mode = 'resume'` 且不创建新 session、不调用 OnTopic_Classifier、不发送 off_topic_notice
    - **Property 10: Skill 切换顺序约束** —— 用 fake DB 模拟 SessionTool.interrupt 失败，断言新 Skill 不会被触发；模拟成功，断言执行顺序 interrupt → start
    - 每个属性最少 100 次迭代
    - **Validates: Requirements 14.1, 2.1, 14.2, 8.2, 8.3**

- [ ] 5. Checkpoint - Tool 层与 Router 就绪
  - 确保所有 Tool 单测通过、Router 三级路由可被单独调用
  - 在 `packages/agent-runtime` 内运行单元测试覆盖 Tool 层与 Router；通过 `pnpm --filter @noter/agent-runtime build` 验证 TypeScript 构建无错误
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. 5 个 Skill Handler 实现
  - [ ] 6.1 实现 `/brief` Handler `packages/agent-runtime/src/skills/brief.ts`
    - 检索：仅调用 SummaryTool + OutlineTool，**禁止**调用 ChunkSearchTool 任何方法
    - Prompt 构造：五区块（docType / thesis / chapterMap / audience / readingPath）
    - 输出：通过 SSE 发 `structured_message: BriefCard`，payload 五字段
    - 末尾追加 `follow_ups`：`[开始私教 🎓→/tutor, 提取行动项 ✅→/actions, 考考我 📝→/quiz]`
    - 不写 agent_skill_sessions
    - 降级：summary 缺失 → 读 markdown_content 前 3000 字 + outline，让 LLM 现场提取
    - 超时 15s，超时通过 SSE error 事件返回
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 9.1, 15.1, 15.4_

  - [ ]* 6.2 编写 `/brief` 属性测试
    - **Property 6: `/brief` 不触发向量搜索** —— mock ChunkSearchTool，断言整个 brief 流程中 vectorSearch / hybridSearch / keywordSearch 调用次数 = 0
    - 单元测试：summary 缺失走降级路径、五区块字段必填校验
    - **Validates: Requirements 3.3, 15.1**

  - [ ] 6.3 实现 `/tutor` Handler `packages/agent-runtime/src/skills/tutor.ts`
    - 流程：基于 outline 切章节 → 当前章节调 `OutlineTool.getChapterChunks`（拼接 ≤ 8000 token）→ LLM 出 explanation + question
    - 持久化：每轮 upsert agent_skill_sessions，state 含 status / currentChapterIndex / totalChapters / currentTopic / understanding / exchangeHistory
    - 用户回答评估：good / partial / confused，追加到 exchangeHistory，自动推进章节
    - 每轮先发 `session_banner` 事件 `{ skill: '/tutor', status: 'active', progress: { current, total } }`
    - 输出 `structured_message: TutorTurnCard`：`{ chapterTitle, chapterIndex, totalChapters, explanation, question }`
    - 多轮 Skill 中间轮次**不**发 follow_ups
    - 退出处理：前端确认 → 后端将 state.status='ended' 且 expires_at=now()
    - 降级：outline 缺失 → 按 markdown 字数等分 5 块作为虚拟章节
    - 超时单轮 30s
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.11, 4.12, 10.5, 15.2, 15.7_

  - [ ]* 6.4 编写 `/tutor` 属性测试
    - **Property 12: 多轮 banner 一致性** —— fuzz session 状态序列，断言 SSE session_banner 的 status / progress 与 DB 中 state 一致；status='ended'/'interrupted' 时不再下发 active banner
    - 单元测试：章节推进逻辑、降级路径（outline 缺失）、token 截断
    - **Validates: Requirements 4.5, 7.7, 8.5, 13.5**

  - [ ] 6.5 实现 `/explain` Handler `packages/agent-runtime/src/skills/explain.ts`
    - 缺参数处理（本期简化）：触发 `/explain` 但未附带 concept 参数 → **不**写入 `agent_skill_sessions`、**不**写 pending_skill；直接通过 SSE `content` 事件回复一条文本「想了解哪个概念？请直接输入想了解的概念」；用户下一条消息走正常路径，由意图分类匹配到 `/explain` 并把消息内容当作 concept
    - 检索：EmbeddingTool.embed(concept) → ChunkSearchTool.vectorSearch top-5 + keywordSearch top-3，按 chunkId 去重融合
    - 输出 `structured_message: ExplainCard`：`{ concept, markdown, references[] }`
    - references 每条必须 chunkId 真实存在 + headingPath/snippet 与 DB 一致
    - 末尾追加 `follow_ups`：`[再深一点→/explain, 关联概念有哪些→/explain]`
    - 0 命中降级：LLM 给通用解释 + markdown 中标注「非文档内容」
    - 超时 25s
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 9.2, 15.6_

  - [ ]* 6.6 编写 `/explain` 单元测试
    - 单元测试 1：无 concept 时通过 SSE `content` 文本回复，且**不**创建 agent_skill_sessions 记录
    - 单元测试 2：references 完整性（chunkId / headingPath / snippet 一致）
    - 单元测试 3：0 命中降级路径（LLM 通用解释 + 「非文档内容」标注）

  - [ ] 6.7 实现 `/actions` Handler `packages/agent-runtime/src/skills/actions.ts`
    - 检索：直读 SummaryTool（todos / key_points / keywords）+ OutlineTool 各章首段（chunk_index=0 of each heading_path）
    - **禁止**调用任何向量搜索 / 混合搜索方法
    - 数量约束：`todos.length ≤ summary.todos.length + 20`、`conceptsToLearn.length ≤ 8`、`readingSuggestions.length ≤ 5`
    - 输出 `structured_message: ActionsCard`：纯展示，不勾选、不写回 notes
    - 末尾追加 `follow_ups`：`[考考我 📝→/quiz, 开始私教 🎓→/tutor]`
    - 降级：summary 缺失 → outline + 各章首段让 LLM 现场提取
    - 超时 15s
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 9.3, 15.1, 15.5_

  - [ ]* 6.8 编写 `/actions` 属性测试
    - **Property 7: `/actions` 数据完整性** —— fast-check fuzz 不同 summary.todos 长度，断言输出的 `todos.length ≤ summary.todos.length + 20`、`conceptsToLearn.length ≤ 8`、`readingSuggestions.length ≤ 5`
    - mock 验证：actions 流程中 ChunkSearchTool 任何向量方法调用次数 = 0
    - **Validates: Requirements 6.4, 15.1**

  - [ ] 6.9 实现 `/quiz` Handler `packages/agent-runtime/src/skills/quiz.ts`
    - 三阶段状态机：configuring / answering / graded
    - **configuring**：触发即返回 `structured_message: QuizConfigPrompt`，upsert session.state.status='configuring'
    - **answering**：用户提交 config → 一次性生成 N 题（基于 outline 各章关键内容采样 + 必要时章节级向量搜索）
      - LLMTool.completeJson 严格 JSON Schema 校验：`type ∈ {single, multi, fill, short}`；`options` 当且仅当 `type ∈ {single, multi}` 时存在；`correctAnswer` 类型与 type 匹配
      - 强制 `config.count ≤ 10`；输出 `questions.length === config.count`
      - 返回 `structured_message: QuizGroupCard`，**questions 中不含 correctAnswer**
      - 持久化 questions 到 session.state（保留服务器端 correctAnswer）
      - 发 session_banner `{ skill: '/quiz', status: 'active', progress }`
    - **graded**：用户提交 answers → 一次性评分，返回 `structured_message: QuizResultCard`：`{ results[], score: 0-100 }`
    - JSON 不合法 → LLMTool 自动重试一次，仍失败发 SSE error
    - 超时：出题 45s、评分 30s
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 15.3, 15.8_

  - [ ]* 6.10 编写 `/quiz` 属性测试
    - **Property 8: `/quiz` 题组结构合法性** —— fuzz 各种 config，断言每道 QuizQuestion 满足 type / options / correctAnswer 类型约束
    - **Property 9: `/quiz` 题量上限** —— fuzz `config.count ∈ [1, 100]`，断言最终 `questions.length === min(config.count, 10)` 且超过 10 的请求被拒绝
    - 单元测试：JSON 不合法重试逻辑、状态机推进、QuizGroupCard 不暴露 correctAnswer
    - **Validates: Requirements 7.4, 7.5, 15.3**

- [ ] 7. Checkpoint - agent-runtime 端到端可用
  - 在 `apps/noter-web` 中临时挂一个 dev-only 路由（或 vitest 集成测试），直接 import `runAgent`，跑通 5 个 Skill 的 happy path
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. SSE 协议与 Next.js Route Handler
  - [ ] 8.1 实现 `/api/ai/chat/stream` Route Handler `apps/noter-web/app/api/ai/chat/stream/route.ts`
    - POST 方法接收 `{ documentId, messages, command?, params?, sessionId? }`
    - 鉴权：通过 Supabase Auth 取 user_id
    - **第一步：归属与软删 → 403**：`documents.id = :documentId AND user_id = :userId AND deleted = 0`，失败统一返回 403（脱敏不区分「不存在 / 不属于 / 已软删」三种情况）
    - **第二步：状态 → 422**：仅在第一步通过后执行；`status = 'ready'` 失败时返回 422 + 「文档尚未处理完成」提示。第一步未通过时不得返回 422
    - sessionId 校验：`agent_skill_sessions.id = :sessionId AND user_id = :userId AND document_id = :documentId`，失败静默重置 mode='fresh' 并通过 SSE session_banner 事件 `status='ended'` 让前端隐藏旧 banner
    - 调用 `runAgent({ userId, documentId, messages, command, params, sessionId })`（来自 `@noter/agent-runtime`）；把返回的 `ReadableStream<Uint8Array>` 直接作为 `Response.body` 返回，并设置 `Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`
    - _Requirements: 10.1, 12.1, 12.2, 12.3, 12.4, 12.6, 13.5_

  - [ ] 8.2 实现 `/api/ai/sessions/*` Route Handler
    - `app/api/ai/sessions/route.ts` GET：查询当前用户当前文档的活跃 session（state.status ∈ {'active', 'configuring', 'answering'} 且未过期），返回 `{ session: ... | null }`
    - `app/api/ai/sessions/[id]/route.ts` PATCH：将 state.status 设为 'ended'、expires_at = now()（用于退出按钮）
    - `app/api/ai/sessions/[id]/route.ts` DELETE：软删（deleted=1，用于清理）
    - 所有方法强制 `user_id = auth.uid()` 谓词
    - _Requirements: 4.8, 4.9, 4.10, 11.4, 12.5_

  - [ ] 8.3 实现 SSE 事件包络与序列化
    - agent-runtime 已通过 `runAgent` 返回标准 SSE 流，Route Handler 无需重复封装；只需保证响应头正确
    - 事件 `event` 字段取值约束：`{content, structured_message, follow_ups, session_banner, error, done}`
    - 结构化卡片 `messageType` 取值约束：`{BriefCard, TutorTurnCard, ExplainCard, ActionsCard, QuizConfigPrompt, QuizGroupCard, QuizResultCard}`
    - 终止帧 `data: [DONE]\n\n`
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [ ] 8.4 实现错误处理与降级策略
    - Route Handler 层：未预期异常仅返回 `internal error`，详细堆栈写日志
    - agent-runtime 层：LLM 超时/失败自动重试一次，仍失败发 SSE error 事件后立即结束流
    - document_chunks 为空（/tutor、/explain）：发 SSE error 「文档未完成向量化」
    - document_summaries 缺失（/brief、/actions）：走降级路径，**不**发 error
    - sessionId 加载失败：静默重置 fresh + session_banner status='ended'
    - _Requirements: 12.6, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ]* 8.5 编写 SSE / Route Handler 属性测试
    - **Property 4: 文档归属 403 不泄露与状态 422 顺序约束** —— fuzz 跨用户 documentId × document.status 组合，断言：归属未通过 → 403 不区分三种情况；归属通过但 status≠ready → 422；**422 不会在归属未通过时返回**
    - **Property 13: SSE 事件包络** —— fuzz 各 Skill 输出，断言 JSON 含 `event` 字段且取值在 `{content, structured_message, follow_ups, session_banner, error, done}` 内
    - **Property 14: 结构化卡片消息类型一致** —— fuzz 各 messageType payload，校验对应接口字段约束
    - **Validates: Requirements 12.2, 12.3, 10.2, 10.4**

- [ ] 9. Checkpoint - 后端 SSE 链路就绪
  - 通过 noter-web Route Handler 端到端发起 SSE 请求，5 个 Skill 全部跑通
  - 跨用户访问验证 403
  - sessionId 加载失败验证静默 fresh
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. 前端类型定义与基础设施
  - [ ] 10.1 创建前端类型 `apps/noter-web/types/agent.ts`
    - SkillName / SkillManifest / ChatMessage（含 messageType / payload）
    - 各 Card payload 接口：BriefPayload / TutorTurnPayload / ExplainPayload / ActionsPayload / QuizConfigPayload / QuizGroupPayload / QuizResultPayload
    - SSEEvent 联合类型
    - QuizQuestion 接口（answering 阶段不含 correctAnswer）
    - _Requirements: 10.4_

  - [ ] 10.2 扩展 `apps/noter-web/lib/axios/ai.ts`
    - 新增 `getActiveSession(documentId)` → GET /api/ai/sessions
    - 新增 `endSession(sessionId)` → PATCH /api/ai/sessions/[id]
    - 新增 `clearSession(sessionId)` → DELETE /api/ai/sessions/[id]
    - 保留现有 regenerateSummary / regenerateMindmap 方法
    - _Requirements: 4.8, 4.9_

  - [ ] 10.3 实现 chatSession Zustand store `apps/noter-web/stores/chatSession.ts`
    - 状态：`activeSession`（含 id / skill / state）、`pendingSkill`、`messageList`、`launchpadVisible`
    - 动作：`setActiveSession` / `clearSession` / `appendMessage` / `setPendingSkill` / `resetForLaunchpad`
    - 订阅 SSE `session_banner` 事件自动同步 activeSession status
    - _Requirements: 1.4, 4.5, 5.3, 8.5_

- [ ] 11. 前端 SSE 客户端与卡片基础组件
  - [ ] 11.1 实现 `useChatStream` Hook `apps/noter-web/components/document-detail/sse/useChatStream.ts`
    - 输入：`{ documentId, sessionId? }`
    - 暴露：`{ sendMessage(payload), abort(), state: 'idle'|'streaming'|'error' }`
    - 解析 SSE 事件分发到 chatSession store：content / structured_message / follow_ups / session_banner / error
    - 支持 AbortController 中途中断
    - _Requirements: 10.1, 10.2, 10.8_

  - [ ] 11.2 扩展 `AIChatPanel.tsx` 与 `ChatMessage.tsx`
    - AIChatPanel：根据 `messageList.length === 0` 显隐 SkillLaunchpad；保留 normal / tall / wide 三种尺寸
    - ChatMessage：按 `messageType` 分支渲染（text → markdown；其余 → 对应 Card）
    - 输入框：发送时按 chatSession.activeSession 与 pendingSkill 联动 placeholder（参见 design 中 placeholder 表）
    - 三入口同源：点 SkillLaunchpad 卡 / SlashCommandMenu 选中 / 自然语言提交，最终都构造统一 `{ documentId, messages, command?, params?, sessionId? }` 请求体
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.9_

  - [ ] 11.3 实现 SkillLaunchpad `apps/noter-web/components/document-detail/chat/SkillLaunchpad.tsx`
    - 从 SkillRegistry（前端镜像）读取 manifest 列表
    - 自适应规则：normal → 取 launchpadPriority 最小的 3 张主推卡 + 「更多 ▾」；tall → 单列 5 张；wide → 双列 3+2 网格 5 张
    - 卡片渲染：launchpadIcon + label + launchpadTagline
    - 点击触发：发送 `{ command: <SkillName> }` 等价斜杠命令回车
    - 使用 shadcn skill 查阅组件文档（Card 等）
    - _Requirements: 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1_

  - [ ]* 11.4 编写 SkillLaunchpad 属性测试
    - **Property 11: SkillLaunchpad 自适应展示** —— fast-check fuzz manifest 列表（含 priority 排列）× 面板尺寸 ∈ {normal, tall, wide}，断言：normal → 主推卡数=3 且为 priority 最小 3 个；tall/wide → 主推卡数=5
    - **Validates: Requirements 1.5, 1.6**

- [ ] 12. 前端交互组件
  - [ ] 12.1 实现 SlashCommandMenu `apps/noter-web/components/document-detail/chat/SlashCommandMenu.tsx`
    - 触发：输入框首字符为 `/` 时弹出
    - 位置：输入框上方浮层
    - 内容：列出 5 个 Skill 的 name / label / description / requiresParams 标志
    - 键盘操作：上下方向键移动聚焦项 / Enter 选中并填入命令 / Esc 关闭且不修改输入框
    - requiresParams=true 时光标停在命令尾部等待参数
    - 使用 shadcn skill 查阅组件文档（Command / Popover）
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ] 12.2 实现 SessionBanner `apps/noter-web/components/document-detail/chat/SessionBanner.tsx`
    - 从 chatSession store 订阅 activeSession
    - 渲染规则按 design 表格：`/tutor` 显示「🎓 私教进行中 第 X/Y 章」；`/quiz` 按 status 显示对应文案
    - 点击退出 → AlertDialog 二次确认 → 调用 ai.endSession + chatSession.resetForLaunchpad
    - status='ended'/'interrupted' 时立即隐藏
    - 固定在消息列表顶部（不随消息滚动）
    - 使用 shadcn skill 查阅组件文档（AlertDialog / Card）
    - _Requirements: 4.5, 4.8, 4.9, 4.10, 7.7, 8.5_

  - [ ] 12.3 实现 FollowUpChips `apps/noter-web/components/document-detail/chat/FollowUpChips.tsx`
    - 从 SSE follow_ups 事件 payload 渲染 chip 按钮组
    - 点击 chip 等同触发对应 command（与 SkillLaunchpad 卡片点击行为一致）
    - 使用 shadcn skill 查阅组件文档（Button / Badge）
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 13. 前端 5 类结构化卡片组件
  - [ ] 13.1 实现 BriefCard `apps/noter-web/components/document-detail/chat/cards/BriefCard.tsx`
    - 渲染 BriefPayload 五区块：docType / thesis / chapterMap / audience / readingPath
    - 使用 shadcn skill 查阅组件文档（Card / Badge）
    - _Requirements: 3.4, 10.4_

  - [ ] 13.2 实现 TutorTurnCard `apps/noter-web/components/document-detail/chat/cards/TutorTurnCard.tsx`
    - 渲染 TutorTurnPayload：`{ chapterTitle, chapterIndex, totalChapters, explanation, question }`
    - explanation 用 react-markdown 渲染
    - _Requirements: 4.4, 10.4_

  - [ ] 13.3 实现 ExplainCard `apps/noter-web/components/document-detail/chat/cards/ExplainCard.tsx`
    - 渲染 ExplainPayload：`{ concept, markdown, references[] }`
    - markdown 用 react-markdown 渲染
    - references 折叠区显示 chunkId / headingPath / snippet
    - _Requirements: 5.5, 5.6, 10.4_

  - [ ] 13.4 实现 ActionsCard `apps/noter-web/components/document-detail/chat/cards/ActionsCard.tsx`
    - 渲染 ActionsPayload 三栏：todos / conceptsToLearn / readingSuggestions
    - 仅展示，不勾选 / 不编辑 / 不写回 notes
    - _Requirements: 6.3, 6.5, 10.4_

  - [ ] 13.5 实现 /quiz 三个卡片组件
    - `cards/QuizConfigPrompt.tsx`：结构化表单（题型多选 / 题量 1-10 / 难度单选默认 mixed），提交后发送 `{ command: '/quiz', params: { config } }`
    - `cards/QuizGroupCard.tsx`：渲染 questions 数组，每题独立填写答案，全部作答后一次性提交 `{ command: '/quiz', params: { answers } }`
    - `cards/QuizResultCard.tsx`：渲染 results[] + 0-100 总分 score
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 7.8, 7.9, 10.4_

- [ ] 14. 旧 `apps/noter-agent` Deno 服务移除
  - [ ] 14.1 删除 `apps/noter-agent/` 整个目录
    - 该服务从设计上已被 `packages/agent-runtime` 取代，不再保留
    - 在 monorepo 根 `pnpm-workspace.yaml` 中确认无引用
    - 在 README / 部署文档中删除对该服务的提及
    - _Requirements: 11.7_

  - [ ] 14.2 移除前端对旧 RAG 端点的对接
    - 搜索 noter-web 中对 `apps/noter-agent` HTTP 端点（如 `http://localhost:3002`）的引用并移除
    - 把 `AIChatPanel.tsx` 当前 placeholder 回复切换到真实 SSE 链路（`/api/ai/chat/stream`）
    - 确认 noter-web 编译通过
    - _Requirements: 1.x, 2.x_

- [ ] 15. Checkpoint - 前后端联调
  - 端到端跑通 5 个 Skill 的 happy path（点 SkillLaunchpad / 输入 / 提交）
  - 验证 SkillLaunchpad 三种尺寸自适应
  - 验证 SessionBanner 多轮显隐
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. 集成测试与 E2E
  - [ ]* 16.1 RLS 集成测试 `apps/noter-web/__tests__/integration/agent-skill-sessions-rls.test.ts`
    - 用两个不同用户 A / B 创建 session，断言 A 无法 SELECT B 的 session
    - 断言 RLS 在 INSERT / UPDATE / DELETE 上同样生效
    - **Validates: Requirements 11.4, 12.1**

  - [ ]* 16.2 完整链路集成测试：/tutor 多轮 + 中途打断 + 重启 fresh
    - 步骤 1：触发 /tutor 第 1 章 → DB 出现 active session
    - 步骤 2：续签第 2 章 → mode='resume' 不创建新 session
    - 步骤 3：触发 /quiz → 旧 session.state.status='interrupted' 且 expires_at=now() 必须早于新 quiz session 的 INSERT 时间戳（验证 Property 10 顺序约束）
    - 步骤 4：回到 SkillLaunchpad 重新触发 /tutor → mode='fresh' 新建 session
    - **Validates: Requirements 4.x, 8.x, 14.x**

  - [ ]* 16.3 /quiz 三阶段集成测试
    - configuring → answering：DB 中 state.config 写入正确，questions.length === config.count，questions 中 correctAnswer 仅服务端可见
    - answering → graded：results.length === questions.length，score 在 0-100
    - JSON 不合法注入：mock LLMTool 第一次返回非法 JSON，断言自动重试一次
    - **Validates: Requirements 7.3, 7.4, 7.5, 7.6, 7.9, 7.10, 7.13, 13.4**

  - [ ]* 16.4 FollowUpChips 单元测试
    - 单测 1：chip 触发 command 等同 SkillLaunchpad 卡片点击
    - 单测 2：多轮 Skill 中间轮次不发 follow_ups
    - **Validates: Requirements 9.4, 9.5**

  - [ ]* 16.5 E2E（Playwright）：SkillLaunchpad → /quiz 全流程
    - 打开文档详情页 → 点 SkillLaunchpad 「考考我」卡 → 提交 QuizConfigPrompt → 答题 → 提交 → 看到 QuizResultCard
    - 验证 SessionBanner 在 answering 期间显示「📝 测验进行中」并在 graded 后变为「📝 测验已完成」
    - **Validates: Requirements 1.x, 2.x, 7.x, 10.x**

- [ ] 17. Final Checkpoint - 所有功能模块就绪
  - 所有自动化测试通过
  - 5 个 Skill 端到端流程可用
  - 旧 `apps/noter-agent` Deno 服务已删除
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 标记 `*` 的子任务为可选，可为更快 MVP 跳过；核心实现任务不可跳过
- 实现语言：TypeScript（统一 Node.js 运行时，由 noter-web Next.js 进程承载）
- 部署形态：SSE 端点在 noter-web Route Handler，agent 核心逻辑在 monorepo 内部包 `packages/agent-runtime`
- agent-runtime 与 noter-web 在 Node.js 同进程内，通过 monorepo workspace import 调用
- 仅新增 `agent_skill_sessions` 一张表，复用 noter-document-management 已有的 4 张文档表
- 所有 Tool 在 SQL 层强制 `document_id` + `user_id` 谓词，前端无法跨文档检索
- `/brief` 与 `/actions` 严格不调用任何向量搜索（Property 6 / Property 7 校验）
- 多轮 Skill（`/tutor`、`/quiz`）状态持久化到 `agent_skill_sessions`，支持中途打断与重启
- Skill 切换为顺序约束（先 interrupt 后 start），不要求事务原子性
- UI 组件任务中需使用 shadcn skill 查阅组件文档

## Task Dependency Graph

下方 mermaid 图展示模块级依赖关系（仅可视化），权威调度顺序以 JSON 块为准。

```mermaid
graph LR
    subgraph W0[Wave 0: DB]
        T11[1.1 migration]
        T12[1.2 RLS]
    end
    subgraph W1[Wave 1: 验证 + 骨架]
        T13[1.3 验证]
        T21[2.1 目录]
        T22[2.2 配置]
    end
    subgraph W2[Wave 2: SSE 基础]
        T23[2.3 SSE 封装]
        T24[2.4 runAgent 入口]
    end
    subgraph W3[Wave 3: Tool 层]
        T31[3.1 Summary]
        T32[3.2 Outline]
        T33[3.3 Search]
        T34[3.4 Session]
        T35[3.5 LLM]
        T36[3.6 Embedding]
    end
    subgraph W4[Wave 4: Tool 测试 + Registry]
        T37[3.7* Tool 测试]
        T41[4.1 Registry]
    end
    subgraph W5[Wave 5: Router]
        T42[4.2 Router]
        T44[4.4 Intent]
    end
    subgraph W6[Wave 6: 切换顺序约束 + 测试]
        T45[4.5 Switch]
        T46[4.6* Router 测试]
    end
    subgraph W7[Wave 7: Skill 实现]
        T61[6.1 brief]
        T63[6.3 tutor]
        T65[6.5 explain]
        T67[6.7 actions]
        T69[6.9 quiz]
    end
    subgraph W8[Wave 8: Skill 测试]
        T62[6.2* brief 测试]
        T64[6.4* tutor 测试]
        T66[6.6* explain 测试]
        T68[6.8* actions 测试]
        T610[6.10* quiz 测试]
    end
    subgraph W9[Wave 9: Route Handler]
        T81[8.1 chat/stream]
        T82[8.2 sessions]
        T83[8.3 SSE 包络]
        T84[8.4 错误处理]
    end
    subgraph W10[Wave 10: SSE 测试 + 前端类型]
        T85[8.5* SSE 测试]
        T101[10.1 类型]
        T102[10.2 axios]
        T103[10.3 store]
    end
    subgraph W11[Wave 11: 前端 SSE 客户端]
        T111[11.1 useChatStream]
    end
    subgraph W12[Wave 12: 前端交互]
        T112[11.2 AIChatPanel]
        T113[11.3 SkillLaunchpad]
        T121[12.1 SlashMenu]
        T122[12.2 SessionBanner]
        T123[12.3 FollowUpChips]
    end
    subgraph W13[Wave 13: 卡片 + 测试]
        T114[11.4* Launchpad 测试]
        T131[13.1 BriefCard]
        T132[13.2 TutorTurnCard]
        T133[13.3 ExplainCard]
        T134[13.4 ActionsCard]
        T135[13.5 Quiz 卡片]
    end
    subgraph W14[Wave 14: 清理]
        T141[14.1 删除 noter-agent]
        T142[14.2 前端清理]
    end
    subgraph W15[Wave 15: 集成 / E2E]
        T161[16.1* RLS]
        T162[16.2* 多轮链路]
        T163[16.3* quiz 三阶段]
        T164[16.4* FollowUpChips 测试]
        T165[16.5* E2E]
    end

    W0 --> W1 --> W2 --> W3 --> W4 --> W5 --> W6 --> W7 --> W8
    W7 --> W9 --> W10 --> W11 --> W12 --> W13 --> W14 --> W15
```

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 4, "tasks": ["3.7", "4.1"] },
    { "id": 5, "tasks": ["4.2", "4.4"] },
    { "id": 6, "tasks": ["4.5", "4.6"] },
    { "id": 7, "tasks": ["6.1", "6.3", "6.5", "6.7", "6.9"] },
    { "id": 8, "tasks": ["6.2", "6.4", "6.6", "6.8", "6.10"] },
    { "id": 9, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 10, "tasks": ["8.5", "10.1", "10.2", "10.3"] },
    { "id": 11, "tasks": ["11.1"] },
    { "id": 12, "tasks": ["11.2", "11.3", "12.1", "12.2", "12.3"] },
    { "id": 13, "tasks": ["11.4", "13.1", "13.2", "13.3", "13.4", "13.5"] },
    { "id": 14, "tasks": ["14.1", "14.2"] },
    { "id": 15, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5"] }
  ]
}
```
