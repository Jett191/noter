# Requirements Document

## Introduction

Noter Admin Platform 是 Noter 系统的管理员控制台，作为 monorepo 中独立部署的 Next.js 应用 `apps/noter-admin`。本期 MVP 覆盖毕设硬性要求：公共文档生命周期管理（批量上传、元数据编辑、在线 Markdown 编辑、版本历史）、文档分类体系与标签管理、用户权限分配与访问控制、数据统计可视化、系统操作日志查询。

角色体系为三级：`profiles.role` 取值 `'user'` / `'admin'` / `'super_admin'`。super_admin 全局唯一，由 migration 创建；只有 admin 与 super_admin 可登录管理后台，普通用户尝试登录会被拒绝。普通管理员的账号与其在 noter-web 的账号一致，由超级管理员提升权限后即可登录管理端。

公共文档与私有文档共存于同一系统，但管理端只对公共文档提供生命周期管理；普通用户在 noter-web 端能看到一个只读的"Noter 官方"文件夹聚合所有公共文档。具体数据模型与对 noter-web 的对接方式在 design 阶段决定。

## Glossary

- **Super_Admin**: profiles.role = 'super_admin' 的唯一超级管理员账号
- **Admin_User**: profiles.role = 'admin' 的普通管理员账号
- **Public_Document**: 由管理员维护的公共文档，所有 noter-web 用户只读可见
- **Public_Category**: 公共文档的扁平分类
- **Public_Tag**: 公共文档专用的标签
- **Public_Document_Version**: 公共文档的 markdown 版本快照
- **Audit_Log**: 管理员操作审计日志记录

## Requirements

### 需求 1：管理员登录

**用户故事：** 作为管理员，我希望用我的账号登录管理后台（该账号与我在 noter-web 的账号一致，由超级管理员提升权限后即可登录）。

#### 验收标准

1. THE Admin_Console SHALL 在 `/sign-in` 提供邮箱+密码登录表单，不提供注册、OAuth、忘记密码入口
2. WHEN 用户提交凭据, THE Admin_Console SHALL 调用 Supabase Auth 验证，通过后查询 `profiles` 获取 role / not_active / deleted
3. IF 凭据有效且 `role IN ('admin','super_admin') AND not_active=0 AND deleted=0`, THEN SHALL 允许登录并跳转至 `/dashboard`
4. IF 凭据有效但 role='user', THEN SHALL 拒绝登录并返回「该账号无管理员权限」提示，不创建管理端会话
5. IF 登录用户 role='admin', THEN THE Admin_Console SHALL 允许访问后台，但不能操作其他管理员与超级管理员，不能执行角色切换
6. IF 登录用户 role='super_admin', THEN THE Admin_Console SHALL 允许访问后台全部功能，可管理普通管理员权限
7. THE Admin_Console SHALL 对每个 IP 在 10 分钟内限制最多 10 次登录请求，超出返回 429
8. IF Supabase Auth 10 秒内未响应, THEN SHALL 返回「服务暂时不可用」提示

### 需求 2：会话守卫与受保护路由

**用户故事：** 作为管理员，我希望后台管理功能仅对 admin 和 super_admin 开放。

#### 验收标准

1. WHEN 请求到达受保护页面或 `/api/admin/*`, THE Admin_Guard SHALL 校验 cookie 会话有效且 `role IN ('admin','super_admin') AND not_active=0 AND deleted=0`
2. IF 校验失败（无会话 / role='user' / 账号被封禁或删除）, THEN SHALL 返回 401 `{ error:'unauthorized', code:'admin_auth_required' }` 或重定向 `/sign-in`
3. THE Admin_Console SHALL 所有跨用户读写通过 service_role 客户端执行，前端不暴露 service_role 密钥

### 需求 3：控制台布局与侧边栏

**用户故事：** 作为管理员，我希望通过统一侧边栏在各模块间切换。

#### 验收标准

1. THE Admin_Sidebar SHALL 展示 8 个导航入口：Dashboard / Users / Documents / Public Documents / Public Categories / Public Tags / Logs / Settings
2. THE Admin_Sidebar SHALL 在底部展示当前管理员邮箱与退出按钮
3. WHEN 视口 < 768px, THE Admin_Sidebar SHALL 收起为浮层抽屉

