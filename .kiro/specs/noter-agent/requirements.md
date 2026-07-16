# Requirements Document

## Introduction

Noter Agent 是 Noter 文档智能阅读系统中的 AI 交互层，作用域固定在「单文档对话」语境（每次会话绑定一个 documentId）。系统采用 Skill Router + Tool Layer 架构，将用户的阅读意图拆分为五个边界明确的 Skill：`/brief`（速览）、`/tutor`（私教）、`/explain`（释疑）、`/actions`（行动项）、`/quiz`（出题）。每个 Skill 拥有独立的触发条件、检索策略、输出契约与多轮状态机。

前端在文档详情页右侧的 AIChatPanel 中承载所有交互：用户首次打开面板即看到 SkillLaunchpad 启动卡，三入口同源（点卡片 / 斜杠命令 / 自然语言）最终都收敛到同一份 SSE 请求体；多轮 Skill 通过 SessionBanner 显示进度并支持中途打断。后端通过 Next.js Route Handler 暴露 SSE 端点 `/api/ai/chat/stream`；agent 核心实现为 monorepo 内部包 `packages/agent-runtime`（TypeScript），由 Route Handler 直接 `import` 调用、零网络跨服务调用，整体部署到一台服务器上。Route Handler 极薄，仅负责鉴权、文档归属与状态校验、SSE Response 包装；Skill 路由、Tool 调用、LLM/Embedding/检索、session 状态读写、SSE event 生成全部由 `packages/agent-runtime` 完成。多轮会话状态持久化在新增的 `agent_skill_sessions` 表中。

本模块复用 noter-document-management 模块已有的 `documents` / `document_contents` / `document_chunks` / `document_summaries` 表（只读不写，沿用各表已有的 `auth.uid() = user_id` RLS），并通过 agent-runtime 的二次校验保证用户数据隔离。新增的 `agent_skill_sessions` 表采用更严格的 **service_role-only RLS**（authenticated / anon 角色无任何权限），前端不得通过 supabase-js 直读，必须经 `/api/ai/sessions` Route Handler 间接访问以保证 correctAnswer 等敏感字段的脱敏。

## Glossary

- **Noter_Agent**: AI 交互层主系统，承载 Skill Router、Tool Layer 与 SSE 流式输出
- **AI_Chat_Panel**: 文档详情页右侧的可伸缩对话面板容器，支持 normal / tall / wide 三种尺寸
- **SkillLaunchpad**: 启动面板，在消息列表为空时展示 5 个 Skill 入口卡，零冷启动入口
- **SlashCommandMenu**: 输入框首字符为 `/` 时弹出的斜杠命令浮层，列出可用 Skill
- **SessionBanner**: 多轮 Skill（`/tutor`、`/quiz`）进行中固定在消息列表顶部的状态栏；`/quiz` configuring 阶段首次 session_banner 含 sessionId 字段，前端据此记录用于后续续签
- **FollowUpChips**: 单轮 Skill 回答末尾追加的「下一步」chip 按钮组
- **SkillManifest**: Skill 的元数据描述对象，包含 name / label / description / multiTurn / launchpadPriority / launchpadIcon / launchpadTagline / requiresParams 字段
- **SkillRouter**: agent-runtime 入口的路由器，按三级优先级（显式 command → 多轮 session 续签 → 自然语言意图分类）映射用户输入到 Skill；本期第二级不调用 OnTopic_Classifier。Router 为纯函数无副作用；Skill_Switch 的 interrupt + banner + 系统提示由 orchestrator 顺序执行
- **Skill_Switch**: 用户在多轮 Skill 进行中触发任意新 Skill 的场景，行为是直接打断旧 session
- **Agent_Runtime**: monorepo 内部包 `packages/agent-runtime`（TypeScript），承载 Skill Router、Skill Handler、Tool Layer、LLM/Embedding/检索、session 状态读写、SSE event 生成；由 Route Handler 直接 `import` 调用，零网络跨服务
- **Brief_Skill**: 文档速览 Skill（`/brief`），单轮，输出五区块结构化卡片
- **Tutor_Skill**: 章节私教 Skill（`/tutor`），多轮苏格拉底式逐章带读
- **Explain_Skill**: 概念释疑 Skill（`/explain`），单轮，需 concept 参数，触发向量召回 + 关键词搜索融合
- **Actions_Skill**: 行动项提取 Skill（`/actions`），单轮，输出三栏（todos / 概念 / 推荐阅读）
- **Quiz_Skill**: 出题考我 Skill（`/quiz`），三阶段（configuring → answering → graded）
- **BriefCard**: `/brief` 输出的结构化卡片，含 docType / thesis / chapterMap / audience / readingPath
- **TutorTurnCard**: `/tutor` 单轮输出，含章节标题 / 核心讲解 / 引导提问
- **ExplainCard**: `/explain` 输出，含 markdown 解释与 ReferenceList 折叠区
- **ActionsCard**: `/actions` 输出，三栏纯展示（不可勾选、不写回）
- **QuizConfigPrompt**: `/quiz` 第一阶段的配置表单卡片（题型 / 题量 / 难度）
- **QuizGroupCard**: `/quiz` 第二阶段一次性返回的题组答题卡
- **QuizResultCard**: `/quiz` 第三阶段一次性返回的评分与解析卡
- **agent_skill_sessions**: 多轮 Skill 会话持久化表（id / user_id / document_id / skill / state / expires_at / deleted / 时间戳）
- **SSE**: Server-Sent Events 流式协议，端点 `POST /api/ai/chat/stream`，事件类型集合为 `{content, structured_message, follow_ups, session_banner, error}`；流式响应以 `data: [DONE]\n\n` 终止帧结束，该终止帧不是 SSE event、不列入事件清单
- **Tool_Layer**: 位于 `packages/agent-runtime/src/tools/` 的薄封装层，包含 SummaryTool / OutlineTool / ChunkSearchTool / SessionTool / LLMTool / EmbeddingTool，是 Skill Handler 与外部能力之间的唯一访问通道
- **RLS_Policy**: Supabase 行级安全策略，确保 `auth.uid() = user_id` 数据隔离；agent_skill_sessions 表为特殊隔离：仅 service_role 可读写，authenticated 角色无任何权限，避免前端绕过后端脱敏直读 correctAnswer

