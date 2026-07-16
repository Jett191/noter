# 实现计划：Noter 文档管理系统

## 概述

基于 Next.js 16 App Router + React 19 + Supabase 全栈架构实现文档管理系统。

**状态枚举规范：**
- parse_status / vector_status / summary_status / mindmap_status 统一使用：`pending` | `running` | `success` | `failed`
- 上传创建 documents 后：`status='processing'`，`parse_status='pending'`，`vector_status='pending'`，`summary_status='pending'`，`mindmap_status='pending'`
- 各 Edge Function 开始时设置对应 status='running'，成功后设置 'success'
- 若关键步骤失败：`documents.status='failed'`
- 全部关键步骤成功后：`documents.status='ready'`

**核心约束：**
- 数据库表结构已建好，按既有数据库表结构实现，不重新设计数据库。可设计 RLS 策略和 RPC 函数。
- AI 问答模块本阶段仅实现 UI 面板，不实现真实 RAG 问答后端。
- Edge Functions 必须先于上传 Route Handler 实现（至少提供 stub），上传接口依赖 parse-document 可调用。
- 所有 Edge Function 部署统一在 Edge Functions checkpoint 中完成，Route Handler 任务不涉及部署。
- AI 总结/思维导图重新生成需实现状态流转（pending → running → success/failed）及前端轮询。
- parse-document 图片处理失败时保留原始 alt 文本或插入文字提示，不生成空图片链接。

## Tasks

- [x] 1. 类型定义与 Zod Schema
  - [x] 1.1 创建文档相关类型定义 `types/document.ts`
    - 按既有数据库表结构定义 TypeScript 接口，不重新设计数据库
    - 定义 Document、DocumentContent、DocumentAsset、DocumentSummary、DocumentMindmap、Tag、DocumentProcessingJob 等接口
    - 定义 DocumentStatus、ProcessingStatus、TemplateType 等类型别名
    - 定义 ListParams、PaginatedResult、SearchParams、SearchResult 等请求/响应类型
    - _Requirements: 1.1, 1.2, 5.3, 11.1_

  - [x] 1.2 创建文档模块 Zod Schema `utils/feature/documents/schemas.ts`
    - 定义 listDocumentsSchema（page, pageSize, tagIds, orderBy, order）
    - 定义 documentIdSchema（id: UUID）
    - 定义 uploadDocumentSchema（文件格式校验: PDF/DOCX/PPTX/TXT/MD，大小 ≤ 50MB）
    - _Requirements: 1.3, 11.1, 11.12_

  - [x] 1.3 创建标签模块 Zod Schema `utils/feature/tags/schemas.ts`
    - 定义 createTagSchema（name: 1-20 字符）
    - 定义 tagIdSchema（id: UUID）
    - 定义 addTagSchema（tagId: UUID）
    - _Requirements: 3.2, 3.3_

  - [x] 1.4 创建搜索模块 Zod Schema `utils/feature/search/schemas.ts`
    - 定义 searchSchema（query: 1-200 字符, limit 可选，默认 20，最大 50）
    - _Requirements: 2.1_

  - [x] 1.5 创建 AI 模块 Zod Schema `utils/feature/ai/schemas.ts`
    - 定义 regenerateSchema（documentId: UUID）
    - _Requirements: 7.5, 8.4_