### 需求 4：Dashboard 指标卡片

**用户故事：** 作为管理员，我希望一眼看到平台核心运营数据。

#### 验收标准

1. THE Dashboard SHALL 展示 6 张指标卡：总用户数、总文档数、今日新增注册、今日新增文档、近 7 天活跃用户、总存储用量
2. THE Dashboard SHALL 在每张卡片下方展示与昨日的差值
3. THE Admin_API SHALL 通过 `GET /api/admin/dashboard/metrics` 聚合返回，统计排除系统内部账号

### 需求 5：Dashboard 趋势图

**用户故事：** 作为管理员，我希望观察近 30 天的增长走势。

#### 验收标准

1. THE Dashboard SHALL 展示两张趋势图：近 30 天注册趋势、近 30 天文档上传趋势
2. THE Admin_API SHALL 通过 `GET /api/admin/dashboard/trends?days=30` 返回，days 仅接受 [1,90] 整数

### 需求 6：Dashboard 分布饼图

**用户故事：** 作为管理员，我希望快速识别文档处理状态与热门分类。

#### 验收标准

1. THE Dashboard SHALL 展示两张饼图：文档状态分布（processing/ready/failed）、公共标签 Top 10 占比
2. THE Admin_API SHALL 通过 `GET /api/admin/dashboard/distributions` 返回

### 需求 7：用户列表与筛选

**用户故事：** 作为管理员，我希望分页查看全平台用户。

#### 验收标准

1. THE User_List_Page SHALL 展示用户表格（邮箱、用户名、角色、状态、注册时间、操作），不展示系统内部账号
2. THE User_List_Page SHALL 提供邮箱模糊搜索与状态筛选（全部/正常/已封禁/已删除）
3. WHEN 目标用户 role='super_admin', THE User_List_Page SHALL 隐藏该行所有操作按钮
4. THE User_List_Page SHALL 仅对 super_admin 登录时展示「角色切换」操作入口

### 需求 8：用户封禁与解封

**用户故事：** 作为管理员，我希望封禁违规用户。

#### 验收标准

1. WHEN admin 执行封禁, THE Admin_API SHALL 仅允许操作 role='user' 的目标
2. WHEN super_admin 执行封禁, THE Admin_API SHALL 允许操作 role='user' 或 role='admin' 的目标
3. IF 目标为 super_admin 或为系统内部账号 或为自身, THEN SHALL 返回 404 或 409
4. WHEN 操作成功, THE Admin_API SHALL 写入 Audit_Log

### 需求 9：用户软删除

**用户故事：** 作为管理员，我希望软删除违规账号。

#### 验收标准

1. 权限矩阵同需求 8（admin 只删 user，super_admin 可删 admin）
2. THE Admin_API SHALL 将 profiles.deleted 置为 1，不级联修改 documents
3. WHEN 操作成功, THE Admin_API SHALL 写入 Audit_Log

### 需求 10：发送密码重置邮件

**用户故事：** 作为管理员，我希望帮用户触发密码重置。

#### 验收标准

1. 权限矩阵同需求 8
2. THE Admin_API SHALL 调用 Supabase Auth 密码恢复邮件能力，不生成或返回明文密码
3. WHEN 操作成功, THE Admin_API SHALL 写入 Audit_Log，metadata 不含密码或 token

### 需求 11：用户角色切换

**用户故事：** 作为超级管理员，我希望升降其他用户的角色。

#### 验收标准

1. THE Admin_API SHALL 仅允许 super_admin 执行角色切换
2. THE Admin_API SHALL 仅支持 user ↔ admin 切换，不可将任何人设为 super_admin
3. IF 目标为 super_admin 或为系统内部账号 或为自身, THEN SHALL 返回 404 或 409
4. WHEN 操作成功, THE Admin_API SHALL 写入 Audit_Log

### 需求 12：公共文档在 noter-web 端的展示约定

**用户故事：** 作为普通用户，我希望在 noter-web 中看到一个只读的"Noter 官方"文件夹，里面展示所有公共文档。

#### 验收标准

