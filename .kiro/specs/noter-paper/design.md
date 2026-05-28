# Design Document

## Overview

本设计文档不是一份软件架构文档，而是 noter-paper 的**论文写作蓝图**。它围绕两份交付物展开：

- `paper/noterPaper.md`：论文正文，所有 mermaid 图直接以代码块形式内嵌。
- `paper/noterChart.md`：论文中所有 mermaid 图的集中清单，每张图包含正文图编号、图名、一句话解释、原始 mermaid 源代码。

设计阶段的目标，是把已批准的 requirements、学校模板对每一章的写作要求，以及 noter 仓库的真实代码与数据库结构，落到具体的章节级写作指南里。所以本文档不会出现 API、性能、安全这种软件架构小节；取而代之的是「这一节准备怎么写」「这段话从仓库哪个文件取材」「这张图怎么画」「这个表怎么列」。下面出现的 Architecture / Components and Interfaces / Data Models / Error Handling / Testing Strategy / Correctness Properties 等英文二级标题，是 spec 模板的固定骨架，但内部段落全部围绕论文写作展开，请按论文写作语境阅读。

论文围绕的是仓库根目录下的 Noter 文档智能阅读平台，本期三个上游 spec —— `noter-document-management`、`noter-agent`、`noter-admin-platform` —— 已经覆盖了系统全部功能，论文从这三份 spec 与对应代码、迁移文件中取材，不再凭空补充功能。

## Architecture

这一节对应论文的整体写作策略。论文的"架构"不是软件意义上的层次划分，而是双文件分工、章节骨架与编号规则三件事如何拼成一个能交付的写作蓝图。

### 语言风格守则

毕业论文里 AI 写作腔的几种典型迹象，需要在写作时主动避开：

- 「首先 / 其次 / 最后 / 总而言之」四件套堆叠成段。一段论述如果开头是「首先」，几乎一定能改写成正常的因果或并列关系。
- 「接下来让我们看看」「总的来说」「值得注意的是」「在本节中我们将」之类空洞过渡句。论文的章节标题已经承担了过渡，正文不需要再复述一遍。
- 排比句堆叠形容词：「高效、稳定、可靠、可扩展……」。形容词要用具体数字或具体行为替代，例如「单文件解析在 5 分钟超时上限内完成」「向量分片采用 1000 字符 / 200 字符重叠」。
- 大量分点。除非确实是并列条目（如可行性三方面、数据字典列名），否则用段落叙述更接近正常论文笔调。

正文写作的具体做法：
- 每一节用 2 到 4 个自然段来叙述，再嵌入图表或代码片段。三级小节的篇幅控制在半页到一页之间，避免页面被分点列表撑开。
- 同义表达不重复罗列。如果一句话已经把语义说完，不再用「换言之」或「也就是说」再重复一遍。
- 引出图表前先用一句完整的话说明图表的内容，再以「如图 X.Y 所示」收尾，禁止出现「下图展示了」这种空话。

### 与 noter 仓库的对齐策略

整篇论文的事实陈述都从仓库当前最新代码与数据库取材，避免出现实际不存在的功能或字段。具体做法：

- 章节里凡引用到目录结构、文件路径、模块边界、技术栈版本，都先查 `package.json`、`pnpm-workspace.yaml` 或对应源文件再写。
- 数据库相关章节（3.3.3 数据字典、4.3.3 物理结构）以 supabase 项目当前 `public` schema 的 `information_schema.columns` 查询结果为准，并参考 `supabase/migrations/` 中各迁移的 `COMMENT` 文本。
- 代码片段统一写明摘自 `<相对路径>` 第 X 至 Y 行，例如「摘自 `packages/agent-runtime/src/router/skill-router.ts` 第 30 至 80 行」。读者可以直接按路径回到源码核对。
- 三个上游 spec（noter-document-management / noter-agent / noter-admin-platform）的 requirements 提供功能定义，论文不再重复罗列 EARS 验收标准，但可以引用其中的角色名、业务动作、模块边界。

### 双文件分工与同步机制

mermaid 图是 noter-paper 的两个交付文件之间唯一会重复的内容。约定：