- [x] 2. 数据库 RLS 策略与 RPC 函数
  - [x] 2.1 设计并创建 RLS 策略
    - RLS 主要负责用户数据隔离（auth.uid() = user_id），不在 RLS 中过滤 deleted 字段
    - deleted=0 的过滤在业务查询和 RPC 中处理，避免影响后续恢复、清理和后台维护逻辑
    - 为所有表创建基于 auth.uid() = user_id 的 SELECT/INSERT/UPDATE/DELETE 策略
    - 涉及表：documents、document_contents、document_assets、tags、document_tags、document_chunks、document_summaries、document_mindmaps、document_qa_records、document_processing_jobs
    - 使用 supabase power 的 apply_migration 执行
    - _Requirements: 10.1, 10.2_

  - [x] 2.2 设计并创建 hybrid_search RPC 函数
    - 函数签名：`hybrid_search(query_text text, query_embedding vector, match_count int default 20)`
    - match_count 最大限制为 50（函数内部 LEAST(match_count, 50)）
    - query_embedding 的 vector 维度为 768（Gemini gemini-embedding-2）
    - 用于混合搜索文档标题和正文分片内容（不搜索标签，标签仅用于筛选）
    - 支持关键词搜索（documents.title + document_contents.markdown_content）和向量搜索（document_chunks.embedding 余弦相似度）融合排序
    - 搜索范围包含 documents、document_contents、document_chunks 表（不包含 tags）
    - 按当前登录用户隔离数据（auth.uid()），只返回该用户自己的文档
    - 过滤 deleted = 0 的数据（在 RPC 业务逻辑中过滤，非 RLS）
    - 加权排序：0.4 * keyword_score + 0.6 * vector_score
    - 返回结果包含 document_id、title、matched_content、score、match_type（keyword/vector/hybrid）
    - Route Handler `/api/search/route.ts` 负责生成 query_embedding，RPC 负责融合搜索逻辑
    - 使用 supabase power 的 apply_migration 执行
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 2.3 创建 Storage Policy
    - document-originals 桶：用户仅能读写自身 user_id 目录下的文件
    - document-assets-public 桶：公开读取，写入仅限 service_role
    - userResources 桶：用户仅能读写自身路径
    - 使用 supabase power 执行
    - _Requirements: 10.4_

- [x] 3. Edge Functions 实现（必须先于上传 Route Handler）
  - [x] 3.1 实现 parse-document Edge Function `supabase/functions/parse-document/index.ts`
    - 接收 documentId、userId、storagePath
    - 从 document-originals 桶生成临时签名 URL（1 小时有效期）
    - 调用 LlamaParse REST API（agentic tier，expand: markdown_full + images_content_metadata）
    - 逐一下载图片并转存到 document-assets-public 桶，记录到 document_assets 表
    - 重写 Markdown 中的图片 URL 为 Supabase 公网 URL
    - 图片下载失败时保留原始 alt 文本或插入文字提示"[图片暂时无法显示]"，不生成空图片链接
    - 保存标准化 Markdown 到 document_contents 表（含 outline JSON）
    - 开始时更新 documents.parse_status = 'running'
    - 成功后更新 documents.parse_status = 'success'
    - 链式触发 vectorize-document
    - 超时 5 分钟，失败时标记 parse_status = 'failed'、documents.status = 'failed' 并记录到 document_processing_jobs
    - 使用 llama-index-docs MCP 查阅 LlamaParse API 文档
    - 按既有数据库表结构写入，不重新设计数据库
    - _Requirements: 11.4, 11.5, 11.6, 11.7, 11.8, 11.13, 11.14_

  - [x] 3.2 实现 vectorize-document Edge Function `supabase/functions/vectorize-document/index.ts`
    - 从 document_contents 读取标准化 Markdown
    - 文本清洗（移除图片标记、HTML 标签、多余空白）
    - 按段落边界分片（最大 1000 字符/片，重叠 200 字符）
    - 记录 chunk_index、char_start、char_end、heading_path
    - 批量调用 Gemini Embedding API（gemini-embedding-2，768 维）生成向量
    - 开始时更新 documents.vector_status = 'running'
    - 写入 document_chunks 表
    - 成功后更新 documents.vector_status = 'success'
    - 并行触发 generate-summary 和 generate-mindmap
    - 超时 2 分钟，失败时标记 vector_status = 'failed'、documents.status = 'failed'
    - 按既有数据库表结构写入，不重新设计数据库
    - _Requirements: 11.9_

  - [x] 3.3 实现 generate-summary Edge Function `supabase/functions/generate-summary/index.ts`
    - 从 document_contents 读取标准化 Markdown
    - 更新 documents.summary_status = 'running'
    - 内容 ≥ 50 字时调用小米 MiMo LLM API（MiMo-V2.5-Pro）生成总结（summary + key_points + keywords）
    - 保存到 document_summaries 表
    - 更新 documents.summary_status = 'success'
    - 检查 mindmap_status 是否也为 success，若是则更新 documents.status = 'ready'
    - 失败时标记 summary_status = 'failed'、documents.status = 'failed' 并记录 error_message 到 document_processing_jobs
    - 支持重复调用（幂等：先删除旧记录再写入）
    - 按既有数据库表结构写入，不重新设计数据库
    - _Requirements: 11.10_

  - [x] 3.4 实现 generate-mindmap Edge Function `supabase/functions/generate-mindmap/index.ts`
    - 从 document_contents 读取标准化 Markdown
    - 更新 documents.mindmap_status = 'running'
    - 提取标题层级结构（h1-h6）
    - 调用小米 MiMo LLM API（MiMo-V2.5-Pro）生成树形 JSON（节点 ≤ 200 个）
    - 校验 JSON 结构合法性
    - 保存到 document_mindmaps 表（mindmap_json + markdown_outline）
    - 更新 documents.mindmap_status = 'success'
    - 检查 summary_status 是否也为 success，若是则更新 documents.status = 'ready'
    - 失败时标记 mindmap_status = 'failed'、documents.status = 'failed' 并记录 error_message 到 document_processing_jobs
    - 支持重复调用（幂等：先删除旧记录再写入）
    - 按既有数据库表结构写入，不重新设计数据库
    - _Requirements: 11.10_