1. THE noter-web SHALL 为每个用户展示一个名为「Noter 官方」的文件夹，该文件夹不可删除、不可重命名、不可移动
2. THE noter-web SHALL 在「Noter 官方」文件夹中展示所有公共文档，用户对这些文档只读（不可编辑、不可删除、不可移动）
3. THE noter-web SHALL 允许用户对公共文档使用 AI 问答、查看总结与思维导图（因为公共文档已生成派生数据）
4. 具体实现方式（数据库字段设计、RLS 策略、前端是否需要改动）在 design 阶段决定

### 需求 13：公共文档批量上传

**用户故事：** 作为管理员，我希望批量上传文件建设官方知识库。

#### 验收标准

1. THE Public_Documents_Page SHALL 提供批量上传入口，单批最多 20 文件，单文件最大 50MB
2. THE Admin_API SHALL 对每个文件：上传 Storage → 创建公共文档记录（status='processing'）→ 触发完整 RAG pipeline（解析→分片→向量化→AI 总结→思维导图）→ 立即返回 processing 状态
3. WHEN pipeline 解析得到 markdown_content, THE Admin_API SHALL 自动写入一条初始版本记录（version_no=1）
4. IF 单文件上传失败, THEN SHALL 不影响其他文件，且回滚该文件的 Storage 与文档记录
5. WHEN 操作成功, THE Admin_API SHALL 为每个成功文件写入 Audit_Log

### 需求 14：公共文档列表

**用户故事：** 作为管理员，我希望分页查看所有公共文档。

#### 验收标准

1. THE Public_Documents_Page SHALL 强制只展示公共文档（不含私有文档），列展示标题、文件名、大小、状态、分类、标签、版本号、创建时间、操作
2. THE Public_Documents_Page SHALL 提供标题搜索、状态筛选、分类筛选、标签多选筛选、是否已删除筛选

### 需求 15：公共文档详情页

**用户故事：** 作为管理员，我希望查看公共文档完整信息并执行操作。

#### 验收标准

1. THE Public_Document_Detail_Page SHALL 展示：基础信息、处理状态、关联分类、关联标签、当前 markdown 正文（只读渲染）、当前版本号
2. THE Public_Document_Detail_Page SHALL 提供 5 个操作入口：编辑元数据、在线编辑 Markdown、版本历史、回滚、软删除

### 需求 16：公共文档元数据编辑

**用户故事：** 作为管理员，我希望编辑公共文档的标题、简介、分类与标签。

#### 验收标准

1. THE Metadata_Form SHALL 允许编辑：title、short_description、language、public_category_id、关联标签（多选公共标签）
2. THE Admin_API SHALL 不因元数据编辑创建新版本
3. WHEN 操作成功, THE Admin_API SHALL 写入 Audit_Log

### 需求 17：公共文档在线 Markdown 编辑与版本归档

**用户故事：** 作为管理员，我希望在线编辑公共文档正文，每次保存自动归档旧版本。

#### 验收标准

1. THE Detail_Page SHALL 提供 Markdown 编辑器，加载当前 markdown_content，支持填写变更说明
2. WHEN 管理员保存, THE Admin_API SHALL 在事务中：归档当前 markdown 为新版本 → 更新主文档 markdown_content → 设 status='processing'
3. WHEN 事务成功, THE Admin_API SHALL 异步重跑派生流程（分片→向量化→AI 总结→思维导图），不重新解析源文件
4. IF 新内容与当前完全一致, THEN SHALL 不写版本、不更新、返回 noChange 提示
5. WHEN 操作成功, THE Admin_API SHALL 写入 Audit_Log

### 需求 18：公共文档版本历史与回滚

**用户故事：** 作为管理员，我希望查看版本历史并能回滚到任意历史版本。

#### 验收标准

1. THE Version_History SHALL 展示版本列表（版本号、编辑人、变更说明、时间、字符数）
2. THE Version_History SHALL 支持查看某版本完整内容与当前版本对比
3. WHEN 管理员回滚, THE Admin_API SHALL 在事务中：归档当前 markdown 为新版本 → 将目标版本 markdown 写回主文档 → status='processing'；异步重跑派生流程
4. IF 目标版本内容与当前完全一致, THEN SHALL 返回 409
5. THE Admin_API SHALL 不提供删除或编辑版本的接口
6. WHEN 操作成功, THE Admin_API SHALL 写入 Audit_Log

### 需求 19：公共文档软删除