## Requirements

### 需求 1：Chat Panel 容器与启动入口

**用户故事：** 作为已登录用户，我希望在打开文档详情页的对话面板时立刻看到结构化的 Skill 入口，以便在没有阅读文档的情况下也能立即选择阅读路径，零冷启动地开启对话。

#### 验收标准

1. THE AI_Chat_Panel SHALL 沿用文档管理模块已有的三种尺寸：normal（默认窄、单列）、tall（向上拉长、单列、覆盖元数据）、wide（双列、隐藏元数据与大纲）
2. WHILE 当前对话消息列表为空, THE AI_Chat_Panel SHALL 在消息列表区域内嵌展示 SkillLaunchpad 启动面板
3. WHEN 用户发送任意消息, THE AI_Chat_Panel SHALL 立即隐藏 SkillLaunchpad 并改为展示消息流
4. WHEN 用户清空当前会话或重新打开面板且消息列表为空, THE AI_Chat_Panel SHALL 重新显示 SkillLaunchpad
5. WHERE 面板尺寸为 normal, THE SkillLaunchpad SHALL 仅展示 launchpadPriority 最小的 3 张主推卡，其余 Skill 折叠到「更多 ▾」展开区
6. WHERE 面板尺寸为 tall 或 wide, THE SkillLaunchpad SHALL 一次性展示全部 5 张 Skill 入口卡
7. THE SkillLaunchpad SHALL 为每张卡渲染 launchpadIcon（emoji）、Skill 标题（label）和 launchpadTagline（一句话价值描述）
8. WHEN 用户点击 SkillLaunchpad 中任意一张 Skill 卡, THE AI_Chat_Panel SHALL 触发对应 Skill，等价于在输入框输入对应斜杠命令后回车
9. THE Noter_Agent SHALL 确保所有新增的交互 UI（SkillLaunchpad / SlashCommandMenu / SessionBanner / FollowUpChips / 结构化卡片）仅在 AIChatPanel 内部渲染，且不在文档详情页其他位置（左侧大纲 / 右侧元数据 / 正文区）出现 agent 相关入口

### 需求 2：三入口同源与斜杠命令浮层

**用户故事：** 作为已登录用户，我希望通过点击启动卡、输入斜杠命令或自然语言任意一种方式都能调用 Skill，以便按当下的输入习惯灵活选择。

#### 验收标准

1. WHEN 用户点击 SkillLaunchpad 卡片, THE AI_Chat_Panel SHALL 向 SSE 端点提交 `{ command: <SkillName> }`，不附带自然语言 message
2. WHEN 用户在输入框首字符输入 `/`, THE AI_Chat_Panel SHALL 在输入框上方弹出 SlashCommandMenu 浮层
3. THE SlashCommandMenu SHALL 列出全部 5 个 Skill 的 name、label、description 和 requiresParams 标志
4. WHEN 用户在 SlashCommandMenu 浮层中按上下方向键, THE SlashCommandMenu SHALL 在候选列表中切换聚焦项
5. WHEN 用户在 SlashCommandMenu 浮层聚焦某项后按 Enter, THE SlashCommandMenu SHALL 关闭浮层并将该 Skill 命令填入输入框
6. WHEN 用户按 Esc 键, THE SlashCommandMenu SHALL 立即关闭且不修改输入框内容
7. IF 选中 Skill 的 requiresParams 为 true, THEN THE AI_Chat_Panel SHALL 在命令填入后保留光标在命令尾部，等待用户继续输入参数
8. WHEN 用户提交不含 `/` 前缀的自然语言消息, THE Noter_Agent SHALL 走慢路径意图分类，将消息映射到 5 个 Skill 中的一个并执行
9. THE AI_Chat_Panel SHALL 确保点卡片 / 斜杠命令 / 自然语言三种入口最终向 SSE 端点提交的请求体均符合 `{ documentId, messages, command?, params?, sessionId? }` 同一格式
10. THE Noter_Agent SHALL 在 Route Handler 完成鉴权与归属/状态校验后，将上述请求体直接转交给 `packages/agent-runtime` 的 `runAgent({...})` 函数，由 agent 内部 Skill Router 决定具体 Skill 路由