- [x] 4. Edge Functions 部署 Checkpoint
  - 使用 supabase power 的 deploy_edge_function 统一部署所有 4 个 Edge Functions
  - 验证 parse-document 可被调用（至少 stub 可响应）
  - 验证链式触发逻辑：parse → vectorize → (summary ∥ mindmap)
  - 确认部署成功后再进入后续 Route Handler 任务

- [x] 5. API 客户端层（lib/axios）
  - [x] 5.1 创建文档 API 客户端 `lib/axios/documents.ts`
    - 实现 upload、list、getById、delete、getStatus、downloadPdf 方法
    - 使用现有 `http` 实例（来自 `lib/axios/client.ts`）
    - _Requirements: 1.1, 1.4, 5.1, 9.2, 11.2_

  - [x] 5.2 创建标签 API 客户端 `lib/axios/tags.ts`
    - 实现 list、create、delete、addToDocument、removeFromDocument 方法
    - _Requirements: 3.1, 3.2, 3.7_

  - [x] 5.3 创建搜索 API 客户端 `lib/axios/search.ts`
    - 实现 search 方法，配置 10 秒超时
    - _Requirements: 2.2, 2.7_

  - [x] 5.4 创建 AI API 客户端 `lib/axios/ai.ts`
    - 实现 regenerateSummary、regenerateMindmap 方法
    - 返回值包含状态信息，前端据此轮询
    - _Requirements: 7.5, 8.4_

