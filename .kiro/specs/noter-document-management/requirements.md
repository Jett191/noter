# Requirements Document

## Introduction

Noter 文档管理系统是一个基于 Next.js + React + Tailwind + shadcn/ui 架构的全功能文档管理平台。用户登录后进入文档管理页面（/documents），可以浏览、搜索、分类和查看文档，系统提供 AI 驱动的文档总结、思维导图生成和智能问答功能。数据管理通过 Supabase Auth、PostgreSQL 和 Supabase Storage 实现，RLS 策略保证数据隔离。系统支持文件夹组织文档，提供 Notion 风格的筛选排序功能。

随着功能迭代，系统已扩展出：电影海报式文档卡片与可自定义封面、顶部胶囊式导航栏（含搜索 / 上传 / 头像下拉）、独立的账号设置页（/profile）、与 noter-admin 平台对接的系统级访问开关与公共文档可见性、文档详情页内联标签管理、AI 问答面板的尺寸切换与布局联动、AI 状态轮询，以及「加载更多」式列表分页。

## Glossary

- **Document_Manager**: 文档管理主页面，负责展示文档卡片列表、加载更多控件和搜索功能
- **Document_Card**: 文档卡片组件，整张卡用封面图作为背景，底部毛玻璃面板叠加标题与标签，采用电影海报比例 (aspect-[2/3], max-w-[160px])
- **Document_Cover**: 文档封面图，存储在 Supabase Storage `userResources` 桶下 `{userId}/{documentId}.{ext}`，对应 documents.cover_url；未设置时由前端基于文档 ID 哈希在 5 张内置默认封面（蓝/绿/粉/紫/黄）中稳定选取
- **Document_Card_Menu**: 文档卡片左上角三点操作菜单，含「更换背景图」「恢复默认封面」「删除文档」
- **Documents_Header**: 文档列表页顶部 sticky 胶囊导航栏，承载 logo、品牌名、搜索框、上传按钮与用户头像下拉
- **Document_Detail_Header**: 文档详情页顶部 sticky 胶囊导航栏，承载返回、面包屑（用户名 → 文件夹链 → 文档标题）、模板切换、下载、AI 问答开关
- **UserAvatarDropdown**: 用户头像下拉菜单，位于 Documents_Header 右侧，承载用户名 / 邮箱、编辑资料、登出操作
- **Profile_Page**: 账号设置页（/profile），多 Tab 布局：个人资料 / 修改密码 / 修改邮箱
- **Load_More_Controller**: 加载更多控件，在文档列表底部以「加载更多」按钮 + `X / Y documents` 计数 + 「已经到底啦」终态提示替代页码分页
- **Search_Engine**: 混合搜索引擎，支持向量语义搜索和关键词搜索；前端入口在 Documents_Header 中
- **Tag_Manager**: 标签管理面板，负责标签的增删和筛选
- **Document_Tag_Picker**: 文档详情页元数据面板内的标签选择器，支持搜索全部标签、勾选已有标签、「创建并添加 X」一键新建并挂在当前文档上
- **Folder_Sidebar**: 文件夹导航组件，位于文档列表页左侧，提供文件夹树形导航
- **System_Folder**: 系统文件夹（folders.is_system_folder=true），由 noter-admin 平台维护，挂在系统账号下，对普通用户只读可见且置顶展示
- **Public_Document**: 公共文档（documents.document_scope='public'），由系统账号持有，对所有登录用户只读可见
- **FilterSortBar**: Notion 风格筛选排序栏，位于文档列表主内容区顶部，承载状态 / 收藏 / 文件类型 / 创建时间筛选与多字段排序，活跃条件以 chip 形式展示
- **Document_Detail**: 文档详情页，三栏布局：左侧大纲 | 中间正文(max-w-4xl) | 右侧（元数据 + AI 问答容器），右侧栏宽度随 AI 面板尺寸切换
- **Template_Renderer**: 前端内置模板渲染器，基于精细化主题架构，通过 react-markdown 的 components prop 自定义所有 HTML 元素渲染，支持 rehype-raw (HTML 标签渲染) 和 remark-math + rehype-katex (数学公式)
- **AI_Chat_Panel**: 文档详情页右侧的 AI 问答面板容器，支持 normal / tall / wide 三种尺寸切换、显隐切换并与文档元数据 / 大纲布局联动；具体 Skill / 卡片 / SSE 协议见 noter-agent spec
- **AI_Mindmap_Generator**: AI 思维导图生成器，自动生成文档结构可视化，前端使用 React Flow 渲染左→右树形布局
- **AI_Summary_Generator**: AI 总结生成器，生成卡片式文档摘要（核心摘要 + 关键要点 + 关键词）
- **Document_Outline**: 文档大纲组件，展示文档 h1-h6 所有层级标题结构，使用 shadcn ScrollArea，sticky top-28
- **Download_Service**: 下载服务，基于浏览器端 window.print() 方案，打开新窗口只包含文档正文+样式触发打印
- **System_Settings_Gate**: 系统级访问开关读取层（lib/settings/readSetting），读取 system_settings 表中 allow_user_upload / allow_user_delete_own / public_documents_visible 等开关，30s 进程内缓存，由 noter-admin 平台维护
- **RLS_Policy**: Supabase 行级安全策略，确保用户数据隔离
- **Vector_Store**: 向量存储，用于文档片段的向量化索引和语义检索（768 维，Gemini gemini-embedding-2）

## Requirements

### 需求 1：文档列表展示与「加载更多」分页

**用户故事：** 作为已登录用户，我希望在文档管理页面看到所有文档的卡片列表并支持以「加载更多」的方式翻阅，以便快速定位和管理我的文档。

#### 验收标准

