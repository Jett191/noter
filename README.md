<div align="center">
  <img src="./apps/noter-web/public/logo.svg" alt="Noter Logo" width="88" />

# Noter

**AI Document Workspace — 将文档转化为可搜索、可理解、可对话的知识库**

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-000000?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.3-149ECA?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth%20%2B%20Storage-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![pnpm](https://img.shields.io/badge/pnpm-10.32.1-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

</div>

Noter 是一个基于 Next.js 与 Supabase 构建的 AI 文档知识工作台。用户可以上传 PDF、DOCX、PPTX、TXT 和 Markdown 文件，系统会自动完成内容解析、Markdown 转换、向量化、AI 摘要和思维导图生成，并提供关键词与语义融合搜索、文档阅读模板、标签/文件夹管理，以及基于当前文档上下文的 AI 学习助手。

项目采用 pnpm Workspace 管理 Monorepo。Web 页面、Route Handlers、共享 UI、共享 API Client 和 Agent Runtime 均在同一仓库中；Agent Runtime 以内部 TypeScript 包的形式直接运行在 Next.js 服务端，不需要额外部署独立的 Agent 服务。

> [!IMPORTANT]
> 当前仓库中的 `supabase/migrations` 仅包含 Agent 会话表和文档级搜索 RPC 的增量迁移，不包含主业务数据库的完整基线结构；仓库中也没有 `supabase/config.toml`。接入已有 Supabase 项目可以直接使用现有资源，新建空项目时则必须先补齐基础表、存储桶、RLS 策略、`pgvector` 配置和全局搜索函数。



## 核心能力

| 模块 | 能力 |
| --- | --- |
| 文档管理 | 多文件上传、分页浏览、收藏、归档、软删除、封面设置、处理状态追踪 |
| 文件组织 | 文件夹树、标签管理、标签筛选、文件格式筛选、时间范围筛选、排序 |
| 内容解析 | 通过 LlamaParse 将 PDF、DOCX、PPTX、TXT、Markdown 转换为结构化 Markdown |
| 文档资源 | 提取文档图片并上传至 Supabase Storage，重写 Markdown 中的资源地址 |
| AI 摘要 | 自动生成摘要、关键点、待办事项、关键词和适用场景 |
| 思维导图 | 将文档层级和核心内容生成可交互的树状知识图谱 |
| 混合搜索 | 结合 PostgreSQL 全文搜索与 Gemini Embedding 向量相似度进行检索 |
| 文档阅读 | 支持默认、学术、紧凑和卡片式阅读模板，渲染 GFM、数学公式和代码高亮 |
| AI 文档对话 | 基于 SSE 实时返回文本、结构化卡片、后续建议和多轮会话状态 |
| 学习型 Agent | 提供速览、逐章私教、概念解释、行动项提取和文档测验五类 Skill |
| 用户系统 | 邮箱注册/登录、邮箱确认、GitHub OAuth、资料维护、头像上传、密码与邮箱修改 |

### 文件上传约束

- 支持格式：`.pdf`、`.docx`、`.pptx`、`.txt`、`.md`
- 单文件上限：50 MB
- 支持在上传时指定目标文件夹
- 上传成功后立即返回文档记录，解析、向量化、摘要和思维导图在后台异步执行

## 技术栈

| 层级 | 技术 |
| --- | --- |
| Web Framework | Next.js 16 App Router、React 19 |
| Language | TypeScript 5、ES Modules |
| Styling | Tailwind CSS 4 |
| UI | Radix UI、shadcn、Lucide React、共享 `@noter/ui` 组件包 |
| State | Zustand |
| Validation | Zod |
| HTTP Client | Axios、内部 `@noter/api` 包 |
| Markdown | react-markdown、remark-gfm、remark-math、rehype-katex、rehype-highlight |
| Mind Map | `@xyflow/react` |
| PDF Export | `@react-pdf/renderer` |
| Backend | Next.js Route Handlers |
| Database | Supabase Postgres |
| Authentication | Supabase Auth + `@supabase/ssr` |
| Storage | Supabase Storage |
| Serverless | Supabase Edge Functions |
| Vector Search | pgvector、Gemini Embedding 768 维向量 |
| Document Parsing | LlamaParse API |
| LLM | MiMo `mimo-v2.5-pro`，OpenAI Chat Completions 兼容接口 |
| Streaming | Server-Sent Events（SSE） |
| Test | Vitest、fast-check |
| Engineering | pnpm Workspace、ESLint、Prettier、Husky、lint-staged、Commitlint、Commitizen |





## 项目结构

```text
noter/
├── apps/
│   └── noter-web/                 # Next.js Web 应用与 Route Handlers
│       ├── app/                   # App Router 页面、布局和 API
│       ├── components/            # Landing、文档列表、详情、聊天组件
│       ├── hooks/                 # React Hooks
│       ├── lib/                   # Axios、Supabase、Agent 服务端工具
│       ├── public/                # Logo、封面等静态资源
│       ├── stores/                # Zustand 状态
│       ├── types/                 # 业务与协议类型
│       └── utils/                 # Zod Schema、HTTP 响应与工具函数
├── packages/
│   ├── agent-runtime/             # Skill Router、工具层、SSE、Agent Skills
│   │   ├── src/
│   │   │   ├── prompts/           # Skill Prompt 与输出 Schema
│   │   │   ├── router/            # 意图识别和 Skill Router
│   │   │   ├── skills/            # brief/tutor/explain/actions/quiz
│   │   │   ├── sse/               # SSE Stream 封装
│   │   │   ├── tools/             # LLM、Embedding、搜索、摘要、Session
│   │   │   └── types/             # Runtime 协议类型
│   │   └── tests/                 # Vitest 单元与性质测试
│   ├── api/                       # 共享 Axios Client 和请求方法
│   └── ui/                        # 共享 UI 组件与全局样式
├── supabase/
│   ├── functions/                 # 文档处理 Edge Functions
│   └── migrations/                # Agent 会话与作用域搜索增量迁移
├── .husky/                        # Git Hooks
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── tsconfig.base.json
```

## 快速开始

### 1. 环境要求

| 依赖 | 要求 |
| --- | --- |
| Node.js | `>= 20.9.0`，由 Next.js 16.1.6 的 Engine 要求决定 |
| pnpm | `10.32.1`，与根目录 `packageManager` 字段一致 |
| Supabase | 一个已配置的远程项目，或可运行本地 Supabase 的 Docker 兼容环境 |
| Supabase CLI | 建议使用当前稳定版，并通过 `supabase --help` 核对命令 |
| 外部服务 | LlamaParse、Gemini API、MiMo API |

### 2. 获取代码

```bash
git clone <repository-url>
cd noter
```

如果项目来自压缩包，直接解压并进入包含根 `package.json` 的目录即可。

### 3. 启用指定 pnpm 版本

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm --version
```

### 4. 安装依赖

```bash
pnpm install --frozen-lockfile
```

依赖必须在 Monorepo 根目录统一安装，不要分别进入 `apps/*` 或 `packages/*` 执行安装。

### 5. 创建 Web 环境变量

在 `apps/noter-web/.env.local` 中配置 Web/Node Runtime 所需变量：

```dotenv
# Supabase 公共配置
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<supabase-publishable-key>

# Web 应用的 API Base URL
NEXT_PUBLIC_API_URL=http://localhost:3000

# 仅服务端可用，禁止添加 NEXT_PUBLIC_ 前缀
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>

# Gemini Embedding
EMBEDDING_API_KEY=<gemini-api-key>
GEMINI_API_KEY=<gemini-api-key>

# MiMo Agent Runtime
MIMO_API_KEY=<mimo-api-key>

# 可选；不配置时使用代码中的默认 MiMo OpenAI-compatible endpoint
MIMO_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1
```

### 6. 配置 Supabase

如果连接的是项目原本使用的 Supabase 实例，请参照 [Supabase 配置](#supabase-配置) 完成项目关联、增量迁移、Edge Function Secrets 和函数部署。

### 7. 启动 Web 应用

```bash
pnpm --filter noter-web dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 环境变量

### Next.js / Agent Runtime

| 变量 | 必需 | 可见范围 | 用途 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | 浏览器 + 服务端 | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | 是 | 浏览器 + 服务端 | Supabase Publishable Key；变量名必须与当前代码一致 |
| `NEXT_PUBLIC_API_URL` | 建议 | 浏览器 | Axios Base URL；本地应设为 `http://localhost:3000` |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | 仅服务端 | Admin Client、Agent Session 和服务端工具访问 |
| `EMBEDDING_API_KEY` | 是 | 仅服务端 | `/api/search` 的 Gemini Embedding；也是 Agent 的备用变量 |
| `GEMINI_API_KEY` | 建议 | 仅服务端 | Agent `/explain` 使用的 Gemini Embedding |
| `MIMO_API_KEY` | 是 | 仅服务端 | 五个 Agent Skill 的 MiMo LLM 调用 |
| `MIMO_BASE_URL` | 否 | 仅服务端 | 覆盖 MiMo API Base URL |
| `SUPABASE_URL` | 否 | 仅服务端 | Admin Client 的 Supabase URL 备用变量 |

> [!WARNING]
> `SUPABASE_SERVICE_ROLE_KEY`、`MIMO_API_KEY`、Gemini Key 和 LlamaParse Key 都属于服务端机密。任何机密都不能使用 `NEXT_PUBLIC_` 前缀，也不能提交到 Git、前端 Bundle、客户端日志或公开构建产物中。

### Supabase Edge Functions

Edge Function 使用的 Secret 名称与 Web Runtime 不同，且区分大小写：

| Secret | 使用函数 | 用途 |
| --- | --- | --- |
| `LlamaParse` | `parse-document` | LlamaParse API Key |
| `Embedding` | `vectorize-document` | Gemini Embedding API Key |
| `LLM` | `generate-summary`、`generate-mindmap` | MiMo API Key |
| `SUPABASE_URL` | 所有函数 | Supabase 运行时提供 |
| `SUPABASE_SERVICE_ROLE_KEY` | 所有函数 | Supabase 运行时提供，仅服务端使用 |

设置自定义 Secrets：

```bash
supabase secrets set \
  LlamaParse="<llamaparse-api-key>" \
  Embedding="<gemini-api-key>" \
  LLM="<mimo-api-key>"
```

## Supabase 配置

### 1. 关联已有项目

```bash
supabase login
supabase projects list
supabase link --project-ref <project-ref>
```

关联后先检查迁移差异：

```bash
supabase migration list
supabase db push --dry-run
```

确认无误后应用仓库内尚未执行的增量迁移：

```bash
supabase db push
```

当前迁移会创建或更新：

- `agent_skill_sessions`
- `hybrid_search_scoped`
- `vector_search_scoped`
- `keyword_search_scoped`

### 2. 部署 Edge Functions

```bash
supabase functions deploy
```

也可以单独部署：

```bash
supabase functions deploy parse-document
supabase functions deploy vectorize-document
supabase functions deploy generate-summary
supabase functions deploy generate-mindmap
```

部署后可通过以下命令查看远程函数：

```bash
supabase functions list
```

### 3. 新建空 Supabase 项目时必须补齐的资源

当前仓库不是完整的数据库初始化模板。以下资源被代码直接依赖，但其基础迁移未包含在当前压缩包中。

#### 数据表

| 表 | 用途 | 当前迁移是否完整包含 |
| --- | --- | --- |
| `profiles` | 用户档案，Agent Session 外键依赖 | 否 |
| `documents` | 文档主表及处理状态 | 否 |
| `document_contents` | Markdown、Outline、Metadata | 否 |
| `document_assets` | 文档图片等资源记录 | 否 |
| `document_chunks` | 分块文本、Heading Path、768 维向量 | 否 |
| `document_summaries` | AI 摘要及结构化字段 | 否 |
| `document_mindmaps` | 思维导图 JSON 与 Markdown Outline | 否 |
| `document_processing_jobs` | 处理任务日志与失败原因 | 否 |
| `folders` | 用户文件夹 | 否 |
| `tags` | 用户标签 | 否 |
| `document_tags` | 文档与标签关联 | 否 |
| `agent_skill_sessions` | `/tutor` 与 `/quiz` 多轮会话 | 是 |

还需要：

- 启用 `vector` / pgvector 扩展。
- 将 `document_chunks.embedding` 配置为与代码一致的 768 维向量。
- 提供 `public.set_updated_at()`，因为 Agent Session 迁移中的 Trigger 会调用它。
- 提供全局 `public.hybrid_search`，供 `/api/search` 使用。
- 为所有暴露给 Data API 的表启用 RLS 并配置所有权策略。
- 根据项目的 Data API 设置，为 `authenticated` 角色授予必要的表访问权限；`GRANT` 与 RLS 是两个不同层次，缺一不可。

#### Storage Buckets

| Bucket | 建议权限 | 用途 |
| --- | --- | --- |
| `document-originals` | 私有 | 用户上传的原始文档 |
| `document-assets-public` | 公共读取，服务端写入 | 解析后的文档图片资源 |
| `userResources` | 当前代码使用 Public URL | 用户头像 |

Bucket Policy 必须限制用户只能写入自己的路径，例如 `<auth.uid()>/<resource-id>`。不要仅依赖前端生成路径来保证隔离。

### 4. 本地 Supabase

如果需要完整本地栈，应先安装 Docker 兼容运行时和 Supabase CLI：

```bash
supabase init
supabase start
```

`supabase init` 会生成当前仓库缺少的 `supabase/config.toml`。但是在运行 `supabase db reset` 前，必须先添加完整业务基线迁移，否则现有增量迁移会因为缺少 `profiles`、`documents`、`set_updated_at()` 等依赖而失败。

> [!CAUTION]
> 本地 Supabase Stack 仅用于开发，不应直接暴露到公网。执行 `supabase db reset` 或任何带 `--linked` 的重置命令前，请确认目标不是生产数据库。

### 5. Auth 配置

在 Supabase Dashboard 中至少检查：

- Site URL：本地可设为 `http://localhost:3000`
- GitHub OAuth Provider 已启用并填写 GitHub Client ID/Secret
- Redirect URL 包含 `http://localhost:3000/api/auth/callback`
- 邮件模板中的确认链接指向 `/api/auth/confirmEmail`
- 生产域名对应的回调 URL 已加入 Allow List

## 启动项目

### 开发模式

```bash
pnpm --filter noter-web dev
```

### 生产构建

```bash
pnpm --filter noter-web build
pnpm --filter noter-web start
```

默认端口为 `3000`。如需修改端口：

```bash
pnpm --filter noter-web dev -- -p 3001
```

修改端口时同步更新 `NEXT_PUBLIC_API_URL`、Supabase Site URL 和 OAuth Redirect URL。


## Agent Skills

Agent Runtime 通过显式 Skill Registry 注册五个 Skill。

| Command | 名称 | 模式 | 说明 |
| --- | --- | --- | --- |
| `/brief` | 速览这篇 | 单轮 | 输出文档类型、核心主张、章节地图、目标读者和阅读路径 |
| `/tutor` | 章节私教 | 多轮 | 逐章讲解并通过引导问题检验理解 |
| `/explain` | 解释概念 | 单轮 | 检索当前文档 Chunk，结合引用解释指定概念 |
| `/actions` | 行动项提取 | 单轮 | 生成待办、待学概念和延伸阅读建议 |
| `/quiz` | 考考我 | 多轮 | 支持单选、多选、填空和简答，生成题组并评分 |

### Skill Router 优先级

1. 请求包含显式 `command`：直接启动对应 Skill。
2. 存在有效的 `/tutor` 或 `/quiz` Session：进入 `resume` 模式。
3. 仅提供自然语言：通过关键词和 LLM 进行意图分类。

`/tutor` 与 `/quiz` 的 Session 默认有效期为 24 小时，持久化在 `agent_skill_sessions` 中。切换 Skill 时，Runtime 会先中断旧 Session，再发送 Banner 和新 Skill 内容。

### Quiz 安全约束

测验正确答案仅保存在服务端 Session State 中。发送 `QuizGroupCard` 前必须移除 `correctAnswer`，前端类型也不包含该字段。任何在浏览器响应中出现正确答案的情况都应视为严重的数据泄露问题。

## API 概览

除 SSE 接口外，普通 API 使用统一 JSON 响应结构：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

### Auth

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/auth/register` | 邮箱、密码、用户名注册 |
| `POST` | `/api/auth/signin` | 邮箱密码登录 |
| `POST` | `/api/auth/signout` | 退出登录 |
| `POST` | `/api/auth/github` | 获取 GitHub OAuth URL |
| `GET` | `/api/auth/callback` | OAuth Code 换取 Session |
| `GET` | `/api/auth/confirmEmail` | 邮箱 OTP 确认 |
| `GET` | `/api/auth/profile` | 获取用户资料 |
| `PATCH` | `/api/auth/profile` | 更新用户名 |
| `POST` | `/api/auth/avatar` | 上传用户头像 |
| `POST` | `/api/auth/change-email` | 修改邮箱 |
| `POST` | `/api/auth/change-password` | 修改密码 |

### Documents

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/documents` | 分页、筛选和排序文档 |
| `POST` | `/api/documents/upload` | 上传文档并触发处理流水线 |
| `GET` | `/api/documents/:id` | 获取文档、内容、标签、摘要和思维导图 |
| `DELETE` | `/api/documents/:id` | 软删除文档 |
| `GET` | `/api/documents/:id/status` | 获取处理状态 |
| `POST` | `/api/documents/:id/cover` | 设置封面 |
| `DELETE` | `/api/documents/:id/cover` | 删除封面 |
| `POST` | `/api/documents/:id/tags` | 绑定标签 |
| `DELETE` | `/api/documents/:id/tags/:tagId` | 解绑标签 |

`GET /api/documents` 支持：

- `page`
- `pageSize`：仅 `10`、`20`、`50`
- `tagIds`
- `folderId`
- `status`
- `isFavorite`
- `isArchived`
- `fileExts`
- `createdFrom`
- `createdTo`
- `orderBy`
- `order`

### Folders、Tags 与 Search

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/folders` | 获取文件夹树 |
| `POST` | `/api/folders` | 创建文件夹 |
| `PATCH` | `/api/folders/:id` | 更新文件夹 |
| `DELETE` | `/api/folders/:id` | 软删除文件夹 |
| `GET` | `/api/tags` | 获取标签 |
| `POST` | `/api/tags` | 创建标签 |
| `DELETE` | `/api/tags/:id` | 删除标签 |
| `GET` | `/api/search` | 混合搜索，`query` 长度 1–200，`limit` 范围 1–50 |

### AI

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/ai/regenerate-summary` | 重新生成摘要 |
| `POST` | `/api/ai/regenerate-mindmap` | 重新生成思维导图 |
| `POST` | `/api/ai/chat/stream` | Agent SSE 入口 |
| `GET` | `/api/ai/sessions` | 获取当前文档的有效 Agent Session |
| `PATCH` | `/api/ai/sessions/:id` | 更新/结束 Session |
| `DELETE` | `/api/ai/sessions/:id` | 软删除 Session |

## 数据与流式协议

### SSE 请求体

```json
{
  "documentId": "uuid",
  "messages": [
    {
      "role": "user",
      "content": "帮我快速了解这篇文档"
    }
  ],
  "command": "/brief",
  "params": {},
  "sessionId": "optional-uuid"
}
```

其中：

- `command` 可选，取值为 `/brief`、`/tutor`、`/explain`、`/actions`、`/quiz`
- `params` 用于传递概念、Quiz 配置或答案等结构化数据
- `sessionId` 用于恢复 `/tutor`、`/quiz` 多轮会话
- 文档必须属于当前用户、未软删除且状态为 `ready`

### SSE 响应头

```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### SSE 事件

| 事件 | 作用 |
| --- | --- |
| `content` | 流式 Markdown 文本 |
| `structured_message` | Brief、Tutor、Explain、Actions、Quiz 等结构化卡片 |
| `follow_ups` | 当前回答后的下一步 Skill 建议 |
| `session_banner` | 多轮 Session 的 active、ended、interrupted 状态 |
| `error` | Runtime 或外部服务错误 |

示例：

```text
data: {"event":"content","content":"正在分析文档..."}

data: {"event":"structured_message","messageType":"BriefCard","payload":{}}

data: {"event":"follow_ups","chips":[{"label":"考考我 📝","command":"/quiz"}]}

data: [DONE]
```


## 许可证

本项目根 `package.json` 声明使用 [ISC License](https://opensource.org/license/isc-license-txt)。如果项目准备公开发布，建议在仓库根目录补充独立的 `LICENSE` 文件。

## 相关文档

- [Next.js Documentation](https://nextjs.org/docs)
- [pnpm Workspace](https://pnpm.io/workspaces)
- [Supabase Local Development](https://supabase.com/docs/guides/local-development)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)