- [x] 6. Route Handler 实现
  - [x] 6.1 实现文档列表 Route Handler `app/api/documents/route.ts`
    - GET 方法：解析分页参数 + 标签筛选，查询 Supabase 数据库
    - 使用 `handler()` + `success()/error()` 模式
    - 查询时过滤 deleted=0，按 created_at 降序
    - 按既有数据库表结构查询，不重新设计数据库
    - _Requirements: 1.1, 1.3, 1.4, 3.4_

  - [x] 6.2 实现文档上传 Route Handler `app/api/documents/upload/route.ts`
    - 依赖：parse-document Edge Function 已部署（Task 4 完成后）
    - POST 方法：校验文件格式和大小 → 上传到 document-originals 桶 → 创建文档记录（status='processing', parse_status='pending', vector_status='pending', summary_status='pending', mindmap_status='pending'）→ 异步触发 parse-document Edge Function → 立即返回
    - 存储路径格式：`{user_id}/{document_id}/{原始文件名}`
    - 不在此任务中部署 Edge Function（已在 Task 4 完成）
    - 按既有数据库表结构写入，不重新设计数据库
    - _Requirements: 11.1, 11.2, 11.3, 11.12_

  - [x] 6.3 实现文档详情与删除 Route Handler `app/api/documents/[id]/route.ts`
    - GET 方法：查询文档详情 + 关联 document_contents + 标签 + document_summaries + document_mindmaps
    - DELETE 方法：软删除（设置 deleted=1）
    - 按既有数据库表结构查询，不重新设计数据库
    - _Requirements: 5.1, 5.7_

  - [x] 6.4 实现文档状态查询 Route Handler `app/api/documents/[id]/status/route.ts`
    - GET 方法：返回 status、parse_status、vector_status、summary_status、mindmap_status
    - 前端据此轮询上传/重新生成进度
    - _Requirements: 11.11_

  - [x] 6.5 实现文档标签管理 Route Handler `app/api/documents/[id]/tags/route.ts` 和 `[tagId]/route.ts`
    - POST 方法：为文档添加标签
    - DELETE 方法：移除文档标签（软删除）
    - _Requirements: 3.4, 3.7_

  - [x] 6.6 实现标签 CRUD Route Handler `app/api/tags/route.ts` 和 `app/api/tags/[id]/route.ts`
    - GET 方法：获取用户所有标签（含关联文档数量，过滤 deleted=0）
    - POST 方法：创建标签（校验名称唯一性）
    - DELETE 方法：软删除标签 + 解除文档关联
    - _Requirements: 3.1, 3.2, 3.6, 3.7_

  - [x] 6.7 实现混合搜索 Route Handler `app/api/search/route.ts`
    - 依赖：hybrid_search RPC 已创建（Task 2.2 完成后）
    - GET 方法：使用 fetch 调用 Gemini Embedding API（gemini-embedding-2）生成 768 维 query_embedding → 调用 hybrid_search RPC → 返回结果
    - Route Handler 负责生成 query embedding（直接 fetch Gemini API，不使用 openai 包），RPC 负责搜索逻辑
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 6.8 实现 AI 重新生成 Route Handler `app/api/ai/regenerate-summary/route.ts` 和 `regenerate-mindmap/route.ts`
    - POST 方法：更新对应 status 为 'running' → 触发对应 Edge Function → 立即返回
    - 前端通过 /api/documents/[id]/status 轮询状态流转（running → success/failed）
    - _Requirements: 7.5, 8.4_

  - [x] 6.9 实现 PDF 下载 Route Handler `app/api/documents/[id]/download-pdf/route.ts`
    - GET 方法：读取 document_contents + document_summaries + document_mindmaps → 使用 @react-pdf/renderer 生成 PDF → 返回 Blob
    - 仅支持 PDF 导出，其他格式不实现
    - 文件名格式：`{文档标题}_{YYYY-MM-DD}.pdf`
    - 缺失内容标注"暂无内容"
    - _Requirements: 9.2, 9.4, 9.6_

- [x] 7. Checkpoint - 确保类型、API 层和 Route Handler 编译通过
  - 确保所有 TypeScript 类型正确
  - Route Handler 可正常编译
  - Edge Functions 已部署且上传接口可触发 parse-document

