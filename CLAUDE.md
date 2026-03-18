# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

noter 是一个 pnpm monorepo 项目，使用中文作为主要开发语言环境。

- `apps/noter-web` — 主应用，Next.js 16 + React 19 + Tailwind CSS v4 + TypeScript 5
- `apps/noter-app`、`apps/noter-deno` — 预留应用目录
- `packages/` — 共享包目录（api、hooks、utils），当前为空

## Commands

```bash
# 根目录
pnpm lint                    # ESLint 检查（--max-warnings=0）
pnpm format                  # Prettier 格式化
pnpm commit                  # Commitizen 交互式提交（中文提示）

# noter-web
pnpm --filter noter-web dev  # 启动开发服务器
pnpm --filter noter-web build
pnpm --filter noter-web lint
```

## Commit Convention

提交格式：`<emoji type>(<scope>): <subject>`

示例：`✨ feat(page): 添加登录页面`

类型必须带 emoji 前缀：`✨ feat`、`🐛 fix`、`🎉 init`、`📗 docs`、`🌈 style`、`🍀 refactor`、`🔥 perf`、`✅ test`、`⏪️ revert`、`📦 build`、`🚀 chore`、`👷 ci`

scope 必填，常用：components、page、css、api，也可自定义。subject 限 49 字符。

Husky pre-commit 会自动运行 lint-staged（eslint --fix + prettier --write），commit-msg 会校验 commitlint。

## Code Style

- Prettier：单引号、无分号、无尾逗号、100 字符宽度、JSX 单引号
- ESLint：extends recommended + @typescript-eslint/recommended + prettier
- Tailwind CSS v4（通过 PostCSS 插件）
- Next.js App Router（非 Pages Router）
- TypeScript 路径别名：`@/*` 映射到项目根目录