### 需求 3：`/brief` 文档速览 Skill

**用户故事：** 作为已登录用户，我希望在 30 秒内速览一篇文档的骨架与定位，以便决定是否值得深读以及采用哪种阅读路径。

#### 验收标准

1. WHEN 用户通过 SkillLaunchpad 主推卡、SlashCommandMenu 选择 `/brief`，或输入「速览」「快速了解」「这是什么」「先看看」「简介」「brief」等关键词, THE Noter_Agent SHALL 触发 Brief_Skill
2. THE Brief_Skill SHALL 从 `document_summaries`（summary / key_points / keywords / suitable_scenarios）和 `document_contents.outline` 直读结构化字段构造 prompt
3. THE Brief_Skill SHALL 不调用 ChunkSearchTool 的任何向量搜索或混合搜索方法
4. THE Brief_Skill SHALL 输出一条 messageType 为 BriefCard 的 structured_message，payload 包含五个字段：docType（文档类型）、thesis（核心主张，一句话）、chapterMap（章节地图，取 outline 前两层）、audience（适合谁读）、readingPath（推荐阅读路径，取值为 sequential / skim / deep_dive 之一）
5. THE Brief_Skill SHALL 在 BriefCard 输出完成后追加一条 follow_ups 事件，chips 数组包含 `开始私教 🎓`、`提取行动项 ✅`、`考考我 📝` 三个建议，分别指向 `/tutor`、`/actions`、`/quiz`
6. THE Brief_Skill SHALL 在单次响应内完成（不写入 agent_skill_sessions、无后续轮次）
7. IF `document_summaries` 记录缺失或核心字段为空, THEN THE Brief_Skill SHALL 走降级路径，调用 `OutlineTool.getMarkdownPrefix(documentId, 3000)` 读 `document_contents.markdown_content` 前 3000 字加 outline 让 LLM 现场提取，且不向前端返回错误
8. IF Brief_Skill 整体处理超过 15 秒未完成, THEN THE Noter_Agent SHALL 取消请求并通过 SSE error 事件返回超时错误码

### 需求 4：`/tutor` 章节私教 Skill

**用户故事：** 作为已登录用户，我希望由 AI 像私教一样带我逐章读完一篇文档，每章先讲核心、再用问题检验我的理解，以便扎实地掌握文档内容。

#### 验收标准

1. WHEN 用户通过 SkillLaunchpad 主推卡、SlashCommandMenu 选择 `/tutor`，或输入「教我」「私教」「带我读」「逐章讲」「给我讲讲」「学一遍」「tutor」等关键词, THE Noter_Agent SHALL 触发 Tutor_Skill
2. THE Tutor_Skill SHALL 基于 `document_contents.outline` 切分章节列表，每轮聚焦当前章节
3. THE Tutor_Skill SHALL 在每轮按当前章节的 heading_path 过滤 `document_chunks`；若章节内 chunks 拼接 token ≤ 8000 则全量使用，超长则采用代表性采样策略（章首段 + 章末段 + 中间等距抽样），仍超长则对中间部分调用 LLM 摘要压缩，确保最终 prompt 总 token ≤ 8000
4. THE Tutor_Skill SHALL 输出一条 messageType 为 TutorTurnCard 的 structured_message，payload 包含 chapterTitle、chapterIndex、totalChapters、explanation（200-400 字核心讲解）和 question（一道引导问题）
5. WHEN Tutor_Skill 当前轮次开始, THE Noter_Agent SHALL 通过 SSE session_banner 事件向前端推送 `{ skill: '/tutor', status: 'active', progress: { current, total } }`，其中 current 为当前章节序号、total 为总章节数
6. THE Tutor_Skill SHALL 将会话状态持久化到 agent_skill_sessions 表，state 字段包含 status、currentChapterIndex、totalChapters、currentTopic、understanding（0-100）、exchangeHistory
7. WHEN 用户回答 Tutor_Skill 当前轮提问, THE Tutor_Skill SHALL 评估回答（good / partial / confused）并追加到 exchangeHistory，然后进入下一章节
8. WHEN 用户点击 SessionBanner 中的退出按钮, THE AI_Chat_Panel SHALL 弹出二次确认对话框
9. WHEN 用户在退出确认对话框中点击确认, THE Tutor_Skill SHALL 将对应 agent_skill_sessions 记录的 state.status 设为 ended、expires_at 设为当前时间，并由前端将消息列表重置为空状态恢复 SkillLaunchpad
10. WHEN 用户在退出确认对话框中点击取消, THE AI_Chat_Panel SHALL 关闭对话框并保持当前 session 不变
11. IF Tutor_Skill 单轮处理超过 30 秒未完成, THEN THE Noter_Agent SHALL 取消请求并通过 SSE error 事件返回超时错误码
12. IF `document_contents.outline` 缺失或为空, THEN THE Tutor_Skill SHALL 走降级路径，按 markdown 字数等分为 5 块作为虚拟章节继续执行

