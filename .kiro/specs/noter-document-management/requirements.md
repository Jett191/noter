# Requirements Document

## Introduction

Noter 文档管理系统是一个基于 Next.js + React + Tailwind + shadcn/ui 架构的全功能文档管理平台。用户登录后进入文档管理页面（/documents），可以浏览、搜索、分类和查看文档，系统提供 AI 驱动的文档总结、思维导图生成和智能问答功能。数据管理通过 Supabase Auth、PostgreSQL 和 Supabase Storage 实现，RLS 策略保证数据隔离。系统支持文件夹组织文档，提供 Notion 风格的筛选排序功能。

## Glossary

- **Document_Manager**: 文档管理主页面，负责展示文档卡片列表、分页控件和搜索功能
- **Document_Card**: 文档卡片组件，展示文档标题、摘要、标签等基本信息，采用电影海报比例 (aspect-[2/3], max-w-[160px])
- **Pagination_Controller**: 分页控件，控制文档列表的分页浏览
- **Search_Engine**: 混合搜索引擎，支持向量搜索和关键词搜索
- **Tag_Manager**: 标签管理面板，负责标签的增删和筛选
- **User_Panel**: 用户操作面板，提供用户设置、登出和注销功能
- **Folder_Sidebar**: 文件夹导航组件，位于文档列表页左侧，提供文件夹树形导航
- **FilterSortBar**: Notion 风格筛选排序栏，位于文档列表主内容区顶部
- **Document_Detail**: 文档详情页，三栏布局：左侧大纲 | 中间正文(max-w-4xl) | 右侧元数据
- **Template_Renderer**: 前端内置模板渲染器，基于精细化主题架构，通过 react-markdown 的 components prop 自定义所有 HTML 元素渲染，支持 rehype-raw (HTML 标签渲染) 和 remark-math + rehype-katex (数学公式)
- **AI_Chat_Panel**: AI 问答交互面板，位于文档详情页右侧，支持围绕文档内容提问
- **AI_Mindmap_Generator**: AI 思维导图生成器，自动生成文档结构可视化
- **AI_Summary_Generator**: AI 总结生成器，生成卡片式文档摘要
- **Document_Outline**: 文档大纲组件，展示文档 h1-h6 所有层级标题结构，使用 shadcn ScrollArea，sticky top-28
- **Download_Service**: 下载服务，基于浏览器端 window.print() 方案，打开新窗口只包含文档正文+样式触发打印
- **RLS_Policy**: Supabase 行级安全策略，确保用户数据隔离
- **Vector_Store**: 向量存储，用于文档片段的向量化索引和语义检索（768 维，Gemini gemini-embedding-2）

## Requirements

### 需求 1：文档列表展示与分页

**用户故事：** 作为已登录用户，我希望在文档管理页面看到所有文档的卡片列表并支持分页浏览，以便快速定位和管理我的文档。

#### 验收标准

1. WHEN 用户登录成功后访问文档管理页面（/documents）, THE Document_Manager SHALL 采用左右布局：左侧为 FolderSidebar 文件夹导航，右侧为主内容区（搜索+FilterSortBar 筛选排序栏+文档卡片网格），默认按创建时间降序排列
2. THE Document_Card SHALL 采用电影海报比例 (aspect-[2/3], max-w-[160px])，展示文档标题（超过 50 字符时截断并显示省略号）、创建时间（格式为 YYYY-MM-DD HH:mm）、标签列表（最多显示 3 个标签，超出部分显示数量提示）和文档摘要（最多显示 100 字符，超出截断并显示省略号）
3. THE Document_Manager SHALL 以响应式网格展示文档卡片，列数为 3/4/5/6 列响应式适配
4. THE Pagination_Controller SHALL 在文档列表下方显示分页控件，包含页码导航和每页条数选择（可选值为 10、20、50，默认每页 10 条）
5. WHEN 用户点击分页控件中的页码, THE Document_Manager SHALL 加载并展示对应页的文档列表
6. WHILE 文档列表正在加载, THE Document_Manager SHALL 显示骨架屏占位符
7. IF 当前用户没有任何文档, THEN THE Document_Manager SHALL 显示空状态提示并提供上传文档的操作入口
8. IF 文档列表加载失败, THEN THE Document_Manager SHALL 显示错误提示信息并提供重试按钮，页面保持当前状态