1. WHEN 用户登录成功后访问文档管理页面（/documents）, THE Document_Manager SHALL 采用三段式布局：左侧 Folder_Sidebar 文件夹导航、中间主内容区（FilterSortBar + 文档卡片网格 + Load_More_Controller）、右侧标签筛选面板（TagFilterList）；搜索 / 上传 / 用户头像下拉位于页面顶部 sticky 胶囊式 Documents_Header
2. THE Document_Card SHALL 采用电影海报比例 (aspect-[2/3], max-w-[160px])，整张卡片以封面图作为背景，底部毛玻璃面板叠加显示文档标题（超过 50 字符时截断并显示省略号）、最多 3 个标签 chip，超出部分以「+N」提示
3. THE Document_Manager SHALL 以响应式网格展示文档卡片，列数为 3/4/5/6 列响应式适配
4. THE Load_More_Controller SHALL 在文档列表下方提供「加载更多」按钮，并以 `X / Y documents` 形式实时显示当前已加载条目数与总数；点击按钮加载下一页文档（默认 pageSize=10）并追加到现有网格末尾，列表整体不重置
5. WHEN 已加载条目数大于等于总数, THE Load_More_Controller SHALL 隐藏「加载更多」按钮并展示「已经到底啦」终态提示
6. WHILE 文档列表正在加载首页, THE Document_Manager SHALL 显示骨架屏占位符
7. WHILE Load_More_Controller 正在加载下一页, THE Load_More_Controller SHALL 在按钮位置显示加载指示器并禁用重复点击
8. IF 当前用户没有任何文档, THEN THE Document_Manager SHALL 显示空状态提示并提供上传文档的操作入口
9. IF 文档列表加载失败, THEN THE Document_Manager SHALL 显示错误提示信息并提供重试按钮，页面保持当前状态

### 需求 2：混合搜索

**用户故事：** 作为已登录用户，我希望通过顶部导航栏的搜索框快速检索文档，以便在大量文档中精准找到目标内容并直接定位到正文命中位置。

#### 验收标准

1. THE Search_Engine SHALL 在 Documents_Header 右侧提供搜索输入框，支持输入长度为 1 至 200 个字符的搜索关键词
2. WHEN 用户在搜索框中输入内容, THE Search_Engine SHALL 在停止输入 300 毫秒后（防抖）发起一次混合搜索请求，避免连续输入产生过多请求
3. WHEN 用户提交一次有效搜索, THE Search_Engine SHALL 同时执行向量语义搜索和关键词匹配搜索，并将两种搜索的结果按加权分数融合后按 score 降序排序
4. THE Search_Engine SHALL 在文档标题和正文内容中进行检索（标签仅用于筛选，不参与搜索）
5. WHEN 搜索完成, THE Search_Engine SHALL 在搜索框下方下拉中展示最多 50 条搜索结果，每条结果包含：文件图标、文档标题（超长 truncate）、命中类型 chip（关键词 / 语义 / 混合，分别使用不同颜色与图标）、命中片段（最多 220 字符截断，剥离 markdown 语法符号）
6. WHEN 命中类型为关键词或混合, THE Search_Engine SHALL 直接复用服务端 ts_headline 返回的 `<mark>...</mark>` 高亮标记进行渲染；WHEN 命中类型为语义, THE Search_Engine SHALL 在客户端使用查询词对片段进行高亮兜底
7. WHEN 用户点击下拉中的某条搜索结果, THE Search_Engine SHALL 跳转到 `/documents/{id}?match={anchor}&q={query}`，其中 anchor 为命中片段经裁剪的纯文本短语
8. WHEN 文档详情页检测到 URL 中带有 match 或 q 参数, THE Document_Detail SHALL 在正文渲染完成后查找首个匹配文本，平滑滚动到该位置（top - 120px）并触发黄色背景闪烁高亮 2 次；处理完成后清除 URL 中的 match / q 参数避免重复触发
9. IF 搜索无匹配结果, THEN THE Search_Engine SHALL 显示无结果提示信息
10. WHILE 搜索请求正在处理, THE Search_Engine SHALL 在搜索框右侧显示加载指示器
11. IF 搜索请求在 10 秒内未返回结果或服务调用失败, THEN THE Search_Engine SHALL 取消请求并在结果下拉中显示错误提示与「重试」按钮，允许用户重新搜索

### 需求 3：标签管理与筛选

**用户故事：** 作为已登录用户，我希望通过标签对文档进行分类管理和快速筛选，以便高效组织和查找文档。

#### 验收标准

1. THE Tag_Manager SHALL 在文档列表页右侧标签筛选面板（TagFilterList）中展示当前用户的所有标签，每个标签显示其名称及关联的文档数量
2. WHEN 用户点击新增标签按钮并输入长度为 1 至 20 个字符的标签名称并确认, THE Tag_Manager SHALL 创建新标签并将其追加至标签列表末尾
3. IF 用户提交的标签名称为空或超过 20 个字符, THEN THE Tag_Manager SHALL 显示输入校验错误提示并阻止创建
4. WHEN 用户选择一个或多个标签, THE Document_Manager SHALL 仅展示包含所选标签中任意一个（OR 逻辑）的文档
5. WHEN 用户取消所有标签筛选, THE Document_Manager SHALL 恢复展示全部文档
6. IF 用户输入的标签名称已存在, THEN THE Tag_Manager SHALL 提示标签名称重复并阻止创建
7. WHEN 用户点击删除标签按钮, THE Tag_Manager SHALL 显示确认对话框，确认后移除该标签并解除与所有文档的关联
8. IF 用户在删除标签确认对话框中点击取消, THEN THE Tag_Manager SHALL 关闭对话框且不执行删除操作

### 需求 4：用户头像下拉菜单

**用户故事：** 作为已登录用户，我希望在页面顶部右侧通过头像下拉访问账号信息、编辑资料和登出，以便随时管理我的账号。

#### 验收标准