### 需求 5：`/explain` 概念释疑 Skill

**用户故事：** 作为已登录用户，我希望针对文档中出现的某个概念让 AI 给出基于文档原文的解释和引用，以便准确理解概念的本意而不是被泛泛通用解释误导。

#### 验收标准

1. WHEN 用户通过 SlashCommandMenu 选择 `/explain` 并附带 concept 参数（如 `/explain 依赖倒置`）, THE Noter_Agent SHALL 直接以 concept 为参数触发 Explain_Skill
2. WHEN 用户输入「什么是 X」「X 是什么意思」「解释一下 X」「啥是 X」等关键句式, THE Noter_Agent SHALL 提取 X 作为 concept 参数触发 Explain_Skill
3. IF 用户触发 `/explain` 但未附带 concept 参数, THEN THE Explain_Skill SHALL 通过 SSE `content` 事件直接回复一条文本「想了解哪个概念？请直接输入想了解的概念」，且不创建任何 agent_skill_sessions 记录、不写入 pending_skill；用户的下一条消息走正常路径，由意图分类匹配到 `/explain` 并将消息内容作为 concept 参数
4. THE Explain_Skill SHALL 对 concept 调用 EmbeddingTool 生成向量，再在当前 documentId 范围内执行向量搜索 top-5 加关键词搜索 top-3，按 chunkId 去重融合
5. THE Explain_Skill SHALL 输出一条 messageType 为 ExplainCard 的 structured_message，payload 包含 concept、markdown（100-300 字解释）和 references 数组
6. THE Explain_Skill SHALL 确保 references 中每条记录包含真实存在的 chunkId、与 chunkId 匹配的 headingPath 和 snippet
7. THE Explain_Skill SHALL 在 ExplainCard 输出完成后追加一条 follow_ups 事件，chips 数组包含 `再深一点`、`关联概念有哪些` 两个建议
8. THE Explain_Skill SHALL 在单次响应内完成（不写入 agent_skill_sessions 的多轮 state）
9. IF concept 检索 0 命中, THEN THE Explain_Skill SHALL 由 LLM 给出通用解释，并在 markdown 中显式标注「非文档内容」字样
10. IF Explain_Skill 整体处理超过 25 秒未完成, THEN THE Noter_Agent SHALL 取消请求并通过 SSE error 事件返回超时错误码

### 需求 6：`/actions` 行动项提取 Skill

**用户故事：** 作为已登录用户，我希望读完文档后立即获得「我应该做什么、还要学什么、可以再读什么」的清单，以便把阅读转化为具体行动。

#### 验收标准

1. WHEN 用户通过 SlashCommandMenu 选择 `/actions`、点击 SkillLaunchpad 卡，或输入「我读完了」「接下来做什么」「行动项」「待办」「下一步」「todo」「actions」等关键词, THE Noter_Agent SHALL 触发 Actions_Skill
2. THE Actions_Skill SHALL 直读 `document_summaries`（summary / key_points / keywords / suitable_scenarios / todos）、`document_contents.outline` 与 `document_chunks` 章首段（按 chunk_index = 0 of each heading_path）；**不**对 `summary.todos` 做强依赖——`summary.todos` 缺失或为空时仍走正常路径，从可用结构化字段现场提取
3. THE Actions_Skill SHALL 输出一条 messageType 为 ActionsCard 的 structured_message，payload 包含三个数组：todos、conceptsToLearn、readingSuggestions
4. THE Actions_Skill SHALL 限制 `todos.length ≤ 20`、`conceptsToLearn.length ≤ 8`、`readingSuggestions.length ≤ 5`
5. THE ActionsCard SHALL 仅作纯展示，不提供勾选 / 编辑 / 写回 notes 的交互
6. THE Actions_Skill SHALL 在 ActionsCard 输出完成后追加一条 follow_ups 事件，chips 数组包含 `考考我 📝`、`开始私教 🎓` 两个建议
7. THE Actions_Skill SHALL 在单次响应内完成（不写入 agent_skill_sessions）
8. IF `document_summaries` 整条记录缺失, THEN THE Actions_Skill SHALL 读取 outline 加各章首段由 LLM 现场提取；本路径与 todos 缺失路径同等对待，且不向前端发送 SSE error
9. IF Actions_Skill 整体处理超过 15 秒未完成, THEN THE Noter_Agent SHALL 取消请求并通过 SSE error 事件返回超时错误码