- 正文中每张图都直接以 mermaid 代码块形式嵌入 `paper/noterPaper.md`，并在图块下方紧跟一行「图 X.Y 图名」做编号与命名。
- 在 `paper/noterChart.md` 中按正文图编号顺序集中维护一份镜像清单，每张图至少包含「正文图编号」「图名」「一句话解释」「与正文一致的 mermaid 源代码」四项。
- 两份文件之间的图编号必须严格一致；正文新增图必须在 chart 清单同步追加，反之亦然。这一同步要求作为定稿前的最终校验项之一。
- 时序图按要求最后一定要有返回箭头。E-R 图的命名要带上实体关系范围（例如「图 4.3 文档与文件夹、标签的实体关系图」），用例图要在标题中点明角色或模块。

### 图编号 / 表编号 / 参考文献编号统一规则

- 图编号：「图 X.Y」，X 为章号，Y 为该章内顺序号，从 1 开始。引用句固定为「如图 X.Y 所示」。
- 表编号：「表 X.Y」，规则同图，引用句固定为「如表 X.Y 所示」。
- 参考文献编号：方括号阿拉伯数字，按正文出现顺序连续编号。每条参考文献必须能在正文里找到至少一处引用，反之，正文里出现的每个 `[N]` 也必须在文末有对应条目。

## Components and Interfaces

这一节把论文的每一章视为一个 component，章与章之间的取材边界与编号一致性视为 interface。下面按章节给出主要内容来源；引用到的所有路径都基于仓库当前最新代码。

第一章 绪论：
- 1.1 项目开发背景：根目录 `README.md`（如有）；`paper/` 目录已有空文件 `noterPaper.md`、`noterChart.md` 作为本期交付占位；`apps/noter-web/README.md`、`apps/noter-admin/README.md`。
- 1.2 项目开发意义：写作时需要联系自身毕设语境，可以参考 `.kiro/specs/noter-document-management/requirements.md` 介绍部分对系统价值的描述（不直接抄）。
- 1.3 国内外发展状况：本节资料以外部检索为主，写作时需要至少 4 个具体实例（国内 2、国外 2），代表方向是「文档智能阅读 + RAG + LLM 知识助手」，建议候选实例参考飞书妙记、有道云笔记 AI、Notion AI、Mendeley AI（具体由作者自己核查后选定）。
- 1.4 可行性分析：经济与社会两小节走通用论述；技术可行性可以引用根目录 `package.json`、`pnpm-workspace.yaml` 与各 app 的 `package.json` 给出的真实依赖来佐证「技术成熟可靠、开源免费」。

第二章 开发环境与主要技术介绍：
- 2.1 开发环境概述：根目录 `package.json`（pnpm@10.32.1、commitizen、husky、prettier 配置）；`.eslintrc`、`.prettierrc`、`.commitlintrc.json`、`.husky/`；`docker/` 目录（如涉及容器）。
- 2.2 主要技术简介：
  - 前端：`apps/noter-web/package.json`（Next.js 16.1.6、React 19、@supabase/ssr、@supabase/supabase-js、@xyflow/react、react-markdown、remark-gfm、remark-math、rehype-katex、rehype-raw、rehype-slug、rehype-highlight、@react-pdf/renderer、zustand、tailwindcss v4、zod）。
  - 管理端：`apps/noter-admin/package.json`（Next.js 16.2.6、recharts、vitest、playwright、tsx）。
  - UI 库：`packages/ui/package.json`（shadcn 4、radix-ui、class-variance-authority、tailwind-merge、lucide-react、next-themes、tw-animate-css）。
  - 共享代码：`packages/api/package.json`（axios）、`packages/agent-runtime/package.json`（TypeScript、@supabase/supabase-js、zod、fast-check 用于测试）。
  - 后端：`supabase/migrations/`（PostgreSQL）、`supabase/functions/`（Deno Edge Functions：parse-document、vectorize-document、generate-summary、generate-mindmap）。