### 需求 2：混合搜索

**用户故事：** 作为已登录用户，我希望通过搜索框快速检索文档，以便在大量文档中精准找到目标内容。

#### 验收标准

1. THE Search_Engine SHALL 在文档管理页面顶部提供统一搜索输入框，支持输入长度为 1 至 200 个字符的搜索关键词
2. WHEN 用户输入搜索关键词并提交, THE Search_Engine SHALL 同时执行向量语义搜索和关键词匹配搜索，并将两种搜索的结果按加权分数融合排序
3. THE Search_Engine SHALL 在文档标题和正文内容中进行检索（标签仅用于筛选，不参与搜索）
4. WHEN 搜索完成, THE Search_Engine SHALL 展示最多 50 条搜索结果，每条结果包含文档标题、匹配片段高亮摘要和标签列表
5. IF 搜索无匹配结果, THEN THE Search_Engine SHALL 显示无结果提示信息
6. WHILE 搜索请求正在处理, THE Search_Engine SHALL 显示加载指示器
7. IF 搜索请求在 10 秒内未返回结果或服务调用失败, THEN THE Search_Engine SHALL 取消请求并显示错误提示信息，允许用户重新搜索

### 需求 3：标签管理与筛选

**用户故事：** 作为已登录用户，我希望通过标签对文档进行分类管理和快速筛选，以便高效组织和查找文档。

#### 验收标准

1. THE Tag_Manager SHALL 展示当前用户的所有标签列表，每个标签显示其名称及关联的文档数量
2. WHEN 用户点击新增标签按钮并输入长度为 1 至 20 个字符的标签名称并确认, THE Tag_Manager SHALL 创建新标签并将其追加至标签列表末尾
3. IF 用户提交的标签名称为空或超过 20 个字符, THEN THE Tag_Manager SHALL 显示输入校验错误提示并阻止创建
4. WHEN 用户选择一个或多个标签, THE Document_Manager SHALL 仅展示包含所选标签中任意一个（OR 逻辑）的文档
5. WHEN 用户取消所有标签筛选, THE Document_Manager SHALL 恢复展示全部文档
6. IF 用户输入的标签名称已存在, THEN THE Tag_Manager SHALL 提示标签名称重复并阻止创建
7. WHEN 用户点击删除标签按钮, THE Tag_Manager SHALL 显示确认对话框，确认后移除该标签并解除与所有文档的关联
8. IF 用户在删除标签确认对话框中点击取消, THEN THE Tag_Manager SHALL 关闭对话框且不执行删除操作

### 需求 4：用户操作面板

**用户故事：** 作为已登录用户，我希望在页面左侧快速访问用户设置、登出和注销功能，以便管理我的账号。

#### 验收标准

1. THE User_Panel SHALL 显示当前用户的头像和用户名，用户名最多显示 20 个字符，超出部分以省略号截断
2. IF 当前用户未设置头像, THEN THE User_Panel SHALL 显示用户名首字符作为默认头像占位符
3. WHEN 用户点击用户设置选项, THE User_Panel SHALL 导航至用户设置页面
4. WHEN 用户点击登出按钮, THE User_Panel SHALL 清除用户会话并跳转至登录页面
5. WHEN 用户点击注销账号按钮, THE User_Panel SHALL 显示二次确认对话框，对话框中包含不可恢复操作的警告说明以及确认和取消两个操作按钮
6. WHEN 用户在注销确认对话框中点击取消按钮, THE User_Panel SHALL 关闭对话框并保持当前页面状态不变
7. WHEN 用户确认注销账号, THE User_Panel SHALL 删除用户账号及所有关联数据并在操作完成后跳转至登录页面
8. IF 注销操作失败, THEN THE User_Panel SHALL 显示错误提示信息并保持当前页面状态，用户数据不受影响

### 需求 5：文档详情页与内置模板化渲染

**用户故事：** 作为已登录用户，我希望点击文档卡片后进入详情页查看完整文档内容，并可在多种内置阅读模板之间切换，以便获得统一美观且适合不同场景的阅读体验。

#### 验收标准