### 需求 7：`/quiz` 出题考我 Skill 三阶段

**用户故事：** 作为已登录用户，我希望由 AI 根据文档自动出一组题目让我作答并给出评分解析，以便检验自己对文档的掌握程度。

#### 验收标准

1. WHEN 用户通过 SlashCommandMenu 选择 `/quiz`、点击 SkillLaunchpad 卡，或输入「考考我」「测试」「出题」「测一下」「来道题」「考试」「quiz」等关键词, THE Quiz_Skill SHALL 进入 configuring 阶段并立即返回一条 messageType 为 QuizConfigPrompt 的 structured_message
2. WHEN Quiz_Skill 首次进入 configuring 阶段, THE Noter_Agent SHALL 创建新的 agent_skill_sessions 记录（status='configuring'）并通过 SSE `session_banner` 事件向前端投递新建的 sessionId（payload 含 `sessionId` 字段），前端必须在 chatSession store 中立即记录该 sessionId，后续所有 `/quiz` 提交均必须携带此 sessionId 续签
3. THE QuizConfigPrompt SHALL 在前端渲染为结构化表单，包含题型多选（single / multi / fill / short）、题量数字输入（取值范围 1-10）和难度单选（recall / understand / apply / mixed，默认 mixed）
4. WHEN 用户提交 QuizConfigPrompt 表单, THE AI_Chat_Panel SHALL 向 SSE 端点提交携带 `sessionId`（来自 configuring 阶段返回的 banner）、不携带 `command` 的请求；SkillRouter 据此走第二级续签（mode='resume'），Quiz_Skill 进入 answering 阶段、将 config 写入 agent_skill_sessions.state.config 并一次性生成全部题目
5. THE Quiz_Skill SHALL 在进入 answering 阶段前对 config.count 做严格校验：**必须是 [1, 10] 闭区间内的整数**，否则立即通过 SSE error 事件拒绝整个请求并结束流，不进入 LLM 出题；通过校验后最终生成的 questions.length 必须等于 config.count，不允许隐式截断或补全
6. THE Quiz_Skill SHALL 确保每道生成的 QuizQuestion 满足：type ∈ {single, multi, fill, short}；options 字段当且仅当 type ∈ {single, multi} 时存在；correctAnswer 类型与 type 匹配（single → string；multi → string[]；fill / short → string）
7. THE Quiz_Skill SHALL 输出一条 messageType 为 QuizGroupCard 的 structured_message，payload 中的 questions 数组**必须**剥离每道题的 correctAnswer 字段；correctAnswer 仅保留在 agent_skill_sessions.state.questions 中、对前端永不可见
8. WHEN 用户通过 sessionId 恢复 `/quiz` 会话, THE Noter_Agent SHALL 从 agent_skill_sessions 读取完整 state、对 questions 数组执行 correctAnswer 脱敏、再以 QuizGroupCard 形式投递前端；任何路径下前端都不得读取 correctAnswer
9. WHEN 进入 answering 阶段, THE Noter_Agent SHALL 通过 SSE session_banner 事件向前端推送 `{ skill: '/quiz', status: 'active', progress: { current, total } }`，其中 progress 反映用户已作答题数与总题数
10. THE QuizGroupCard SHALL 允许用户对每题独立填写答案，并在全部作答后一次性提交到 SSE 端点
11. WHEN 用户提交全部答案, THE AI_Chat_Panel SHALL 向 SSE 端点提交携带 `sessionId`、不携带 `command` 的请求；SkillRouter 走第二级续签，Quiz_Skill 进入 graded 阶段、用 agent_skill_sessions 完整 state 比对生成评分、一次性返回一条 messageType 为 QuizResultCard 的 structured_message，payload 包含 results 数组（每项含 questionIndex、correct、explanation）和 0-100 的 score 总分
12. THE Quiz_Skill SHALL 将 questions、userAnswers、gradingResult 持久化到 agent_skill_sessions.state
13. IF Quiz_Skill 出题阶段（一次性生成 N 题）超过 45 秒未完成, THEN THE Noter_Agent SHALL 取消请求并通过 SSE error 事件返回超时错误码
14. IF Quiz_Skill 评分阶段（一次性评 N 题）超过 30 秒未完成, THEN THE Noter_Agent SHALL 取消请求并通过 SSE error 事件返回超时错误码
15. IF Quiz_Skill 出题或评分阶段 LLM 输出 JSON 不合法, THEN THE Quiz_Skill SHALL 自动重试一次，仍失败则通过 SSE error 事件返回错误码