1. THE UserAvatarDropdown SHALL 位于 Documents_Header 右侧，作为整站登录用户的统一账号入口
2. THE UserAvatarDropdown SHALL 在触发器位置显示当前用户头像；WHEN 用户已配置 avatarUrl, THE UserAvatarDropdown SHALL 优先使用 user.avatarUrl 作为头像图片来源
3. IF 当前用户未配置 avatarUrl, THEN THE UserAvatarDropdown SHALL 显示用户名（缺省时为邮箱）首字符的大写形式作为占位头像
4. WHEN 用户点击头像触发下拉, THE UserAvatarDropdown SHALL 在面板顶部展示当前用户的用户名与邮箱标签（均做 truncate 处理）
5. THE UserAvatarDropdown SHALL 提供「编辑资料」与「登出」两个操作项
6. WHEN 用户点击「编辑资料」, THE UserAvatarDropdown SHALL 关闭下拉并跳转至 /profile 页面
7. WHEN 用户点击「登出」, THE UserAvatarDropdown SHALL 调用登出接口、清除前端用户会话状态，并跳转至 /signin 页面
8. IF 登出接口调用失败, THEN THE UserAvatarDropdown SHALL 仍清除本地会话状态并跳转至登录页面，避免用户停留在受认证保护的页面
9. THE UserAvatarDropdown SHALL 不再提供「注销账号」入口（账号注销能力迁移至 /profile 或当前不提供）

### 需求 5：文档详情页与内置模板化渲染

**用户故事：** 作为已登录用户，我希望点击文档卡片后进入详情页查看完整文档内容，并可在多种内置阅读模板之间切换，以便获得统一美观且适合不同场景的阅读体验。

#### 验收标准

1. WHEN 用户点击文档卡片, THE Document_Detail SHALL 导航至对应文档的详情页面
2. THE Document_Detail SHALL 采用三栏布局：左侧大纲（shadcn ScrollArea, sticky top-28）| 中间正文(max-w-4xl) | 右侧（元数据面板 + AI 问答面板容器）；右侧栏宽度随 AI_Chat_Panel 状态切换：未开启 AI 时为 288px，AI 处于 normal 或 tall 时为 420px，AI 处于 wide 时为 640px
3. WHILE AI_Chat_Panel 处于 tall 尺寸, THE Document_Detail SHALL 在右侧栏中以 AI 面板覆盖文档元数据但保留左侧大纲
4. WHILE AI_Chat_Panel 处于 wide 尺寸, THE Document_Detail SHALL 同时隐藏文档元数据与左侧大纲，正文与 AI 面板形成两栏布局
5. THE Template_Renderer SHALL 从数据库读取标准化 Markdown 内容，并根据用户当前选择的内置模板进行前端渲染展示，模板无背景色无卡片包裹
6. THE Template_Renderer SHALL 基于精细化主题架构（core/BaseMarkdownRenderer.tsx, core/TemplateHost.tsx, core/template-registry.ts），提供 4 种内置阅读模板：default（现代简约）、academic（学术论文）、compact（紧凑）、card（卡片），每个模板通过 react-markdown 的 components prop 自定义所有 HTML 元素渲染
7. THE Template_Renderer SHALL 支持 rehype-raw（HTML 标签渲染）和 remark-math + rehype-katex（数学公式渲染）
8. WHEN 用户切换阅读模板, THE Template_Renderer SHALL 立即以新模板重新渲染文档正文，切换仅影响展示效果，不改变数据库中的文档内容
9. THE Document_Outline SHALL 在文档详情页左侧展示文档 h1 至 h6 所有层级标题大纲，按嵌套缩进显示层级关系，不再过滤层级
10. WHEN 用户点击大纲中的标题项, THE Document_Detail SHALL 平滑滚动至对应正文位置，偏下 120px 显示，并触发蓝色闪烁高亮 2 次
11. THE Document_Detail SHALL 在右侧元数据面板中展示文档详细信息，包括：创建时间、文件大小、语言、字数和标签管理区域；标签管理区域包含已挂载标签的可移除 chip 与「添加标签」入口
12. IF 文档内容在 15 秒内未加载完成或请求返回错误, THEN THE Document_Detail SHALL 显示错误提示信息并提供重试按钮
13. WHILE 文档内容正在加载, THE Document_Detail SHALL 显示骨架屏占位符
14. IF 文档正文中不包含任何标题元素, THEN THE Document_Outline SHALL 隐藏大纲区域
15. 本阶段不支持用户自定义字号、宽度、密度、行距，不提供自定义 CSS 或模板编辑器

### 需求 6：AI 问答面板容器（容器与布局，不含 Skill 实现）

**用户故事：** 作为已登录用户，我希望在文档详情页方便地展开和管理 AI 问答面板，以便在阅读文档时随时获得 AI 的辅助。

#### 验收标准

1. THE AI_Chat_Panel SHALL 在文档详情页右侧栏中作为可显隐的容器，承载 noter-agent 提供的对话能力
2. WHEN 用户点击 Document_Detail_Header 右侧的 AI 问答开关, THE AI_Chat_Panel SHALL 在显示与隐藏两种状态之间切换
3. WHEN AI_Chat_Panel 由显示切换到隐藏, THE AI_Chat_Panel SHALL 同时把面板尺寸自动重置为 normal，避免下次打开时仍停留在 tall 或 wide 状态
4. THE AI_Chat_Panel SHALL 提供三种尺寸：normal（默认右侧栏内）、tall（向上拉长以覆盖元数据，保留大纲）、wide（双列布局，同时隐藏大纲与元数据）
5. WHEN 用户在 AI_Chat_Panel 头部切换尺寸, THE Document_Detail SHALL 按需求 5.2 / 5.3 / 5.4 调整三栏宽度与元数据 / 大纲的显隐
6. 本需求只描述 AI_Chat_Panel 在文档详情页中的容器化与布局联动行为；具体的 Skill 列表（/brief、/tutor、/explain、/actions、/quiz）、SkillLaunchpad、SlashCommandMenu、SessionBanner、FollowUpChips、结构化卡片、SSE 协议与会话表结构等内容由 noter-agent spec 单独定义，不在本 spec 范围内