- [x] 8. Zustand Store 实现
  - [x] 8.1 创建文档列表 Store `stores/document.ts`
    - 管理 documents、total、page、pageSize、loading、error、selectedTags 状态
    - 实现 fetchDocuments（调用 documentApi.list）
    - 实现 setPage、setPageSize、setSelectedTags
    - _Requirements: 1.1, 1.3, 1.4, 3.4_

  - [x] 8.2 创建标签 Store `stores/tags.ts`
    - 管理 tags、loading 状态
    - 实现 fetchTags、createTag、deleteTag
    - _Requirements: 3.1, 3.2, 3.7_

  - [x] 8.3 创建文档详情 Store `stores/documentDetail.ts`
    - 管理 document、loading、error、template、panelVisible 状态
    - 管理 summaryStatus、mindmapStatus 用于重新生成时的状态流转轮询
    - 实现 fetchDocument、setTemplate、togglePanel
    - 实现 regenerateSummary / regenerateMindmap（触发后轮询 status 直到 success/failed）
    - _Requirements: 5.1, 5.4, 6.3, 6.4, 7.5, 8.4_

- [x] 9. 文档列表页 UI 组件（所有组件放在 `components/documents/` 子文件夹中）
  - [x] 9.1 实现文档卡片组件 `components/documents/DocumentCard.tsx`
    - 展示标题（≤50 字符截断）、创建时间（YYYY-MM-DD HH:mm）、标签（最多 3 个）、摘要（≤100 字符截断）
    - 点击跳转到详情页
    - 使用 shadcn skill 查阅组件文档（Card、Badge 等）
    - _Requirements: 1.2, 5.1_

  - [x] 9.2 实现文档网格容器 `components/documents/DocumentGrid.tsx`
    - 卡片网格布局，响应式列数
    - 加载中显示骨架屏
    - 空状态显示 EmptyState 组件
    - 使用 shadcn skill 查阅组件文档（Skeleton 等）
    - _Requirements: 1.1, 1.5, 1.6_

  - [x] 9.3 实现分页控件 `components/documents/PaginationController.tsx`
    - 页码导航 + 每页条数选择（10/20/50，默认 10）
    - 使用 shadcn skill 查阅组件文档
    - _Requirements: 1.3, 1.4_

  - [x] 9.4 实现搜索栏 `components/documents/SearchBar.tsx`
    - 搜索输入框（1-200 字符）+ 加载指示器
    - 搜索结果展示（标题 + 高亮摘要 + 标签 + match_type）
    - 无结果提示 + 错误提示 + 10 秒超时处理
    - 使用 shadcn skill 查阅组件文档（Input 等）
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7_

  - [x] 9.5 实现左侧面板容器 `components/documents/side-panel/SidePanel.tsx`
    - 悬浮卡片容器，包含 TagManager 和 UserPanel
    - 使用 shadcn skill 查阅组件文档（Card 等）
    - _Requirements: 3.1, 4.1_

  - [x] 9.6 实现标签管理面板 `components/documents/side-panel/TagManager.tsx` 和 `TagFilterList.tsx`
    - 标签列表（名称 + 颜色 + 文档数量）
    - 新增标签（输入校验 1-20 字符、重复检测）
    - 删除标签（确认对话框）
    - 标签筛选（多选 OR 逻辑）
    - 使用 shadcn skill 查阅组件文档（Dialog、Input、Badge 等）
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 9.7 实现用户操作面板 `components/documents/side-panel/UserPanel.tsx`
    - 显示头像（无头像时显示首字符）+ 用户名（≤20 字符截断）
    - 用户设置导航、登出、注销（二次确认对话框）
    - 使用 shadcn skill 查阅组件文档（Avatar、Button、AlertDialog 等）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 9.8 实现上传对话框 `components/documents/UploadDialog.tsx` 和 `UploadProgress.tsx`
    - 拖拽 + 点击选择文件
    - 文件格式和大小前端校验（PDF/DOCX/PPTX/TXT/MD，≤50MB）
    - 上传进度显示（百分比）
    - 上传完成后轮询 /api/documents/[id]/status 展示解析状态流转
    - 使用 shadcn skill 查阅组件文档（Dialog 等）
    - _Requirements: 11.1, 11.2, 11.11, 11.12_

  - [x] 9.9 实现空状态组件 `components/documents/EmptyState.tsx`
    - 无文档时的提示 + 上传入口
    - 使用 shadcn skill 查阅组件文档
    - _Requirements: 1.6_

  - [x] 9.10 组装文档管理主页面 `app/(main)/documents/page.tsx`
    - 整合 SearchBar、SidePanel、DocumentGrid、PaginationController、UploadDialog
    - 页面加载时获取文档列表和标签列表
    - 错误状态处理 + 重试按钮
    - _Requirements: 1.1, 1.7_

