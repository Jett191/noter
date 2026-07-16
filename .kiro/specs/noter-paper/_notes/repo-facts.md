# noter 仓库事实清单（task 0.1 产出）

> 本文件不是论文交付物，是 task 0.1 整理的「仓库当前真实事实清单」内部备忘。后续每个写作小节落笔前都先回到本清单核对，再下笔。所有版本号、路径、字段、配置项均按本仓库 HEAD 当前内容核对，与设计文档一致。
>
> 取材时点：与 design.md「Data Models」一节中字段表行数快照同期。

## 1. 技术栈版本号（按各 package.json 实物核对）

### 1.1 monorepo 根目录

来源：`/package.json`、`/pnpm-workspace.yaml`、`/tsconfig.base.json`。

| 项目 | 版本 | 说明 |
| --- | --- | --- |
| 包管理器 | pnpm@10.32.1 | `package.json` `packageManager` 字段 |
| TypeScript 目标 | ES2022 | `tsconfig.base.json` `target` |
| TypeScript 模块系统 | ESNext + Bundler 解析 | `tsconfig.base.json` `module`/`moduleResolution` |
| TypeScript strict | true | `tsconfig.base.json` `strict` |
| ESLint | 8.57.1 | 根 `package.json` |
| Prettier | ^3.8.1 | 根 `package.json` |
| commitlint | ^20.4.3（@commitlint/cli + config-conventional） | 根 `package.json` |
| commitizen | 4.2.4，配 `cz-customizable` ^7.5.1 | 根 `package.json` |
| husky | ^9.1.7 | 根 `package.json` |
| lint-staged | ^16.3.2 | 根 `package.json` |
| @typescript-eslint/* | ^8.56.1 | 根 `package.json` |

`pnpm-workspace.yaml` 把工作区限定为 `apps/*` 与 `packages/*` 两组。

### 1.2 apps/noter-web（用户端）

来源：`apps/noter-web/package.json`。

| 依赖 | 版本 |
| --- | --- |
| next | 16.1.6 |
| react | 19.2.3 |
| react-dom | 19.2.3 |
| @supabase/ssr | ^0.9.0 |
| @supabase/supabase-js | ^2.100.0 |
| @xyflow/react | ^12.10.2 |
| react-markdown | ^10.1.0 |
| remark-gfm | ^4.0.1 |
| remark-math | ^6.0.0 |
| rehype-katex | ^7.0.1 |
| rehype-raw | ^7.0.0 |
| rehype-slug | ^6.0.0 |
| rehype-highlight | ^7.0.2 |
| katex | ^0.16.45 |
| @react-pdf/renderer | ^4.5.1 |
| zustand | ^5.0.12 |
| zod | ^3.25.76 |
| lucide-react | ^0.577.0 |
| tailwindcss | ^4 |
| @tailwindcss/postcss | ^4 |
| typescript | ^5 |
| eslint-config-next | 16.1.6 |
| 工作区依赖 | `@noter/agent-runtime` `@noter/api` `@noter/ui`（workspace:*） |

### 1.3 apps/noter-admin（管理端）

来源：`apps/noter-admin/package.json`。

| 依赖 | 版本 |
| --- | --- |
| next | 16.2.6 |
| react | 19.2.4 |
| react-dom | 19.2.4 |
| @supabase/ssr | ^0.9.0 |
| @supabase/supabase-js | ^2.100.0 |
| react-markdown | ^10.1.0 |
| recharts | ^3.8.1 |
| zustand | ^5.0.13 |
| axios | ^1.16.1 |
| dotenv | ^16.4.5 |
| server-only | ^0.0.1 |
| tailwindcss | ^4 |
| vitest | ^4.1.6 |
| @vitejs/plugin-react | ^6.0.2 |
| tsx | ^4.20.6 |
| typescript | ^5 |
| eslint-config-next | 16.2.6 |

注：`apps/noter-admin/package.json` 当前未声明 playwright 依赖，design.md 中的 `playwright.config.ts` 引用需在 task 7.1/7.2 落笔前再行核对（可能为占位或近期变更）。

### 1.4 packages/* 共享包

来源：各 `packages/*/package.json`。

`packages/ui`（shadcn 4 组件库）：
- shadcn ^4.0.8、radix-ui ^1.4.3、class-variance-authority ^0.7.1、clsx ^2.1.1、tailwind-merge ^3.5.0、tw-animate-css ^1.4.0、next-themes ^0.4.6、lucide-react ^0.577.0、zod ^3.25.76
- react / react-dom ^19.2.4
- 开发：tailwindcss ^4.1.18、@tailwindcss/postcss ^4.1.18、typescript ^5.9.3、@turbo/gen ^2.8.1
- exports：`./globals.css`、`./postcss.config`、`./lib/*`、`./components/*`、`./hooks/*`

`packages/api`（共享 API 客户端）：
- axios ^1.13.6
- 入口直接指向 `src/index.ts`（无构建产物）

`packages/agent-runtime`（多轮 Skill 引擎）：
- @supabase/supabase-js ^2.100.0、zod ^3.25.76
- 开发：vitest ^3.2.4、fast-check ^3.23.2、typescript ^5、@types/node ^20
- exports：`.` → `./src/index.ts`

`packages/hooks`、`packages/utils`：
- 当前两目录在仓库中存在但内部无 `package.json`，等同于占位包。第六章前端结构图（图 6.2）若涉及共享包列表，应说明这两目录目前未启用。

### 1.5 supabase 后端

- `supabase/functions/` 下四个 Edge Function：`parse-document`、`vectorize-document`、`generate-summary`、`generate-mindmap`（运行时为 Deno）
- `supabase/migrations/` 当前 13 个迁移文件（清单见第 7 节）
- `supabase/tests/` 用于 RLS 与迁移集成测试（具体内容到 task 7.3 再核对）

## 2. 仓库根目录结构（apps/、packages/、supabase/）

来源：仓库目录树实际遍历结果。

```
noter/
├── apps/
│   ├── noter-admin/        管理端（Next.js 16.2.6）
│   └── noter-web/          用户端（Next.js 16.1.6）
├── packages/
│   ├── agent-runtime/      多轮 Skill 引擎，独立 vitest + fast-check
│   ├── api/                axios 共享客户端
│   ├── hooks/              占位（当前无 package.json）
│   ├── ui/                 shadcn 4 共享 UI 库
│   └── utils/              占位（当前无 package.json）
├── supabase/
│   ├── functions/          Edge Functions（4 个）
│   │   ├── parse-document/
│   │   ├── vectorize-document/
│   │   ├── generate-summary/
│   │   └── generate-mindmap/
│   ├── migrations/         SQL 迁移（13 个）
│   ├── tests/              迁移与 RLS 测试
│   └── .temp/              本地缓存（不入交付）
├── paper/                  论文交付目录（noterPaper.md / noterChart.md 占位）
├── .kiro/specs/            上游与本期 spec
├── .husky/                 git 钩子
├── .workspaces/            VS Code workspace 描述
├── package.json            根 monorepo 描述
├── pnpm-workspace.yaml     workspaces 范围
├── tsconfig.base.json      TS 共享配置
├── .eslintrc / .prettierrc / .commitlintrc.json / .cz-config.js / .lintstagedrc.js
└── ...
```

写作时凡引用「`apps/noter-web/...`」「`packages/agent-runtime/src/...`」之类路径都以本结构为准，不再凭空补充未存在的目录。

## 3. 真实角色清单（4 类）

来源：`.kiro/specs/noter-admin-platform/requirements.md` 中 `profiles.role` 三档；`.kiro/specs/noter-document-management/requirements.md` 中关于「未登录用户访问时按需求 10.3 跳转至登录页面」的隐含访客；`supabase/migrations/20260517223443_admin_platform_profiles_super_admin.sql`。

| 角色 | 标识 | 来源 | 主要能力 |
| --- | --- | --- | --- |
| 未登录访客 | （无会话） | noter-document-management 需求 10、需求 16.1 隐含 | 仅可访问登录 / 注册页；其它路由被会话守卫拦截跳转登录 |
| 普通用户 | profiles.role = 'user' | admin-platform 需求 1—11；document-management 全套需求 | 上传 / 阅读 / 检索 / AI 提问私有文档；只读公共文档 |
| 管理员 | profiles.role = 'admin' | admin-platform 需求 1、2、4—10、12—24 | 登录管理后台；维护公共文档、分类、标签、审计；管理普通用户文档 |
| 超级管理员 | profiles.role = 'super_admin' | admin-platform 需求 7.4、需求 11 | 在管理员能力之上，可切换其他用户角色（含提升 admin） |

写作约束：用例图（图 3.1）与角色叙述固定使用上述 4 类命名。`profiles.is_system_account=true` 是系统内部账号，不计入角色清单（用于 pipeline 自动归档版本时的 editor_user_id）。

## 4. 文档处理状态字段（documents 表）

来源：`apps/noter-web/app/api/documents/upload/route.ts` 创建逻辑、`apps/noter-web/app/api/documents/[id]/status/route.ts` 状态查询、`supabase/functions/parse-document/index.ts` 状态机切换、`.kiro/specs/noter-document-management/tasks.md` 顶部「状态枚举规范」小节。

documents 表实际维护的处理状态字段共 5 列（design.md 中「四类处理状态」是指 4 个子流程状态，加上 1 个聚合 `status`）：

| 字段 | 默认值 | 取值 | 含义 |
| --- | --- | --- | --- |
| `status` | `'processing'` | `processing` / `ready` / `failed` | 整体状态（解析成功即 ready，关键步骤失败即 failed） |
| `parse_status` | `'pending'` | `pending` / `running` / `success` / `failed` | LlamaParse 解析与图片转存阶段状态 |
| `vector_status` | `'pending'` | 同上四态 | 文档分片 + pgvector 向量化阶段状态 |
| `summary_status` | `'pending'` | 同上四态 | AI 总结生成阶段状态 |
| `mindmap_status` | `'pending'` | 同上四态 | AI 思维导图生成阶段状态 |

子状态机演进：

- 上传创建 documents 行 → `status='processing'`，4 个子状态全部 `pending`
- parse-document Edge Function 起始 → `parse_status='running'`；解析成功 → `parse_status='success'`、`status='ready'`、链式触发 vectorize-document
- vectorize / summary / mindmap 各阶段独立把对应子状态切到 `running` → `success`/`failed`
- 任一关键步骤失败 → 对应子状态 `failed`，`status='failed'`，错误写入 `document_processing_jobs`
- 前端通过 `/api/documents/[id]/status` 轮询返回 5 列状态

写作约束：3.3.2 数据流图、5.1 时序图、6.1 后端结构图、7.3.1 测试用例都按上述 5 列名称。不要写成「parseStatus」（那是 API 响应里驼峰映射后的字段，库里是 snake_case）。

## 5. 三大业务流水线边界

来源：仓库当前 `apps/noter-web/app/api/`、`apps/noter-admin/app/api/admin/`、`supabase/functions/`、`supabase/migrations/` 的实物归属；与 design.md 第五章 / 第六章拟分配的取材范围保持一致。

### 流水线 A：文档上传与 RAG（document-management 域）

- 入口：`apps/noter-web/components/documents/UploadDialog.tsx` → `apps/noter-web/app/api/documents/upload/route.ts`
- Edge Functions：`parse-document` → `vectorize-document` → `generate-summary` / `generate-mindmap`（链式 invoke）
- 数据归宿：`documents`、`document_contents`、`document_assets`、`document_chunks`（pgvector）、`document_summaries`、`document_mindmaps`、`document_processing_jobs`
- 边界：流水线只写本域 7 张表 + Storage 桶 `document-originals` / `document-assets-public`；不写 `agent_skill_sessions`、不写 `public_document_versions`
- 上游 spec：noter-document-management 需求 11、19、20、21

### 流水线 B：Noter Agent SSE 多轮对话（noter-agent 域）

- 入口：`apps/noter-web/components/document-detail/AIChatPanel.tsx` → `apps/noter-web/app/api/ai/chat/route.ts` → `apps/noter-web/app/api/ai/sessions/`
- 引擎：`packages/agent-runtime/src/{router,skills,tools,sse,db,prompts,types}/`、`orchestrator.ts`、`index.ts`
- 数据归宿：仅写 `agent_skill_sessions`（多轮状态、24h 过期）；只读 `documents` / `document_contents` / `document_chunks` / `document_summaries`
- RLS：`agent_skill_sessions` 只允许 service_role，由 `20260516175445_create_agent_skill_sessions_table.sql` 设定
- 协议：SSE，事件含文本流 / 结构化卡片 / `session_banner` / `follow_ups` / `error`，终止帧固定为 `data: [DONE]\n\n`
- 边界：Skill 集合 `/brief` `/tutor` `/explain` `/actions` `/quiz`；Skill 切换不需要二次确认；不向 document-management 域 4 张只读表执行 INSERT/UPDATE/DELETE
- 上游 spec：noter-agent 需求 1—15

### 流水线 C：公共文档版本归档与回滚（admin-platform 域）

- 入口：`apps/noter-admin/app/api/admin/public-documents/`（含 `upload`、批量编辑、版本抽屉）；前端 `apps/noter-admin/components/MarkdownEditor.tsx`、`VersionDrawer.tsx`
- 触发器：`supabase/migrations/20260517223452_admin_platform_auto_version_v1_trigger.sql`，在 `document_contents` AFTER INSERT 时自动写入 `public_document_versions(version_no=1)`，editor_user_id 取系统账号
- 后续版本：admin 在线编辑保存时由 API 路由插入 `version_no = max+1`
- 数据归宿：`public_document_versions`、`public_categories`、`admin_audit_logs`、`system_settings`；同时把 `documents.document_scope='public'` 与 `public_category_id` 维护好
- 边界：流水线 C 通过 service_role 客户端写跨用户数据；普通用户对 `document_scope='public'` 的文档不可删除（document-management 需求 10.13）；流水线 C 不写 `agent_skill_sessions`、不读 `document_chunks` 的 embedding 列
- 上游 spec：noter-admin-platform 需求 12—21、23、24

写作约束：3.3.1 总体 DFD、3.3.2 子模块 DFD、4.2 系统总体规划、5.1—5.2 详细设计、6.1—6.2 项目结构图都按上述三条流水线划线，三者之间共享的只有 `documents` / `document_contents` / `document_chunks` / `document_summaries` 四张文档主域只读表。

## 6. 三个上游 spec 的 requirements 数量

来源：分别 `grep '^### 需求'` 三份 requirements.md 的实际计数。

| Spec | requirements.md 路径 | 需求条数 |
| --- | --- | --- |
| noter-document-management | `.kiro/specs/noter-document-management/requirements.md` | 21（需求 1—21） |
| noter-agent | `.kiro/specs/noter-agent/requirements.md` | 15（需求 1—15） |
| noter-admin-platform | `.kiro/specs/noter-admin-platform/requirements.md` | 26（需求 1—26） |

写作约束：

- 第三章 3.1 用户需求按用户实际工作叙述，不直接搬抄三份 requirements 的 EARS 条目；三份 spec 共 62 条 EARS 验收标准是事实背景，正文不复述
- 第三章 3.2.2 子模块用例图覆盖度参考三份 spec 的需求边界
- noter-admin-platform 实际为 26 条（不是部分文档里写的 24 条），4.2.3 与 6.2 介绍管理端模块时按 26 条覆盖范围核对

## 7. 关键迁移文件清单（按时间戳序，13 个）

来源：`supabase/migrations/` 实际目录。

```
20260516175445_create_agent_skill_sessions_table.sql
20260516180339_add_hybrid_search_scoped_rpc.sql
20260516182557_add_vector_and_keyword_search_scoped_rpcs.sql
20260517223443_admin_platform_profiles_super_admin.sql
20260517223444_admin_platform_documents_scope.sql
20260517223445_admin_platform_folders_system_flag.sql
20260517223446_admin_platform_tags_official.sql
20260517223447_admin_platform_public_categories.sql
20260517223448_admin_platform_public_document_versions.sql
20260517223449_admin_platform_admin_audit_logs.sql
20260517223450_admin_platform_system_settings.sql
20260517223451_admin_platform_rls_policies.sql
20260517223452_admin_platform_auto_version_v1_trigger.sql
```

注：documents 等基础表的最初创建迁移不在本仓库 `supabase/migrations/` 中（应为更早期的初始迁移，未纳入当前仓库历史）。4.3.3 物理结构表所列字段以 task 0.2 通过 supabase MCP 拉取的 `information_schema.columns` 当前快照为准，本清单只覆盖在仓库内可追溯的演进迁移。

## 8. 每节落笔前需要回查的事实点（self-checklist）

- 凡写到「Next.js 16.x」「React 19」「shadcn 4」「pnpm 10」「TypeScript 5」具体小版本时，回到 §1 对应表格核对
- 凡写到「用户 / 管理员 / 超级管理员 / 未登录访客」时，回到 §3 表格核对命名与边界
- 凡写到 documents 表状态字段时，回到 §4 核对 5 列名称与四态值
- 凡画三大业务流水线（DFD / 时序图 / 模块图）时，回到 §5 核对入口、Edge Function 链、数据归宿、RLS 边界
- 凡引用三份上游 spec 的需求条数时，回到 §6 核对（document 21 / agent 15 / admin 26）
- 凡引用迁移 SQL 文件名时，回到 §7 核对完整时间戳前缀