第三章 需求分析：
- 3.1 用户需求：以 `.kiro/specs/noter-document-management/requirements.md` 的需求 1 至 21 中的「用户故事」为主线（描述用户实际工作，不要写模块），结合 `.kiro/specs/noter-agent/requirements.md` 与 `.kiro/specs/noter-admin-platform/requirements.md` 给出的角色定义。
- 3.2 系统用例分析：角色取自 `noter-admin-platform` 的 `profiles.role`（user、admin、super_admin）以及 noter-document-management 的隐含「未登录访客 / 已登录用户」。具体业务动作来自三份 requirements 的功能清单。
- 3.3 系统数据流分析：顶层 DFD 从「用户文件」到「Supabase Storage」到「Edge Function 解析」到「Postgres 数据库」到「前端展示」组织。子模块 DFD 重点画两个：文档上传与解析流水线、AI 问答 SSE 流。数据字典直接基于 Data Models 一节列出的表清单来填。

第四章 概要设计：
- 4.1 开发规定：根目录 `.eslintrc`、`.prettierrc`、`.commitlintrc.json`、`.cz-config.js`、`.lintstagedrc.js`、`.husky/`、`tsconfig.base.json`、`pnpm-workspace.yaml`。
- 4.2 系统总体规划：仓库目录结构 `apps/noter-web/`、`apps/noter-admin/`、`packages/{ui,api,agent-runtime,hooks,utils}/`、`supabase/{migrations,functions,tests}/`。
- 4.3 模块数据库设计：
  - 4.3.1 概念结构：以 `supabase/` 当前 `public` schema 的真实表为实体，画出文档相关、用户相关、Agent 会话相关、管理后台相关四组实体的 E-R 图。
  - 4.3.2 逻辑结构：把 E-R 转写为关系模式，关注一对多（user → documents → document_chunks）、一对一（document → document_contents、document → document_summaries、document → document_mindmaps）、多对多（documents ↔ tags via document_tags）。
  - 4.3.3 物理结构：表清单见本文档 Data Models 一节，按表名为单位列字段名 / 类型 / 是否可空 / 默认值 / 注释。源数据来自 supabase MCP `list_tables` 与 `information_schema.columns`，并参考各张表的迁移 SQL 注释。

第五章 详细设计：
- 5.1 核心功能模块一「文档上传与 RAG 解析流水线」：
  - 前端入口：`apps/noter-web/components/documents/UploadDialog.tsx`、`UploadProgress.tsx`。
  - API 路由：`apps/noter-web/app/api/documents/upload/`、`apps/noter-web/app/api/documents/[id]/`。
  - Edge 函数：`supabase/functions/parse-document/index.ts`、`supabase/functions/vectorize-document/index.ts`、`supabase/functions/generate-summary/index.ts`、`supabase/functions/generate-mindmap/index.ts`。
  - 表现：`documents`、`document_contents`、`document_assets`、`document_chunks`、`document_summaries`、`document_mindmaps`、`document_processing_jobs`。
  - spec 来源：`.kiro/specs/noter-document-management/requirements.md` 需求 11、需求 19、需求 20、需求 21。

- 5.2 核心功能模块二「Noter Agent 多轮 Skill 与 SSE 流式响应」：
  - 后端入口：`apps/noter-web/app/api/ai/chat/`（Route Handler）、`apps/noter-web/app/api/ai/sessions/`。
  - 内部包：`packages/agent-runtime/src/{router,skills,tools,sse,db,prompts,types}/`、`packages/agent-runtime/src/orchestrator.ts`、`packages/agent-runtime/src/index.ts`。
  - 前端容器：`apps/noter-web/components/document-detail/AIChatPanel.tsx`、`apps/noter-web/components/document-detail/chat/`、`apps/noter-web/components/document-detail/sse/`、`apps/noter-web/stores/chatSession.ts`、`apps/noter-web/lib/agent/session-sanitize.ts`、`apps/noter-web/lib/agent/session-validation.ts`。
  - 表现：`agent_skill_sessions`，对照只读的 `documents`、`document_contents`、`document_chunks`、`document_summaries`。
  - spec 来源：`.kiro/specs/noter-agent/requirements.md` 全部 15 条需求。

