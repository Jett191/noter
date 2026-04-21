# Noter Web 项目指南 (GEMINI.md)

## 项目概览

本项目 (`noter-web`) 是一个基于 **Next.js (App Router)** 和 **React 19** 构建的现代 Web 应用程序。它作为 `noter` 平台的前端应用，通过 monorepo 的方式引入了共享 UI 组件库 `@noter/ui`。
项目的核心功能似乎围绕文档（Documents）、笔记（Notes）、搜索（Search）和用户身份验证展开。

### 核心技术栈

- **框架**: Next.js 16 (App Router), React 19, TypeScript
- **样式**: Tailwind CSS v4
- **UI 组件**: `@noter/ui` (基于 shadcn-ui 风格构建的内部包), Lucide React (图标)
- **后端/数据库/认证**: Supabase (`@supabase/ssr`, `@supabase/supabase-js`)

## 构建与运行

该项目使用标准 Next.js 脚本。可以在项目根目录下使用您习惯的包管理器（如 pnpm、npm 或 yarn，考虑到 monorepo 环境，极有可能是 pnpm）运行以下命令：

- **启动开发服务器**:
  ```bash
  npm run dev
  # 或 pnpm dev
  ```
- **构建生产环境版本**:
  ```bash
  npm run build
  # 或 pnpm build
  ```
- **运行生产环境**:
  ```bash
  npm run start
  # 或 pnpm start
  ```
- **代码检查**:
  ```bash
  npm run lint
  # 或 pnpm lint
  ```

## 开发规范与架构

- **组件共享策略**:
  该项目通过 `components.json` 配置和路径别名，深度集成了 `@noter/ui` 这个工作区（workspace）包。
  - 公共的基础组件（如按钮、输入框、Tooltip）均从 `@noter/ui/components` 引入。
  - 核心样式表和全局工具函数也由 `@noter/ui` 提供 (例如 `cn` 函数)。
- **路由约定 (App Router)**:
  所有页面和 API 路由均基于 Next.js App Router 存放在 `app/` 目录中。包括诸如 `/signin`, `/signup`, `/documents`, `/notes`, `/search` 等页面。
- **状态管理与服务端通信**:
  默认使用 React 19 的特性及 Server Components。与 Supabase 交互的客户端及服务端辅助函数封装在 `utils/supabase/` 目录下。
- **认证机制**:
  提供了 `/api/login` 和 `/api/signup` 路由用于处理用户认证，结合 Supabase SSR (Server-Side Rendering) 实现完整的身份验证流程。

## 关键目录说明

- `app/`: 存放页面组件 (Page)、布局 (Layout) 和 API 路由。
- `components/`: 存放该 web 应用程序专属的具体业务组件（例如 `signup-form.tsx`）。基础复用组件应从 `@noter/ui` 引入。
- `utils/supabase/`: 存放连接和操作 Supabase 的客户端 (`client.ts`) 和服务端 (`server.ts`) 工具代码。
- `hooks/`, `lib/`, `types/`: 分别用于存放 React Hooks、通用业务逻辑和 TypeScript 类型定义。
- `components.json`: 用于配置 Shadcn UI 组件的解析路径。
- `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `tsconfig.json`: 项目的各项核心配置。