### 需求 7：AI 思维导图展示

**用户故事：** 作为已登录用户，我希望在文档详情页查看系统预生成的思维导图，以便可视化理解文档的整体结构。

#### 验收标准

1. WHEN 用户打开文档详情页, THE AI_Mindmap_Generator SHALL 从数据库读取该文档在上传解析阶段预生成的思维导图数据，并在文档正文下方展示
2. THE AI_Mindmap_Generator SHALL 使用 React Flow（@xyflow/react）渲染左→右树形布局：根节点居中，子节点按子树高度自动分布，连线类型为 smoothstep；最小缩放 0.3、最大缩放 2，自带 Background 与 Controls 组件，关闭官方水印
3. THE AI_Mindmap_Generator SHALL 基于文档标题层级（最多 6 级）和内容语义生成思维导图节点，节点总数不超过 200 个
4. WHILE 思维导图数据为空且 mindmap_status 仍处于 pending 或 running 状态, THE AI_Mindmap_Generator SHALL 显示「AI 正在生成思维导图」加载占位
5. IF 思维导图数据为空且 mindmap_status 已为终态（success 或 failed）, THEN THE AI_Mindmap_Generator SHALL 显示「暂无思维导图」提示并提供「生成思维导图」按钮
6. WHEN 用户点击「重新生成」或「生成思维导图」按钮, THE AI_Mindmap_Generator SHALL 调用 POST /api/ai/regenerate-mindmap 触发后端重新生成，并按需求 20 中描述的方式轮询状态直到 success 或 failed
7. IF 重新生成在 5 分钟内未完成或服务返回错误, THEN THE AI_Mindmap_Generator SHALL 在按钮位置展示错误提示并保留重新生成入口

### 需求 8：AI 文档总结展示

**用户故事：** 作为已登录用户，我希望在文档详情页查看系统预生成的 AI 总结，以便快速了解文档核心内容而无需阅读全文。

#### 验收标准

1. WHEN 用户打开文档详情页, THE AI_Summary_Generator SHALL 从数据库读取该文档在上传解析阶段预生成的 AI 总结数据，并在思维导图下方以卡片形式展示
2. THE AI_Summary_Generator SHALL 在 SummaryCard 中展示：核心摘要（不超过 200 字）、关键要点（最多 5 条）、关键词（chip 列表）
3. WHILE 总结数据为空且 summary_status 仍处于 pending 或 running 状态, THE AI_Summary_Generator SHALL 显示「AI 正在生成总结」加载占位
4. IF 总结数据为空且 summary_status 已为终态, THEN THE AI_Summary_Generator SHALL 显示「暂无 AI 总结」提示并提供「生成总结」按钮
5. WHEN 用户点击「重新生成」或「生成总结」按钮, THE AI_Summary_Generator SHALL 调用 POST /api/ai/regenerate-summary 触发后端重新生成，并按需求 20 中描述的方式轮询状态直到 success 或 failed
6. IF 重新生成在 5 分钟内未完成或服务返回错误, THEN THE AI_Summary_Generator SHALL 在按钮位置展示错误提示并保留重新生成入口
7. THE AI_Summary_Generator SHALL 在数据库字段层面保留 todos 与 suitable_scenarios 字段以兼容后端结构，但本期 UI 不渲染这两个字段

### 需求 9：文档下载

**用户故事：** 作为已登录用户，我希望将文档正文下载为 PDF，以便离线查看或分享。

#### 验收标准

1. THE Download_Service SHALL 在 Document_Detail_Header 右侧（位于模板切换与 AI 问答开关之间）提供下载按钮（DownloadButton 组件仅需要 title prop，不需要 documentId）
2. WHEN 用户点击下载按钮, THE Download_Service SHALL 使用浏览器端 window.print() 方案：打开新窗口只包含文档正文+样式，触发浏览器打印对话框供用户保存为 PDF
3. THE Download_Service SHALL 确保打印窗口中的文档样式与当前模板渲染一致
4. IF 文档正文为空, THEN THE Download_Service SHALL 禁用下载按钮并显示提示

### 需求 10：数据安全与权限控制

**用户故事：** 作为已登录用户，我希望系统保证我的文档数据安全且仅自己可访问，同时管理员能够通过系统级开关统一控制平台行为，以便放心存储私密文档。

#### 验收标准

1. THE RLS_Policy SHALL 确保每个用户仅能插入、查询、修改和删除与自身 user_id 关联的文档数据，对其他用户的文档数据的任何操作均返回空结果集
2. THE RLS_Policy SHALL 确保每个用户仅能访问与自身 user_id 关联的标签数据，对其他用户标签的任何操作均返回空结果集
3. WHEN 未持有有效会话令牌的用户尝试访问任何需认证的页面（包括文档管理、笔记、搜索、账号设置等功能页面）, THE Document_Manager SHALL 在 1 秒内重定向至登录页面
4. THE RLS_Policy SHALL 确保文档存储路径以用户 ID 作为顶层目录前缀进行隔离，用户仅能读写自身 ID 目录下的文件
5. WHEN 用户会话令牌过期或被撤销, THE Document_Manager SHALL 在下一次页面请求或 API 调用时提示用户会话已失效，并在 2 秒内跳转至登录页面
6. IF 用户尝试通过直接构造请求访问其他用户的私有文档资源, THEN THE Document_Manager SHALL 返回 403 禁止访问响应且不泄露目标资源是否存在的信息
7. IF RLS_Policy 拦截到越权数据操作, THEN THE Document_Manager SHALL 记录该次访问尝试（包含请求用户 ID、目标资源 ID 和时间戳）并返回空结果集或拒绝响应
8. THE System_Settings_Gate SHALL 从 system_settings 表读取系统级访问开关（allow_user_upload、allow_user_delete_own、public_documents_visible），在进程内缓存 30 秒，并在读取失败时回退为各开关默认值 true，避免门控代码把整条 API 拖垮
9. IF 系统设置 allow_user_upload 为 false, THEN THE Document_Manager SHALL 在 POST /api/documents/upload 入口直接返回 403 并提示「当前不允许上传文档」
10. IF 系统设置 allow_user_delete_own 为 false, THEN THE Document_Manager SHALL 在 DELETE /api/documents/[id] 入口返回 403 并提示「当前不允许删除文档」
11. WHILE 系统设置 public_documents_visible 为 true, THE Document_Manager SHALL 在 GET /api/documents 与 GET /api/documents/[id] 中以 `user_id=auth.uid() OR document_scope='public'` 合并查询私有文档与公共文档；WHILE 该开关为 false, THE Document_Manager SHALL 仅返回 user_id=auth.uid() 的私有文档
12. THE Document_Manager SHALL 在 GET /api/documents/[id] 的响应中带上 documentScope 字段（'private' / 'public'），便于前端按只读语义渲染公共文档
13. IF 普通用户尝试删除一篇 document_scope='public' 的公共文档, THEN THE RLS_Policy SHALL 拒绝该删除请求；公共文档仅由系统账号 / 管理员通过 noter-admin 平台维护