第六章 系统实现与代码编写：
- 6.1 项目后端结构：`apps/noter-web/app/api/`（用户端 API）、`apps/noter-admin/app/api/admin/`（管理端 API）、`supabase/functions/`、`supabase/migrations/`。
- 6.2 项目前端结构：`apps/noter-web/app/`（用户端路由组 `(auth)`、`(main)`、`provider`）、`apps/noter-admin/app/`（管理端路由组 `(admin)`、`(auth)`）、`packages/ui/src/`。
- 6.3 关键功能简述：
  - 6.3.1「混合搜索（向量召回 + ts_headline 关键词召回融合）」：取材 `apps/noter-web/app/api/search/`、`supabase/migrations/20260516180339_add_hybrid_search_scoped_rpc.sql`、`supabase/migrations/20260516182557_add_vector_and_keyword_search_scoped_rpcs.sql`。
  - 6.3.2「公共文档在线编辑与版本归档 / 回滚」：取材 `apps/noter-admin/app/api/admin/public-documents/`、`apps/noter-admin/components/MarkdownEditor.tsx`、`apps/noter-admin/components/VersionDrawer.tsx`、`supabase/migrations/20260517223448_admin_platform_public_document_versions.sql`、`supabase/migrations/20260517223452_admin_platform_auto_version_v1_trigger.sql`。

第七章 软件测试：
- 7.1/7.2：`apps/noter-admin/vitest.config.ts`、`apps/noter-admin/playwright.config.ts`、`apps/noter-admin/tests/`、`packages/agent-runtime/vitest.config.ts`、`packages/agent-runtime/tests/{router,skills,sse,tools}/`、`supabase/tests/`。
- 7.3：核心功能模块一与模块二各取一组测试用例，建议用例直接从 `packages/agent-runtime/tests/router/`（Skill Router 单元测试）与 `apps/noter-admin/tests/integration/`（管理后台公共文档集成测试）摘取。

总结与展望：写作时围绕实际开发遇到的问题，例如 Edge Function 的 LlamaParse 接入、向量分片参数调优、SSE 协议在 Next.js Route Handler 上的实现、agent_skill_sessions 的 service-role-only RLS 调试经历。

参考文献：本期至少 15 条，按正文首次出现顺序编号。资料类型分布建议为：学位论文 2 至 3 条、连续出版物 4 至 6 条、网络资料 4 至 6 条（Next.js / React / Supabase / shadcn / LlamaParse 官方文档）、技术标准 1 条（如 Markdown CommonMark 规范）、企业技术资料 1 至 2 条。

附录：第五章未展开的代码（例如 `apps/noter-admin/components/MarkdownEditor.tsx` 完整源码、`packages/agent-runtime/src/skills/quiz.ts` 完整源码、关键迁移 SQL 全文）放入附录，正文只贴关键 30 至 60 行片段。

## Data Models

下表为 supabase 项目 `public` schema 当前实际存在的 18 张表，行数为 `list_tables` 时点的快照，字段来自 `information_schema.columns`。物理结构表（4.3.3）按这一清单逐表展开，数据字典（3.3.3）从中筛选与业务直接相关的存储项。

文档主域：
- `documents`（34 行）：文档主表，承载基础元数据（title / original_filename / file_ext / mime_type / file_size / cover_url / language / word_count / page_count）、四类处理状态（status / parse_status / vector_status / summary_status / mindmap_status）、归属（user_id / folder_id）、范围（document_scope ∈ {private, public}、public_category_id）、收藏归档（is_favorite / is_archived）、软删（deleted / deleted_at）。
- `document_contents`（34 行）：标准化 Markdown 内容表，承载 markdown_content（text）、outline（jsonb）、metadata（jsonb）。
- `document_assets`（0 行）：文档解析产生的图片资源（bucket 默认 `document-assets-public`、storage_path、public_url、original_url、filename、mime_type、file_size、width、height、sort_order）。
- `document_chunks`（92 行）：文档分片，承载 chunk_index、content、heading_path（jsonb）、token_count、char_start / char_end、embedding（pgvector）、metadata（jsonb）。
- `document_summaries`（31 行）：AI 总结（summary、key_points、todos、keywords、suitable_scenarios、model_name、generated_at）。
- `document_mindmaps`（30 行）：AI 思维导图（mindmap_json、markdown_outline、model_name、generated_at）。
- `document_qa_records`（0 行）：文档问答历史（question、answer、retrieved_chunk_ids、retrieval_context、model_name）。
- `document_processing_jobs`（68 行）：文档处理任务表，记录 job_type、status、input_payload、output_payload、error_message、retry_count、started_at、finished_at。