1. WHEN 用户点击文档卡片, THE Document_Detail SHALL 导航至对应文档的详情页面
2. THE Document_Detail SHALL 采用三栏布局：左侧大纲（shadcn ScrollArea, sticky top-28）| 中间正文(max-w-4xl) | 右侧元数据面板
3. THE Template_Renderer SHALL 从数据库读取标准化 Markdown 内容，并根据用户当前选择的内置模板进行前端渲染展示，模板无背景色无卡片包裹
4. THE Template_Renderer SHALL 基于精细化主题架构（core/BaseMarkdownRenderer.tsx, core/TemplateHost.tsx, core/template-registry.ts），提供 4 种内置阅读模板：default（现代简约）、academic（学术论文）、compact（紧凑）、card（卡片），每个模板通过 react-markdown 的 components prop 自定义所有 HTML 元素渲染
5. THE Template_Renderer SHALL 支持 rehype-raw（HTML 标签渲染）和 remark-math + rehype-katex（数学公式渲染）
6. WHEN 用户切换阅读模板, THE Template_Renderer SHALL 立即以新模板重新渲染文档正文，切换仅影响展示效果，不改变数据库中的文档内容
7. THE Document_Outline SHALL 在文档详情页左侧展示文档 h1 至 h6 所有层级标题大纲，按嵌套缩进显示层级关系，不再过滤层级
8. WHEN 用户点击大纲中的标题项, THE Document_Detail SHALL 平滑滚动至对应正文位置，偏下 120px 显示，并触发蓝色闪烁高亮 2 次
9. THE Document_Detail SHALL 在右侧元数据面板展示文档详细信息，包括创建时间、文件大小、标签和作者信息
10. IF 文档内容在 15 秒内未加载完成或请求返回错误, THEN THE Document_Detail SHALL 显示错误提示信息并提供重试按钮
11. WHILE 文档内容正在加载, THE Document_Detail SHALL 显示骨架屏占位符
12. IF 文档正文中不包含任何标题元素, THEN THE Document_Outline SHALL 隐藏大纲区域
13. 本阶段不支持用户自定义字号、宽度、密度、行距，不提供自定义 CSS 或模板编辑器

### 需求 6：AI 问答交互面板（仅 UI）

**用户故事：** 作为已登录用户，我希望在文档详情页看到 AI 问答面板的界面，以便后续接入 AI 问答功能时有完整的交互入口。

#### 验收标准

1. THE AI_Chat_Panel SHALL 在文档详情页右侧提供可隐藏的问答交互面板 UI
2. THE AI_Chat_Panel SHALL 包含消息列表区域（对话气泡样式）和底部输入框 + 发送按钮
3. WHEN 用户点击隐藏按钮, THE AI_Chat_Panel SHALL 收起面板并释放页面空间
4. WHEN 用户点击展开按钮, THE AI_Chat_Panel SHALL 恢复显示面板
5. IF 用户提交空白内容或仅含空格的问题, THEN THE AI_Chat_Panel SHALL 禁止提交（发送按钮置灰）
6. 本阶段仅实现 UI 组件和交互动效，不实现后端接口调用、流式输出、对话历史持久化等逻辑，后续迭代补充

### 需求 7：AI 思维导图展示

**用户故事：** 作为已登录用户，我希望在文档详情页查看系统预生成的思维导图，以便可视化理解文档的整体结构。

#### 验收标准

1. WHEN 用户打开文档详情页, THE AI_Mindmap_Generator SHALL 从数据库读取该文档在上传解析阶段预生成的思维导图数据，并在文档正文下方展示
2. THE AI_Mindmap_Generator SHALL 以可交互的树形图形式展示思维导图，支持节点的展开、折叠和点击定位到文档对应位置
3. THE AI_Mindmap_Generator SHALL 基于文档标题层级（最多 6 级）和内容语义生成思维导图节点，节点总数不超过 200 个
4. IF 数据库中该文档的思维导图数据为空（如文档内容过短或生成失败）, THEN THE AI_Mindmap_Generator SHALL 显示提示信息并提供手动触发重新生成的按钮
5. WHEN 用户点击重新生成按钮, THE AI_Mindmap_Generator SHALL 调用 AI 服务重新生成思维导图并更新数据库记录
6. IF 重新生成在 60 秒内未完成或服务返回错误, THEN THE AI_Mindmap_Generator SHALL 显示错误提示信息并保留重新生成按钮

### 需求 8：AI 文档总结展示

**用户故事：** 作为已登录用户，我希望在文档详情页查看系统预生成的 AI 总结，以便快速了解文档核心内容而无需阅读全文。