### 需求 11：文档上传、解析与标准化存储

**用户故事：** 作为已登录用户，我希望上传文档文件并由系统自动解析为标准化 Markdown 内容（含可访问的图片链接），以便后续进行渲染、搜索和 AI 分析。

#### 验收标准

1. THE Document_Manager SHALL 提供文档上传入口，支持拖拽和点击选择文件，支持的文件格式为 PDF、DOCX、PPTX、TXT 和 Markdown，单个文件大小上限为 50MB
2. THE Document_Manager SHALL 在 UploadDialog 中支持一次性拖入或选择多个文件；对一次选择中的所有文件按文件名 + 文件大小去重，校验失败的文件统一在一条提示中展示，校验通过的文件进入待上传队列
3. THE Document_Manager SHALL 在 UploadDialog 中提供「保存到」目标文件夹选择（Select 组件，列出当前用户文件夹）；未选择时上传后的文档 folder_id 为 null，落在「全部文档」中
4. WHEN 用户确认上传单个文件, THE Document_Manager SHALL 校验文件格式和大小后将原始文件上传至 Supabase Storage 私有文件桶（路径格式为 `{user_id}/{document_id}`，不含文件名以避免中文路径问题）并创建文档记录，FormData 中包含 file 字段与可选的 folderId 字段
5. WHEN 用户确认上传多个文件, THE Document_Manager SHALL 顺序逐个调用上传接口，并在 UploadDialog 中展示「正在上传 X / N」紧凑总进度条；全部上传结束后展示成功 / 失败结果汇总，失败原因在悬停时可见
6. WHILE 上传过程进行中（无论单文件或多文件）, THE Document_Manager SHALL 禁止关闭 UploadDialog，避免请求被打断
7. WHEN 单文件上传成功, THE Document_Manager SHALL 沿用原有 UploadProgress 组件展示阶段化进度（上传中 → 解析中 → AI 处理中 → 完成）并在解析完成后显示「立即查看文档」按钮
8. WHEN 原始文件上传成功, THE Document_Manager SHALL 调用 Supabase Edge Function 触发后续解析流程，前端不直接调用 LlamaParse
9. WHEN Edge Function 接收到解析请求, THE Edge Function SHALL 基于 Supabase Storage 中的原始文件路径生成临时访问链接（有效期 1 小时），并将该临时链接提交给 LlamaParse REST API 进行文档解析（使用 agentic tier，expand 参数包含 markdown_full 和 images_content_metadata）
10. WHEN LlamaParse 解析完成, THE Edge Function SHALL 获取返回的 Markdown 全文内容和图片资源的 presigned 下载地址列表
11. WHEN Edge Function 获取到图片资源列表, THE Edge Function SHALL 逐一下载图片并将图片转存至 Supabase Storage 公开资源桶（路径格式为 `public/{user_id}/{document_id}/{image_filename}`），获取对应的 Supabase 公网访问 URL
12. WHEN 图片转存完成, THE Edge Function SHALL 对 Markdown 内容进行标准化处理，将 Markdown 中所有指向 LlamaParse 临时图片地址的路径统一重写为 Supabase Storage 公开资源桶中的公网图片 URL
13. WHEN 标准化处理完成, THE Edge Function SHALL 将最终的标准化 Markdown 内容保存至数据库文档记录中（仅保存一份，不保存多份解析结果），并将文档状态更新为「解析完成」
14. WHEN 文档解析完成, THE Vector_Store SHALL 基于标准化 Markdown 内容按最大 1000 字符分片（片段间重叠 200 字符）并生成向量嵌入存储至数据库
15. WHEN 向量化完成, THE Edge Function SHALL 基于标准化 Markdown 内容调用 AI 服务生成文档总结（不超过 5 条要点 + 200 字核心摘要）和思维导图数据（JSON 格式的树形结构），并将结果保存至数据库文档记录中
16. WHILE 文档正在上传和解析, THE Document_Manager SHALL 显示当前处理阶段状态，阶段包括：上传中（含百分比进度）、解析中、图片处理中、向量化中、AI 生成中、完成
17. IF 文档格式不支持或文件大小超过上限, THEN THE Document_Manager SHALL 在上传前显示错误信息指明具体原因（格式不支持或超出大小限制）并阻止上传
18. IF LlamaParse 解析失败或 Edge Function 执行超时（超时时间 5 分钟）, THEN THE Edge Function SHALL 保留已上传的原始文件记录、将文档状态标记为「解析失败」并返回错误信息
19. IF 图片转存过程中部分图片下载失败, THEN THE Edge Function SHALL 在 Markdown 中保留失败图片的占位标记（标注为「图片加载失败」），继续处理其余图片，不中断整体解析流程
20. 后续文档详情页渲染、全文检索、文档分片、向量化处理、AI 问答、AI 总结和思维导图生成，均基于数据库中保存的这份标准化 Markdown 内容完成，不依赖 LlamaParse 的临时链接