组织域：
- `folders`（4 行）：文件夹（name、parent_id 自引用、icon、sort_order、is_system_folder）。
- `tags`（3 行）：标签（name、color、description、is_official）。
- `document_tags`（1 行）：文档与标签多对多（document_id、tag_id、user_id 冗余）。

用户域：
- `profiles`（2 行）：用户资料（username、email、avatar_url、role ∈ {user, admin, super_admin}、provider、nike_name、not_active、is_system_account、deleted）。
- `user_settings`（0 行）：用户偏好（default_reader_template，目前仅承载阅读模板偏好）。

Agent 会话域：
- `agent_skill_sessions`（3 行）：多轮 Skill 会话（user_id、document_id、skill、state（jsonb）、expires_at（默认 now + 24h）、deleted）。RLS 仅 service_role 可访问，详见 `supabase/migrations/20260516175445_create_agent_skill_sessions_table.sql`。

管理后台域：
- `public_categories`（0 行）：公共文档分类（name、description、sort_order、deleted）。
- `public_document_versions`（0 行）：公共文档版本快照（document_id、version_no、markdown_content、change_note、editor_user_id）。
- `admin_audit_logs`（0 行）：管理员操作审计（admin_user_id、admin_email、action_type、target_resource_type、target_resource_id、target_resource_label、request_ip、metadata）。
- `system_settings`（4 行）：系统级访问开关（key 主键、value（jsonb）、updated_by），承载 allow_user_upload / allow_user_delete_own / public_documents_visible / audit_log_enabled 四个开关。

为方便论文里检索，关键迁移文件清单：
- `20260516175445_create_agent_skill_sessions_table.sql`
- `20260516180339_add_hybrid_search_scoped_rpc.sql`
- `20260516182557_add_vector_and_keyword_search_scoped_rpcs.sql`
- `20260517223443_admin_platform_profiles_super_admin.sql`
- `20260517223444_admin_platform_documents_scope.sql`
- `20260517223445_admin_platform_folders_system_flag.sql`
- `20260517223446_admin_platform_tags_official.sql`
- `20260517223447_admin_platform_public_categories.sql`
- `20260517223448_admin_platform_public_document_versions.sql`
- `20260517223449_admin_platform_admin_audit_logs.sql`
- `20260517223450_admin_platform_system_settings.sql`
- `20260517223451_admin_platform_rls_policies.sql`
- `20260517223452_admin_platform_auto_version_v1_trigger.sql`

## Correctness Properties

这一节给出论文需要在定稿时持续满足的若干"正确性属性"。它们的共同特点是可以机械化校验，作者在交稿前可以人工或脚本逐条对照。这些属性不是软件意义上的运行时不变式，而是"论文这件作品"在内容一致性上必须满足的约束。

### Property 1: 图与正文引用双向闭合

`paper/noterPaper.md` 中每一个 mermaid 代码块下方都对应一行「图 X.Y 图名」，且正文中至少出现一次「如图 X.Y 所示」；反过来，每一处「如图 X.Y 所示」都能在文中找到唯一对应的图块。

**Validates: Requirements 2.1, 2.3, 8.1**

### Property 2: 参考文献双向闭合

文末参考文献的每一条 `[N]` 都能在正文中找到至少一处 `[N]` 出现，正文中每一个 `[N]` 也都能在文末找到对应条目，且编号按正文首次出现顺序连续递增、不跳号、不重号。

**Validates: Requirements 4.1, 4.2**

### Property 3: 章节编号连续

所有章、节、小节标题严格按照 requirements 需求 1 给出的骨架编号，同层级之间不跳号；Markdown 一级 / 二级 / 三级标题与编号层级严格对应。

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 4: 代码片段可追溯

正文中出现的每一段代码块都附「摘自 `<相对路径>` 第 X 至 Y 行」标注，使读者可以直接回到仓库定位原文。

**Validates: Requirements 5.4, 6.1, 6.2**