#### 验收标准

1. WHEN 用户打开文档详情页, THE AI_Summary_Generator SHALL 从数据库读取该文档在上传解析阶段预生成的 AI 总结数据，并在思维导图下方以卡片形式展示
2. THE AI_Summary_Generator SHALL 展示结构化的总结卡片，包含不超过 5 条要点列表和不超过 200 字的核心摘要
3. IF 数据库中该文档的 AI 总结数据为空（如文档内容过短或生成失败）, THEN THE AI_Summary_Generator SHALL 显示提示信息并提供手动触发重新生成的按钮
4. WHEN 用户点击重新生成按钮, THE AI_Summary_Generator SHALL 调用 AI 服务重新生成总结并更新数据库记录
5. IF 重新生成在 30 秒内未完成或服务返回错误, THEN THE AI_Summary_Generator SHALL 显示错误提示信息并保留重新生成按钮

### 需求 9：文档下载

**用户故事：** 作为已登录用户，我希望将文档正文下载为 PDF，以便离线查看或分享。

#### 验收标准

1. THE Download_Service SHALL 在文档详情页右上角提供下载按钮（DownloadButton 组件仅需要 title prop，不需要 documentId）
2. WHEN 用户点击下载按钮, THE Download_Service SHALL 使用浏览器端 window.print() 方案：打开新窗口只包含文档正文+样式，触发浏览器打印对话框供用户保存为 PDF
3. THE Download_Service SHALL 确保打印窗口中的文档样式与当前模板渲染一致
4. IF 文档正文为空, THEN THE Download_Service SHALL 禁用下载按钮并显示提示

### 需求 10：数据安全与权限控制

**用户故事：** 作为已登录用户，我希望系统保证我的文档数据安全且仅自己可访问，以便放心存储私密文档。

#### 验收标准

1. THE RLS_Policy SHALL 确保每个用户仅能插入、查询、修改和删除与自身 user_id 关联的文档数据，对其他用户的文档数据的任何操作均返回空结果集
2. THE RLS_Policy SHALL 确保每个用户仅能访问与自身 user_id 关联的标签数据，对其他用户标签的任何操作均返回空结果集
3. WHEN 未持有有效会话令牌的用户尝试访问任何需认证的页面（包括文档管理、笔记、搜索等功能页面）, THE Document_Manager SHALL 在 1 秒内重定向至登录页面
4. THE RLS_Policy SHALL 确保文档存储路径以用户 ID 作为顶层目录前缀进行隔离，用户仅能读写自身 ID 目录下的文件
5. WHEN 用户会话令牌过期或被撤销, THE Document_Manager SHALL 在下一次页面请求或 API 调用时提示用户会话已失效，并在 2 秒内跳转至登录页面
6. IF 用户尝试通过直接构造请求访问其他用户的文档资源, THEN THE Document_Manager SHALL 返回 403 禁止访问响应且不泄露目标资源是否存在的信息
7. IF RLS_Policy 拦截到越权数据操作, THEN THE Document_Manager SHALL 记录该次访问尝试（包含请求用户 ID、目标资源 ID 和时间戳）并返回空结果集或拒绝响应

### 需求 11：文档上传、解析与标准化存储

**用户故事：** 作为已登录用户，我希望上传文档文件并由系统自动解析为标准化 Markdown 内容（含可访问的图片链接），以便后续进行渲染、搜索和 AI 分析。

#### 验收标准