### 需求 12：文件夹系统

**用户故事：** 作为已登录用户，我希望通过文件夹对文档进行层级组织管理，并能看到由平台维护的系统文件夹，以便更直观地分类和查找文档。

#### 验收标准

1. THE Folder_Sidebar SHALL 在文档列表页左侧展示文件夹树形导航，支持嵌套文件夹结构
2. THE Folder_Sidebar SHALL 在每个文件夹右侧展示其文档数量（folder.documentCount）：用户私有文件夹按用户私有文档计数，System_Folder 按 document_scope='public' 的公共文档计数
3. WHEN 用户点击新建文件夹按钮并输入文件夹名称, THE Folder_Sidebar SHALL 在该用户名下创建新文件夹并追加至文件夹列表
4. WHEN 用户点击某个文件夹, THE Document_Manager SHALL 仅展示该文件夹下的文档，并通过 URL `?folderId=` query 参数与页面 store 双向同步当前选中状态，便于刷新与分享链接
5. THE Document_Manager SHALL 将 folder_id 为 null 的文档显示在「全部文档」视图中，没有默认文件夹概念
6. WHEN 用户上传文档时, THE Document_Manager SHALL 提供目标文件夹选择（Select 组件），允许用户指定文档所属文件夹
7. THE Folder_Sidebar SHALL 支持用户私有文件夹的重命名和删除操作（PATCH/DELETE /api/folders/[id]）
8. WHEN 某个用户私有文件夹被删除, THE Document_Manager SHALL 将该文件夹下属的所有文档的 folder_id 置为 null，使其回到「全部文档」视图
9. THE Folder_Sidebar SHALL 在 GET /api/folders 中合并返回 `user_id=auth.uid() OR is_system_folder=true` 两类文件夹，System_Folder 置顶展示，并在响应中带上 isSystemFolder 字段供前端渲染只读样式
10. WHILE 当前选中的文件夹是 System_Folder, THE Folder_Sidebar SHALL 禁用重命名 / 删除入口，且 Document_Manager 不再展示「上传文档到此文件夹」「在其下新建子文件夹」入口
11. IF 普通用户调用 PATCH /api/folders/[id] 或 DELETE /api/folders/[id] 操作的目标是 System_Folder, THEN THE Folder_Sidebar SHALL 在业务层显式返回 403「系统文件夹不可修改 / 不可删除」，RLS 作为兜底保护
12. THE RLS_Policy SHALL 确保每个用户仅能访问与自身 user_id 关联的私有文件夹，对其他用户私有文件夹的任何操作均返回空结果集；System_Folder 仅放开 SELECT 权限给所有 authenticated 用户

### 需求 13：登录跳转

**用户故事：** 作为用户，我希望登录成功后直接进入文档管理页面，以便立即开始工作。

#### 验收标准

1. WHEN 用户通过邮箱/密码登录成功, THE Document_Manager SHALL 跳转至 /documents 页面
2. WHEN 用户通过 OAuth（GitHub）回调登录成功, THE Document_Manager SHALL 默认跳转至 /documents 页面
3. WHEN 用户通过邮箱确认链接验证成功, THE Document_Manager SHALL 跳转至 /documents 页面

### 需求 14：文档封面与卡片操作菜单

**用户故事：** 作为已登录用户，我希望为文档卡片设置自定义封面、随时恢复默认封面，并直接在卡片上发起删除，以便快速识别和管理文档。

#### 验收标准

1. THE Document_Card SHALL 在卡片左上角显示 Document_Card_Menu（三点按钮），菜单项包含：「更换背景图」「恢复默认封面」（仅当当前文档存在自定义封面时显示）、「删除文档」
2. WHEN 用户点击「更换背景图」并选择本地图片, THE Document_Card SHALL 校验文件类型为 JPG / PNG / WebP / GIF 且大小不超过 5MB，将文件上传至 Supabase Storage `userResources` 桶下 `{userId}/{documentId}.{ext}` 路径，并将公开访问 URL 写入 documents.cover_url
3. IF 用户选择的封面文件类型不在允许列表内或大小超过 5MB, THEN THE Document_Card SHALL 在卡片层面提示具体错误并阻止上传
4. WHEN 用户点击「恢复默认封面」, THE Document_Card SHALL 将 documents.cover_url 置空并删除 Storage 中已存在的旧封面文件
5. WHILE documents.cover_url 为空, THE Document_Card SHALL 基于文档 ID 哈希在 5 张内置默认封面（蓝 / 绿 / 粉 / 紫 / 黄）中稳定选取一张作为背景图，避免每次刷新跳变
6. WHEN 用户点击 Document_Card_Menu 中的「删除文档」, THE Document_Card SHALL 弹出二次确认对话框；WHEN 用户在对话框中确认删除, THE Document_Manager SHALL 乐观更新本地文档列表（先从列表移除并扣减总数），调用 DELETE /api/documents/[id] 执行软删除
7. IF 删除文档接口调用失败, THEN THE Document_Manager SHALL 回滚本地列表与计数，并向用户展示错误提示
8. WHEN 用户在删除确认对话框中点击取消, THE Document_Card SHALL 关闭对话框且不执行任何变更

### 需求 15：顶部胶囊式导航栏

**用户故事：** 作为已登录用户，我希望在文档列表页与文档详情页都看到一个统一风格的顶部胶囊导航栏，以便随时进行搜索、上传、返回、切换模板和打开 AI 问答。

#### 验收标准