### 需求 8：Skill 切换打断处理

**用户故事：** 作为已登录用户，我希望在多轮 Skill 进行中可以直接切换到另一个 Skill 而不被多余的确认打扰，以便快速调整阅读策略。

#### 验收标准

1. WHEN 当前存在活跃的 `/tutor` 或 `/quiz` session 且用户通过点击 SkillLaunchpad 卡、SlashCommandMenu 选择或强意图自然语言触发任意新 Skill, THE Noter_Agent SHALL 直接执行 Skill_Switch，不弹出二次确认
2. WHEN 执行 Skill_Switch, THE Noter_Agent 的 orchestrator SHALL 先在数据库中将旧 session 的 state.status 设为 `interrupted` 且 expires_at 设为当前时间，然后才启动新 Skill 生成响应（顺序约束）。SkillRouter 不直接执行 interrupt 副作用，仅在 RouteDecision 中标记 `switchFromSession`，由 orchestrator 顺序编排
3. THE Noter_Agent SHALL 保证 Skill_Switch 的顺序约束由 orchestrator 而非 SkillRouter 执行；SkillRouter 保持纯函数语义（仅输出 RouteDecision，无 DB 写、无 SSE 推送）。本期不要求事务原子性
4. WHEN Skill_Switch 完成, THE AI_Chat_Panel SHALL 在消息流中追加一条系统提示消息，文本格式为「已退出 <旧 Skill 标签>，开始新的 <新 Skill 标签>...」
5. WHEN Skill_Switch 完成, THE Noter_Agent SHALL 通过 SSE session_banner 事件向前端推送旧 session 的 status = interrupted，使 SessionBanner 立即隐藏旧进度

### 需求 9：FollowUpChips 建议下一步

**用户故事：** 作为已登录用户，我希望在单轮 Skill 回答末尾看到推荐的下一步操作，以便顺畅地连续使用多个 Skill。

#### 验收标准

1. WHEN Brief_Skill 完成 BriefCard 输出, THE Noter_Agent SHALL 通过 SSE follow_ups 事件追加 chips：`{ label: '开始私教 🎓', command: '/tutor' }`、`{ label: '提取行动项 ✅', command: '/actions' }`、`{ label: '考考我 📝', command: '/quiz' }`
2. WHEN Explain_Skill 完成 ExplainCard 输出, THE Noter_Agent SHALL 通过 SSE follow_ups 事件追加 chips：`{ label: '再深一点', command: '/explain' }`、`{ label: '关联概念有哪些', command: '/explain' }`
3. WHEN Actions_Skill 完成 ActionsCard 输出, THE Noter_Agent SHALL 通过 SSE follow_ups 事件追加 chips：`{ label: '考考我 📝', command: '/quiz' }`、`{ label: '开始私教 🎓', command: '/tutor' }`
4. WHEN 用户点击 FollowUpChips 中任意 chip, THE AI_Chat_Panel SHALL 触发该 chip 对应的 command，等价于 SkillLaunchpad 卡片点击行为
5. THE Noter_Agent SHALL 不在多轮 Skill（`/tutor`、`/quiz`）的中间轮次发送 follow_ups 事件

### 需求 10：SSE 流式协议

**用户故事：** 作为前端开发者，我希望与 agent 的所有交互通过统一的 SSE 协议进行，以便单一连接承载文本流、结构化卡片与状态变化等多类事件。

#### 验收标准

1. THE Noter_Agent SHALL 在 `POST /api/ai/chat/stream` 端点接收形如 `{ documentId, messages, command?, params?, sessionId? }` 的请求体，并以 `Content-Type: text/event-stream` 响应
2. THE Noter_Agent SHALL 在响应流中以 `data: {json}\n\n` 逐行输出事件，每个事件 JSON 必须包含 `event` 字段，取值在集合 `{content, structured_message, follow_ups, session_banner, error}` 内
3. WHEN Noter_Agent 输出文本流式片段, THE Noter_Agent SHALL 使用 event = content 且 data 形如 `{ content: string }`
4. WHEN Noter_Agent 输出结构化卡片, THE Noter_Agent SHALL 使用 event = structured_message 且 data 形如 `{ messageType, payload }`，其中 messageType 取值在集合 `{BriefCard, TutorTurnCard, ExplainCard, ActionsCard, QuizConfigPrompt, QuizGroupCard, QuizResultCard}` 内
5. WHEN Noter_Agent 推送多轮 session 状态变化, THE Noter_Agent SHALL 使用 event = session_banner 且 data 形如 `{ skill, status, progress?, sessionId? }`，其中 status ∈ `{active, ended, interrupted}`；configuring 阶段首次推送 session_banner 时 SHALL 包含 sessionId 字段供前端记录
6. WHEN Noter_Agent 推送 follow-up 建议, THE Noter_Agent SHALL 使用 event = follow_ups 且 data 形如 `{ chips: { label, command, params? }[] }`
7. WHEN Noter_Agent 任意阶段失败, THE Noter_Agent SHALL 使用 event = error 且 data 形如 `{ error, code? }` 之后立即结束流
8. THE Noter_Agent SHALL 在每次完整响应结束输出 `data: [DONE]\n\n` 作为流式协议的终止帧；该终止帧不是 SSE event，**不**列入事件清单

