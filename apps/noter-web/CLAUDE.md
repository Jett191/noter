# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`noter-web` is the Next.js 16 frontend for the Noter app, part of a pnpm monorepo at `../../`.

**Monorepo structure:**
- `apps/noter-web` — Next.js frontend (this repo, React 19, Tailwind v4, App Router)
- `apps/noter-server` — Deno backend (PostgreSQL via `@db/postgres`)
- `apps/noter-admin` — Admin frontend
- `packages/ui` — Shared UI component library (`@noter/ui`, shadcn radix-nova style)
- `packages/api`, `packages/hooks`, `packages/utils` — Shared packages
- `docker/` — Docker Compose configs (dev/prod), Nginx

## Commands

```bash
# From this directory (apps/noter-web)
pnpm dev          # Start Next.js dev server
pnpm build        # Production build
pnpm lint         # ESLint

# From monorepo root
pnpm commit       # Commitizen (cz-customizable, conventional commits)
pnpm lint         # Lint all packages
pnpm format       # Prettier format all
```

## Key Architecture

**Auth:** Supabase (`@supabase/ssr` + `@supabase/supabase-js`). Client utils in `utils/supabase/`, API routes in `app/api/login/` and `app/api/signup/`.

**UI Components:** shadcn components live in `packages/ui/src/components/` (imported as `@noter/ui/components/*`). App-specific components in `components/`. Utils alias: `@noter/ui/lib/utils`.

**Path aliases:**
- `@/*` → project root (this app)
- `@noter/ui/*` → `../../packages/ui/src/*`

**Styling:** Tailwind v4 with CSS variables. Global styles at `packages/ui/src/styles/globals.css`.

**Package manager:** pnpm 10 (workspace protocol `workspace:*` for internal deps). Husky + lint-staged + commitlint enforced.