- [x] 10. Checkpoint - 确保文档列表页功能完整
  - 分页、搜索、标签筛选、上传功能可用
  - 上传后可观察到状态轮询变化

- [x] 11. 文档详情页 UI 组件（所有组件放在 `components/document-detail/` 子文件夹中）
  - [x] 11.1 实现模板渲染器 `components/document-detail/TemplateRenderer.tsx` 和 `TemplateSwitcher.tsx`
    - 4 种内置模板：default、academic、clean、card
    - 每种模板预定义字体、字号、行高、段落间距、标题样式、代码块样式、引用块样式
    - 切换模板立即重新渲染，不改变底层数据
    - 使用 shadcn skill 查阅组件文档（Tabs 等）
    - _Requirements: 5.2, 5.3, 5.4, 5.11_

  - [x] 11.2 实现文档大纲 `components/document-detail/DocumentOutline.tsx`
    - 从 document_contents.outline 读取大纲数据
    - 提取 h1-h4 标题层级，嵌套缩进显示
    - 点击标题平滑滚动到对应位置
    - 无标题时隐藏大纲区域
    - _Requirements: 5.5, 5.6, 5.10_

  - [x] 11.3 实现文档元信息 `components/document-detail/DocumentMeta.tsx`
    - 展示创建时间、文件大小、标签、语言、字数
    - _Requirements: 5.7_

  - [x] 11.4 仅实现 AI 问答面板 UI `components/document-detail/AIChatPanel.tsx` 和 `ChatMessage.tsx`
    - **本阶段仅实现 UI，不实现真实 RAG 问答后端**
    - 可隐藏/展开的右侧面板
    - 消息列表区域（对话气泡样式）+ 底部输入框 + 发送按钮
    - 空白内容禁止提交（发送按钮置灰）
    - 发送按钮点击后仅展示 placeholder 回复（如"AI 问答功能即将上线"）
    - 不调用任何后端接口，不实现流式输出，不持久化对话
    - 使用 shadcn skill 查阅组件文档（Sheet、Input、Button、ScrollArea 等）
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 11.5 实现思维导图展示 `components/document-detail/MindmapViewer.tsx`
    - 使用 React Flow（@xyflow/react）渲染可交互树形图
    - 从 document_mindmaps.mindmap_json 读取预生成数据，转换为 React Flow nodes/edges 格式
    - 支持节点展开/折叠/点击定位到文档对应位置
    - 数据为空时显示提示 + 重新生成按钮
    - 重新生成：触发后轮询 mindmap_status（running → success/failed），成功后重新拉取数据
    - 超时 60 秒错误处理
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 11.6 实现 AI 总结卡片 `components/document-detail/SummaryCard.tsx`
    - 从 document_summaries 读取预生成数据
    - 结构化卡片：要点列表 + 核心摘要 + 关键词
    - 数据为空时显示提示 + 重新生成按钮
    - 重新生成：触发后轮询 summary_status（running → success/failed），成功后重新拉取数据
    - 超时 30 秒错误处理
    - 使用 shadcn skill 查阅组件文档（Card 等）
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 11.7 实现下载按钮 `components/document-detail/DownloadButton.tsx`
    - 右上角下载按钮
    - 生成中显示 spinner + 禁用按钮
    - 生成完成自动触发下载
    - 失败显示错误提示 + 恢复按钮
    - 使用 shadcn skill 查阅组件文档（Button 等）
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 11.8 组装文档详情页 `app/(main)/documents/[id]/page.tsx`
    - 整合 DocumentOutline、DocumentMeta、TemplateRenderer、TemplateSwitcher、AIChatPanel、MindmapViewer、SummaryCard、DownloadButton
    - 三栏布局：左侧（大纲+元信息）、中间（正文+思维导图+总结）、右侧（AI 面板可隐藏）
    - 加载中骨架屏 + 错误处理 + 重试
    - _Requirements: 5.1, 5.8, 5.9_