**用户故事：** 作为管理员，我希望下架公共文档。

#### 验收标准

1. THE Admin_API SHALL 将公共文档软删除（deleted=1），不修改其版本、标签、分类关联
2. WHEN 操作成功, THE Admin_API SHALL 写入 Audit_Log

### 需求 20：公共分类管理

**用户故事：** 作为管理员，我希望维护公共文档的分类体系。

#### 验收标准

1. THE Public_Categories_Page SHALL 展示分类列表（名称、描述、关联文档数、排序）
2. THE Admin_API SHALL 支持新建、编辑、软删除分类；name 在未删除范围内唯一
3. WHEN 软删除分类, THE Admin_API SHALL 将关联的公共文档解除分类关联
4. WHEN 操作成功, THE Admin_API SHALL 写入 Audit_Log

### 需求 21：公共标签管理

**用户故事：** 作为管理员，我希望维护公共文档的标签。

#### 验收标准

1. THE Public_Tags_Page SHALL 展示公共标签列表（名称、颜色、描述、关联文档数）
2. THE Admin_API SHALL 支持新建、编辑、软删除公共标签；公共标签内 name 唯一
3. WHEN 软删除标签, THE Admin_API SHALL 解除该标签与所有公共文档的关联
4. THE Admin_API SHALL 拒绝将公共标签关联到 private 文档
5. WHEN 操作成功, THE Admin_API SHALL 写入 Audit_Log

### 需求 22：普通用户文档管理

**用户故事：** 作为管理员，我希望查看全平台用户私有文档并能强制下架违规内容。

#### 验收标准

1. THE Document_List_Page SHALL 仅展示普通用户私有文档（不含公共文档），展示标题、所属用户、文件名、大小、状态、创建时间
2. THE Document_List_Page SHALL 仅提供「强制软删除」操作，不可查看或编辑正文
3. WHEN 操作成功, THE Admin_API SHALL 写入 Audit_Log

### 需求 23：操作审计日志

**用户故事：** 作为管理员，我希望查阅所有管理操作记录。

#### 验收标准

1. THE Admin_Console SHALL 永远记录所有管理员写操作到操作日志
2. THE Logs_Page SHALL 展示分页日志表格（时间、操作人、操作类型、目标资源、IP）
3. THE Logs_Page SHALL 提供按操作人、操作类型、时间范围、目标资源类型筛选
4. THE Admin_Console SHALL 不提供删除或编辑日志的入口

### 需求 24：访问控制设置

**用户故事：** 作为管理员，我希望在设置页面控制平台基本访问规则。

#### 验收标准

1. THE Admin_Console SHALL 在 `/settings` 提供最小访问控制设置页面，包含以下 4 项配置：是否允许普通用户上传文档、是否允许普通用户删除自己的文档、公共文档是否对普通用户可见、是否启用操作日志
2. THE Settings_Page SHALL 为每项配置提供开关控件，修改时弹出二次确认
3. WHEN 配置修改成功, THE Admin_API SHALL 写入 Audit_Log
4. THE Admin_Console SHALL 在 noter-web 端读取这些配置并据此放行或拦截对应操作（具体实现在 design 阶段决定）

### 需求 25：环境配置与部署

**用户故事：** 作为开发者，我希望 service_role 密钥严格隔离。

#### 验收标准

1. THE Admin_Console SHALL 通过环境变量加载 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`
2. THE Admin_Console SHALL 仅在服务端代码中读取 SERVICE_ROLE_KEY，不在前端 bundle 中暴露
3. THE Admin_Console SHALL 与 noter-web 独立部署，不共享 cookie 作用域

### 需求 26：MVP 范围与排除项

**用户故事：** 作为产品负责人，我希望明确本期边界。

#### 验收标准

1. THE Admin_Console SHALL 不实现用户配额管理
2. THE Admin_Console SHALL 不实现公共文档源文件替换（只能软删后重传）
3. THE Admin_Console SHALL 不实现笔记、AI 智能体会话管理界面
4. THE Admin_Console SHALL 不实现普通用户私有文档的正文查看或编辑
5. THE Admin_Console SHALL 不实现私有标签管理界面
6. THE Admin_Console SHALL 不实现复杂系统设置，仅实现需求 24 中的 4 项最小访问控制配置