### 需求 11：会话状态持久化

**用户故事：** 作为已登录用户，我希望多轮 Skill 的进度被持久化保存，以便在网络中断或刷新页面后能够恢复对话。

#### 验收标准

1. THE Noter_Agent SHALL 创建 agent_skill_sessions 表，字段包含 id（UUID 主键）、user_id（外键到 profiles）、document_id（外键到 documents）、skill（文本）、state（JSONB）、expires_at（timestamptz）、deleted（int 取值 0 或 1）、created_at（timestamptz）、updated_at（timestamptz）
2. WHERE skill 为 `/tutor`, THE state 字段 SHALL 包含 status、currentChapterIndex、totalChapters、currentTopic、understanding、exchangeHistory
3. WHERE skill 为 `/quiz`, THE state 字段 SHALL 包含 status（取值 configuring / answering / graded / ended / interrupted）、config、questions、userAnswers、gradingResult；其中 state.questions[i].correctAnswer 仅在数据库与服务端运行时存在，前端 SSE 投递前必须脱敏（QuizGroupCard payload 不含 correctAnswer）
4. THE RLS_Policy SHALL 在 agent_skill_sessions 表上启用 RLS（`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`），并满足三重隔离约束：(a) 仅 service_role 角色可访问；(b) 不为 authenticated / anon 角色创建任何 policy 且显式 `REVOKE ALL ON TABLE agent_skill_sessions FROM authenticated, anon`；(c) 前端不得通过 supabase-js 客户端直查该表，必须经 `/api/ai/sessions` Route Handler 间接访问，由后端用 service_role 读取并脱敏 `state.questions[i].correctAnswer` 后投递
5. THE Noter_Agent SHALL 在创建 agent_skill_sessions 记录时将 expires_at 默认设为当前时间加 24 小时
6. THE Noter_Agent SHALL 通过定时任务每日扫描 `expires_at < now() AND deleted = 0` 的记录并将 deleted 置为 1（软删）
7. THE Noter_Agent SHALL 复用 noter-document-management 模块已有的 documents、document_contents、document_chunks、document_summaries 表，且仅做只读访问，不向这四张表执行 INSERT / UPDATE / DELETE

### 需求 12：权限与作用域校验

**用户故事：** 作为已登录用户，我希望 agent 严格限定在我自己的文档范围内工作，以便保证数据隔离与安全。

#### 验收标准

1. WHEN 请求到达 `/api/ai/chat/stream` Route Handler, THE Noter_Agent SHALL 通过 Supabase Auth 取得当前 user_id，并按以下顺序执行权限校验
2. THE Noter_Agent SHALL 首先校验 `documents.id = :documentId AND documents.user_id = :userId AND documents.deleted = 0`，校验未通过时统一返回 403 Forbidden 响应，且响应体不区分「文档不存在」「不属于该用户」「已软删」三种情况
3. IF 第一步归属校验通过且 `documents.status ≠ 'ready'`, THEN THE Noter_Agent SHALL 返回 422 状态码与「文档尚未处理完成」提示。第一步未通过时不得返回 422，避免泄露文档存在性
4. WHEN 请求体中 sessionId 字段非空, THE Noter_Agent SHALL 校验 `agent_skill_sessions.id = :sessionId AND agent_skill_sessions.user_id = :userId AND agent_skill_sessions.document_id = :documentId`；对 `/api/ai/sessions` 端点：GET 必须接收 `documentId` 查询参数（缺失返回 400）并执行需求 12.2 / 12.3 的两步校验，PATCH 与 DELETE 必须通过 sessionId 反查 document_id 后执行同样的两步校验。校验失败时静默重置为 mode = fresh 并通过 SSE session_banner 事件让前端隐藏旧 banner
5. THE Tool_Layer 中的 ChunkSearchTool、OutlineTool、SummaryTool SHALL 在执行的每条 SQL 中强制包含 `document_id = :currentDocumentId AND user_id = :userId` 谓词；其中 ChunkSearchTool 的 hybridSearch 通过**新增的** `hybrid_search_scoped(p_query_text, p_query_embedding, p_match_count, p_user_id, p_document_id)` RPC 调用，user_id / document_id 过滤在 RPC 函数内部强制执行（WHERE `user_id = p_user_id AND document_id = p_document_id AND deleted = 0`），不依赖调用方添加外层子查询；旧的 `hybrid_search` RPC 不做改动，继续服务于 noter-document-management 模块的全库搜索
6. IF Noter_Agent 内部抛出未预期的异常, THEN THE Noter_Agent SHALL 仅向前端返回 `internal error` 字样，详细堆栈仅写入服务端日志