- [x] 12. Checkpoint - 确保文档详情页功能完整
  - 模板切换、大纲导航、AI 面板展开/收起、思维导图/总结展示、下载功能可用
  - AI 问答面板仅展示 UI，确认无后端调用
  - 重新生成功能状态流转正常（running → success/failed → 重新拉取）

- [ ] 13. 属性测试与单元测试
  - [ ]* 13.1 Property 1: 分页返回正确子集
    - **Validates: Requirements 1.1, 1.4**

  - [ ]* 13.2 Property 2: 文档卡片格式化截断
    - **Validates: Requirements 1.2**

  - [ ]* 13.3 Property 3: 搜索输入校验
    - **Validates: Requirements 2.1**

  - [ ]* 13.4 Property 7: 标签名称校验
    - **Validates: Requirements 3.2, 3.3**

  - [ ]* 13.5 Property 11: 模板切换数据不可变性
    - **Validates: Requirements 5.4**

  - [ ]* 13.6 Property 12: 标题大纲提取
    - **Validates: Requirements 5.5**

  - [ ]* 13.7 Property 13: 空白问题拒绝（UI 层）
    - **Validates: Requirements 6.5**

  - [ ]* 13.8 Property 22: 文件上传校验
    - **Validates: Requirements 11.1, 11.12**

  - [ ]* 13.9 Property 23: Markdown 图片 URL 重写
    - **Validates: Requirements 11.7**

  - [ ]* 13.10 Property 24: 文本分片正确性
    - **Validates: Requirements 11.9**

- [x] 14. Final Checkpoint
  - 确保所有功能模块正常运行
  - AI 问答模块确认为仅 UI 状态，后续迭代补充后端

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- **按既有数据库表结构实现，不重新设计数据库**。可设计 RLS 策略和 RPC 函数。
- **AI 问答模块本阶段仅实现 UI 面板，不实现真实 RAG 问答后端**
- Edge Functions 必须先于上传 Route Handler 完成部署（Task 3 → Task 4 → Task 6.2）
- AI 总结/思维导图重新生成状态流转：触发 → status='running' → 轮询 → success/failed → 重新拉取
- parse-document 图片失败处理：保留原始 alt 文本或文字提示，不生成空图片链接
- hybrid_search RPC 在 Task 2.2 中设计实现，Route Handler 6.7 依赖它
- 所有表使用软删除（deleted 字段 0/1）
- 模板类型：'default' | 'academic' | 'clean' | 'card'
- UI 组件任务中需使用 shadcn skill 查阅组件文档
- parse-document 任务中需使用 llama-index-docs MCP 查阅 LlamaParse API 文档
- Edge Function 部署统一在 Task 4 中使用 supabase power 的 deploy_edge_function 工具

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "3.1", "3.2", "3.3", "3.4"] },
    { "id": 2, "tasks": ["4"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3", "5.4"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9"] },
    { "id": 5, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 6, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.9"] },
    { "id": 7, "tasks": ["9.6", "9.7", "9.8", "9.10"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7"] },
    { "id": 9, "tasks": ["11.8"] },
    { "id": 10, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6", "13.7", "13.8", "13.9", "13.10"] }
  ]
}
```