1. THE Documents_Header SHALL 在 /documents 页面顶部以 sticky 形式存在；左侧依次为 logo 与品牌名 noter，右侧依次为搜索框（宽 288px）、上传文档按钮、UserAvatarDropdown
2. THE Document_Detail_Header SHALL 在文档详情页顶部以 sticky 居中胶囊形式存在，使用半透明 backdrop 模糊背景；高度固定为 12（h-12），左右贴齐内容区
3. THE Document_Detail_Header SHALL 在左侧依次展示：返回按钮（圆形）、面包屑（用户名 → 文件夹链 → 文档标题），右侧依次展示：模板切换、下载按钮、AI 问答开关
4. WHEN Document_Detail_Header 渲染面包屑, THE Document_Detail_Header SHALL 把用户名截断到最多 140px 宽度，每一层文件夹名截断到最多 160px 宽度，文档标题在剩余宽度内 truncate 并保留 hover 时的完整 title 提示
5. WHEN 用户点击 Document_Detail_Header 中面包屑的某一层文件夹, THE Document_Detail_Header SHALL 跳转回 /documents?folderId={folderId}
6. WHEN 用户点击 Document_Detail_Header 中的返回按钮, THE Document_Detail_Header SHALL 跳转回 /documents
7. WHEN 用户点击 Document_Detail_Header 中的 AI 问答开关, THE AI_Chat_Panel SHALL 按需求 6 切换显隐；按钮在面板可见时呈高亮状态（aria-pressed=true）

### 需求 16：账号设置页

**用户故事：** 作为已登录用户，我希望在一个独立的账号设置页中管理个人资料、密码和邮箱，以便集中维护我的账号信息。

#### 验收标准

1. THE Profile_Page SHALL 通过 /profile 路由暴露，访问该路由需要有效会话；未登录用户访问时按需求 10.3 跳转至登录页面
2. THE Profile_Page SHALL 采用左右两栏布局：左侧为 Tab 导航（个人资料 / 修改密码 / 修改邮箱），右侧为对应内容区
3. THE Profile_Page SHALL 在页面顶部提供「返回」按钮；WHEN 用户点击返回按钮, THE Profile_Page SHALL 调用浏览器历史回退到前一个页面
4. THE UserAvatarDropdown SHALL 通过「编辑资料」入口跳转到 /profile，此为 Profile_Page 的主要进入路径
5. WHEN 用户在左侧 Tab 之间切换, THE Profile_Page SHALL 在右侧内容区切换对应的表单组件，且切换不导致整页刷新
6. 本需求只描述 Profile_Page 的页面骨架与 Tab 切换语义；各 Tab 内具体的表单字段、校验规则与提交协议属于账号管理模块的实现细节，不在本 spec 范围内展开

### 需求 17：筛选排序栏

**用户故事：** 作为已登录用户，我希望在文档列表上方使用统一的筛选与排序栏快速过滤文档并切换排序，以便高效定位目标文档。

#### 验收标准

1. THE FilterSortBar SHALL 位于文档列表主内容区顶部，提供「筛选」与「排序」两个 Notion 风格 Popover 触发器，并在右侧展示活跃筛选条件 chip
2. THE FilterSortBar SHALL 支持以下筛选维度：文档整体状态（ready / processing / failed，单选）、是否仅看收藏、文件扩展名（pdf / docx / pptx / txt / md，多选 OR）、创建时间（近 7 / 30 / 90 天 / 全部）
3. THE FilterSortBar SHALL 支持以下排序字段：创建时间、更新时间、标题、文件大小、字数；方向为升序或降序，默认值为创建时间降序
4. WHEN 用户在筛选 Popover 内选择 / 取消任意一个条件, THE Document_Manager SHALL 立即按新的筛选条件重置到第 1 页并重新拉取文档列表
5. WHEN 用户在排序 Popover 内修改排序字段或方向, THE Document_Manager SHALL 立即按新的排序参数重置到第 1 页并重新拉取文档列表
6. THE FilterSortBar SHALL 把每一个活跃筛选条件渲染为可单独移除的 chip；WHEN 用户点击 chip 上的 X, THE FilterSortBar SHALL 移除该单一条件并触发列表刷新
7. WHEN 活跃 chip 数量大于 1, THE FilterSortBar SHALL 在 chip 后展示「清除」按钮；WHEN 用户点击该按钮, THE FilterSortBar SHALL 重置所有筛选条件回到默认值
8. THE FilterSortBar SHALL 在筛选 Popover 中显示当前活跃筛选条件的数量徽章，便于用户感知筛选状态
9. THE FilterSortBar SHALL 与 Folder_Sidebar 的文件夹筛选、TagFilterList 的标签筛选共同作用：三者之间为 AND 组合，标签内部为 OR，文件扩展名内部为 OR

### 需求 18：文档详情页内联标签管理

**用户故事：** 作为已登录用户，我希望直接在文档详情页右侧元数据中为当前文档添加和移除标签，并让不再被任何文档使用的标签自动从筛选面板消失，以便保持标签库的整洁。

#### 验收标准

1. THE DocumentMeta SHALL 在右侧元数据面板的「标签」区域显示当前文档已挂载的标签，每个标签以可移除 chip 形式展示
2. THE DocumentMeta SHALL 在「标签」区域提供「添加标签」入口（Document_Tag_Picker），以 Popover 形式打开
3. THE Document_Tag_Picker SHALL 在 Popover 中列出当前用户的全部标签，已挂载在当前文档上的标签置为不可再次选中（已勾选状态），并支持按名称关键词进行搜索过滤
4. WHEN 用户在 Document_Tag_Picker 中点击未挂载的某个标签, THE DocumentMeta SHALL 立即把该标签乐观追加到当前文档的 tags 列表中并调用 POST /api/documents/[id]/tags
5. IF 添加标签接口调用失败, THEN THE DocumentMeta SHALL 回滚本地 tags 列表
6. WHEN 用户在搜索框中输入的内容长度为 1 至 20 个字符且与现有标签名都不完全匹配, THE Document_Tag_Picker SHALL 显示「创建并添加 X」选项；WHEN 用户点击该选项, THE Document_Tag_Picker SHALL 先创建新标签再立即把该标签挂在当前文档上，并刷新全局标签列表
7. WHEN 用户点击文档已挂载标签 chip 上的 X, THE DocumentMeta SHALL 立即把该标签从本地 tags 列表移除并调用 DELETE /api/documents/[id]/tags/[tagId]
8. IF 该次解除关联使得该标签已不再被任何文档使用, THEN THE Tag_Manager SHALL 级联软删除该标签实体（tags.deleted=1），并在 TagFilterList 中同步消失；如果该标签当时正处于筛选面板的已选项中，TagFilterList SHALL 同步把它从已选条件中移除
9. IF 解除关联接口调用失败, THEN THE DocumentMeta SHALL 回滚本地 tags 列表