### 需求 13：错误处理与降级

**用户故事：** 作为已登录用户，我希望即使部分上游数据缺失或 LLM 出错，也能尽可能拿到可用结果，以便不被偶发故障打断阅读流程。

#### 验收标准

1. IF `document_summaries` 记录缺失, THEN THE Brief_Skill 与 Actions_Skill SHALL 走需求 3.7 / 6.8 定义的降级路径，且不向前端发送 SSE error 事件
2. IF `document_chunks` 在当前 documentId 下为空, THEN THE Tutor_Skill 与 Explain_Skill SHALL 通过 SSE error 事件返回「文档未完成向量化」提示
3. IF LLM 调用超时或返回失败, THEN THE Noter_Agent SHALL 自动重试一次，重试仍失败时通过 SSE error 事件返回错误码并立即结束流
4. IF Quiz_Skill 出题或评分阶段的 LLM 输出 JSON 不合法, THEN THE Quiz_Skill SHALL 自动重试一次，重试仍不合法时通过 SSE error 事件返回错误码并立即结束流
5. IF 通过 sessionId 加载 agent_skill_sessions 失败（记录不存在或已过期）, THEN THE Noter_Agent SHALL 静默重置为 mode = fresh，并通过 SSE session_banner 事件向前端推送 status = ended 使 SessionBanner 隐藏

### 需求 14：意图分类与 Skill Router

**用户故事：** 作为已登录用户，我希望系统能正确路由我的输入到合适的 Skill，以便不需要每次都使用斜杠命令。

#### 验收标准

1. WHEN 请求体中 command 字段非空, THE SkillRouter SHALL 直接选用 command 指定的 Skill 并返回 mode = fresh，不进入意图分类与多轮续签判断。SkillRouter 是纯函数，仅基于输入返回 `{ skill, params, mode, switchFromSession? }`；副作用（SessionTool.interrupt、SSE session_banner 推送、系统提示注入、Skill 启动）由 orchestrator 编排
2. WHEN command 字段为空且当前存在活跃的 `/tutor` 或 `/quiz` session, THE SkillRouter SHALL 直接返回 mode = resume，将用户消息整体作为 params 传给当前 Skill Handler，不调用 OnTopic_Classifier、不发送 off_topic_notice 事件
3. WHEN command 字段为空且无活跃多轮 session, THE SkillRouter SHALL 调用慢路径意图分类（关键词匹配加 LLM 兜底），并返回映射到的 SkillName 与提取出的参数
4. THE SkillRouter SHALL 在慢路径分类无明显匹配（关键词与 LLM 均未给出明确 SkillName）时按以下顺序回落：(a) 优先回落到 `general_qa`（普通文档 RAG QA）；(b) 若 `general_qa` Skill 在 SkillRegistry 中未注册（本期未实现），回落到 `/brief`
5. THE SkillRouter SHALL 不发送 clarification 事件（本期 SSE 协议中无 clarification 事件）

### 需求 15：性能约束

**用户故事：** 作为系统运维者，我希望各 Skill 的耗时与资源消耗都控制在已知上限内，以便保证用户体验与成本可控。

#### 验收标准

1. THE Brief_Skill 与 Actions_Skill SHALL 不调用任何向量搜索或混合搜索方法（仅允许 SummaryTool 与 OutlineTool）
2. THE Tutor_Skill SHALL 保证每轮拼接给 LLM 的章节内容总 token 不超过 8000；超长章节采用代表性采样（首尾段 + 中间抽样）+ 必要时章节级摘要压缩，**不**采用单纯按 chunk_index 截断
3. THE Quiz_Skill SHALL 在 configuring 阶段强制 `config.count ≤ 10`，超过上限的配置请求需被拒绝
4. THE Brief_Skill 处理 SHALL 在 15 秒内完成，否则按需求 3.8 触发超时错误
5. THE Actions_Skill 处理 SHALL 在 15 秒内完成，否则按需求 6.9 触发超时错误
6. THE Explain_Skill 处理 SHALL 在 25 秒内完成，否则按需求 5.10 触发超时错误
7. THE Tutor_Skill 单轮处理 SHALL 在 30 秒内完成，否则按需求 4.11 触发超时错误
8. THE Quiz_Skill 出题阶段 SHALL 在 45 秒内完成、评分阶段 SHALL 在 30 秒内完成，否则按需求 7.13 / 7.14 触发超时错误