1. THE Document_Manager SHALL 提供文档上传入口，支持拖拽和点击选择文件，支持的文件格式为 PDF、DOCX、PPTX、TXT 和 Markdown，单个文件大小上限为 50MB
2. WHEN 用户选择文件并确认上传, THE Document_Manager SHALL 校验文件格式和大小后将原始文件上传至 Supabase Storage 私有文件桶（路径格式为 `{user_id}/{document_id}`，不含文件名以避免中文路径问题）并创建文档记录，FormData 中可包含 folderId 字段指定目标文件夹
3. WHEN 原始文件上传成功, THE Document_Manager SHALL 调用 Supabase Edge Function 触发后续解析流程，前端不直接调用 LlamaParse
4. WHEN Edge Function 接收到解析请求, THE Edge Function SHALL 基于 Supabase Storage 中的原始文件路径生成临时访问链接（有效期 1 小时），并将该临时链接提交给 LlamaParse REST API 进行文档解析（使用 agentic tier，expand 参数包含 markdown_full 和 images_content_metadata）
5. WHEN LlamaParse 解析完成, THE Edge Function SHALL 获取返回的 Markdown 全文内容和图片资源的 presigned 下载地址列表
6. WHEN Edge Function 获取到图片资源列表, THE Edge Function SHALL 逐一下载图片并将图片转存至 Supabase Storage 公开资源桶（路径格式为 `public/{user_id}/{document_id}/{image_filename}`），获取对应的 Supabase 公网访问 URL
7. WHEN 图片转存完成, THE Edge Function SHALL 对 Markdown 内容进行标准化处理，将 Markdown 中所有指向 LlamaParse 临时图片地址的路径统一重写为 Supabase Storage 公开资源桶中的公网图片 URL
8. WHEN 标准化处理完成, THE Edge Function SHALL 将最终的标准化 Markdown 内容保存至数据库文档记录中（仅保存一份，不保存多份解析结果），并将文档状态更新为"解析完成"
9. WHEN 文档解析完成, THE Vector_Store SHALL 基于标准化 Markdown 内容按最大 1000 字符分片（片段间重叠 200 字符）并生成向量嵌入存储至数据库
10. WHEN 向量化完成, THE Edge Function SHALL 基于标准化 Markdown 内容调用 AI 服务生成文档总结（不超过 5 条要点 + 200 字核心摘要）和思维导图数据（JSON 格式的树形结构），并将结果保存至数据库文档记录中
11. WHILE 文档正在上传和解析, THE Document_Manager SHALL 显示当前处理阶段状态，阶段包括：上传中（含百分比进度）、解析中、图片处理中、向量化中、AI 生成中、完成
11. IF 文档格式不支持或文件大小超过上限, THEN THE Document_Manager SHALL 在上传前显示错误信息指明具体原因（格式不支持或超出大小限制）并阻止上传
12. IF LlamaParse 解析失败或 Edge Function 执行超时（超时时间 5 分钟）, THEN THE Edge Function SHALL 保留已上传的原始文件记录、将文档状态标记为"解析失败"并返回错误信息
13. IF 图片转存过程中部分图片下载失败, THEN THE Edge Function SHALL 在 Markdown 中保留失败图片的占位标记（标注为"图片加载失败"），继续处理其余图片，不中断整体解析流程
14. 后续文档详情页渲染、全文检索、文档分片、向量化处理、AI 问答、AI 总结和思维导图生成，均基于数据库中保存的这份标准化 Markdown 内容完成，不依赖 LlamaParse 的临时链接

### 需求 12：文件夹系统

**用户故事：** 作为已登录用户，我希望通过文件夹对文档进行层级组织管理，以便更直观地分类和查找文档。

#### 验收标准

1. THE Folder_Sidebar SHALL 在文档列表页左侧展示文件夹树形导航，支持嵌套文件夹结构
2. WHEN 用户点击新建文件夹按钮并输入文件夹名称, THE Folder_Sidebar SHALL 创建新文件夹并追加至文件夹列表
3. WHEN 用户点击某个文件夹, THE Document_Manager SHALL 仅展示该文件夹下的文档
4. THE Document_Manager SHALL 将 folder_id 为 null 的文档显示在"全部文档"视图中，没有默认文件夹概念
5. WHEN 用户上传文档时, THE Document_Manager SHALL 提供目标文件夹选择（Select 组件），允许用户指定文档所属文件夹
6. THE Folder_Sidebar SHALL 支持文件夹的重命名和删除操作（PATCH/DELETE /api/folders/[id]）
7. THE RLS_Policy SHALL 确保每个用户仅能访问与自身 user_id 关联的文件夹数据，对其他用户文件夹的任何操作均返回空结果集

### 需求 13：登录跳转

**用户故事：** 作为用户，我希望登录成功后直接进入文档管理页面，以便立即开始工作。

#### 验收标准

1. WHEN 用户通过邮箱/密码登录成功, THE Document_Manager SHALL 跳转至 /documents 页面
2. WHEN 用户通过 OAuth（GitHub）回调登录成功, THE Document_Manager SHALL 默认跳转至 /documents 页面
3. WHEN 用户通过邮箱确认链接验证成功, THE Document_Manager SHALL 跳转至 /documents 页面