### 需求 19：AI 状态轮询与重新生成

**用户故事：** 作为已登录用户，我希望在 AI 总结或思维导图仍在生成时进入文档详情页能自动看到最新进度，并能在生成失败后手动重新发起生成，以便始终拿到最新结果。

#### 验收标准

1. WHEN 用户进入文档详情页, THE Document_Detail SHALL 在拉取到文档详情后判断 documents.summary_status 与 documents.mindmap_status；WHILE 任意一个仍处于 pending 或 running 状态, THE Document_Detail SHALL 启动每 3 秒一次的状态轮询任务
2. WHILE 状态轮询任务在运行, THE Document_Detail SHALL 调用 GET /api/documents/[id]/status 拉取最新的 summary_status 与 mindmap_status；当轮询次数累计超过 100 次（约 5 分钟）时，将仍处于进行中的状态强制标记为 failed 并停止轮询
3. WHEN summary_status 由进行中（pending / running）转为 success, THE Document_Detail SHALL 立即重新拉取 GET /api/documents/[id] 详情并刷新 SummaryCard
4. WHEN mindmap_status 由进行中（pending / running）转为 success, THE Document_Detail SHALL 立即重新拉取 GET /api/documents/[id] 详情并刷新 MindmapViewer
5. WHEN summary_status 与 mindmap_status 同时为终态（success 或 failed）, THE Document_Detail SHALL 停止状态轮询任务
6. WHEN 用户离开文档详情页, THE Document_Detail SHALL 清除尚未结束的状态轮询定时器，避免后台空转
7. WHEN 用户在 SummaryCard 或 MindmapViewer 中点击「重新生成」按钮, THE Document_Detail SHALL 分别调用 POST /api/ai/regenerate-summary 或 POST /api/ai/regenerate-mindmap，并按相同的轮询机制等待该项 status 转为 success 或 failed
8. WHILE 某项的 status 为 running 或重新生成请求进行中, THE SummaryCard / MindmapViewer SHALL 在「重新生成」按钮上展示加载态并禁用重复点击

### 需求 20：上传与解析后台异步流程通知

**用户故事：** 作为已登录用户，我希望在上传单文件时直观地看到从上传到 AI 处理完成的全链路进度提示，以便清楚知道文档何时可读、何时已生成 AI 结果。

#### 验收标准

1. WHEN 用户在 UploadDialog 中确认上传单个文件且接口返回 documentId 后, THE Document_Manager SHALL 在 UploadDialog 内启动 UploadProgress 组件，立即驱动「上传完成、正在解析文档」的阶段提示
2. THE UploadProgress SHALL 每 3 秒调用一次 GET /api/documents/[id]/status，最长持续 5 分钟（最多 100 次）；超过该上限时把仍处于进行中的阶段标记为失败并展示「AI 处理超时，请稍后在文档详情页重试」
3. THE UploadProgress SHALL 把后端 parseStatus 与 (summaryStatus, mindmapStatus) 合并为面向用户的两类阶段：解析阶段、AI 处理阶段；任意一项 AI 状态失败将整体 AI 阶段标记为失败
4. WHILE 解析阶段未完成, THE UploadProgress SHALL 用渐进式假进度条配合「正在解析文档...」文案制造持续推进的视觉反馈，进度条上限封顶在 90%，解析完成后由派生值直接显示为 100%
5. WHEN 解析阶段完成（parseStatus=success）, THE UploadProgress SHALL 显示「文档已就绪」并启用「立即查看文档」按钮，跳转到 /documents/{documentId}
6. IF 解析阶段失败（parseStatus=failed）, THEN THE UploadProgress SHALL 展示「解析失败，请检查文件格式后重试」并保持 UploadDialog 不自动关闭
7. WHEN AI 处理阶段最终全部完成, THE UploadProgress SHALL 展示「处理完成」与「AI 总结和思维导图已生成」描述；当部分 AI 失败时，文案降级为「文档已就绪，AI 总结或思维导图生成失败，可在详情页重试」

### 需求 21：标准化 Markdown 数据来源约束

**用户故事：** 作为系统维护者，我希望文档详情、检索、AI 问答、AI 总结和思维导图都基于同一份标准化 Markdown 数据，以便保证内容一致性并降低后续迭代成本。

#### 验收标准

1. THE Template_Renderer SHALL 始终从 document_contents 表读取标准化 Markdown 内容进行渲染，不依赖 LlamaParse 临时返回结果
2. THE Search_Engine SHALL 始终基于 document_chunks 中由标准化 Markdown 切分得到的向量与文本进行检索，不直接读取 LlamaParse 原始内容
3. THE AI_Summary_Generator SHALL 始终基于标准化 Markdown 内容生成总结，不依赖 LlamaParse 临时图片或临时 Markdown
4. THE AI_Mindmap_Generator SHALL 始终基于标准化 Markdown 内容生成思维导图，不依赖 LlamaParse 临时图片或临时 Markdown
5. THE Edge_Function 链路 SHALL 在文档解析阶段一次性完成 Markdown 标准化与图片转存，后续所有读路径均不再请求 LlamaParse