### Property 5: 双文件 mermaid 镜像一致

`paper/noterChart.md` 中按图编号排序的条目，其 mermaid 源代码与 `paper/noterPaper.md` 中对应图块的 mermaid 源代码逐字一致；正文新增或删除图时，chart 清单同步增删。

**Validates: Requirements 8.1, 8.2, 8.3**

### Property 6: 字段表与 supabase 一致

4.3.3 物理结构表与 3.3.3 数据字典中出现的每一个表名 / 字段名都能在 supabase `information_schema.columns` 当前结果中找到，没有论文里有但库里没有、或库里有但论文里漏写的字段。

**Validates: Requirements 6.2, 3.4**

## Error Handling

这一节列出论文写作过程中容易出问题的几类"故障"，以及相应的排查方法。它服务于"如何在交稿前把错误压到最低"，不涉及程序运行时的异常处理。

最常见的是悬挂引用与悬挂图表。正文写到一半增删了图，但参考文献编号或图编号没有同步更新，结果出现「如图 4.7 所示」却找不到图 4.7，或参考文献 `[15]` 没人引用。排查办法是定稿前以 `\[图 \d+\.\d+\]?|如图 \d+\.\d+ 所示` 与 `\[\d+\]` 两组正则在 `paper/noterPaper.md` 上跑一遍，与文末文献条目数 / 图块数对账。其次是章节缺失或错序，例如漏写 1.4.4 结论、把 4.3.3 物理结构合并进 4.3.2 逻辑结构。排查办法是把 requirements 需求 1 的章节骨架作为 checklist，逐条勾选。第三是 AI 写作腔残留，像「首先 / 其次 / 最后」「接下来让我们看看」「总而言之」「值得注意的是」之类，可以在交稿前用关键字搜索全文一次性扫掉。第四是代码片段路径或行号失效——仓库一边在演进，论文里写的「摘自 第 30 至 80 行」很可能在某次重构后已经对不上，定稿前需要对每段代码片段重新到仓库里 `head -n 80 | tail -n 50` 核对一次，并把变化的部分回填到正文。第五是字段表与 supabase 实际结构脱节，迁移已经执行但论文里的字段表是早期版本，排查办法见 Testing Strategy 一节给出的核对清单。

## Testing Strategy

这一节是论文交付前的校验与验收清单。"测试"在论文写作语境下指的是把成稿当作一个被验收的作品，按以下几项手工或脚本化校验之后才算定稿；与 PBT 没有关系，因此本 spec 不包含 Correctness Properties 之外的属性测试。

定稿前应当依次完成的核对项：

- 图编号双向匹配：在 `paper/noterPaper.md` 中提取所有「图 X.Y」标签和所有「如图 X.Y 所示」引用，两侧集合完全相等；同时在 `paper/noterChart.md` 中验证存在相同的图编号集合。
- 参考文献双向引用：提取正文所有 `[N]` 与文末文献编号集合，两侧严格相等，且编号按首次出现顺序 1、2、3、…… 递增。
- 章节骨架完整：按 requirements 需求 1 给出的章节列表逐一勾选，包括第一章 1.4 的四个小节、第三章 3.3 的三个小节、第四章 4.3 的三个小节、第七章 7.3 的两个小节、总结与展望两节、参考文献、附录。
- 字段表与 supabase 一致：再次通过 supabase MCP 拉取 `information_schema.columns`，与 4.3.3 物理结构表中列出的字段逐表比对；不一致即更新论文。
- mermaid 镜像一致：对每一个图编号，把 `paper/noterPaper.md` 与 `paper/noterChart.md` 中对应的 mermaid 源代码做 diff，应当为空 diff。
- 代码片段可命中：对每段「摘自 `<路径>` 第 X 至 Y 行」标注，按路径与行号回到仓库实际取出该段代码，确认与论文中所贴片段逐字一致。
- 风格抽查：在全文范围搜索「首先」「其次」「再次」「最后」「总而言之」「接下来让我们看看」「值得注意的是」「在本节中我们将」等高频 AI 腔关键词，按需改写。

以上每一项都是定稿前的硬性卡点；任何一项不通过都需要回到对应章节修改，再重新跑一次完整清单。
