---
inclusion: always
---

# Tech Stack

## Core
- Next.js 16 (App Router) with React 19
- TypeScript (strict mode)
- Tailwind CSS v4 (via `@tailwindcss/postcss`)
- Supabase for auth and backend (`@supabase/ssr` + `@supabase/supabase-js`)

## Monorepo
This workspace (`noter-web`) is an app within a larger monorepo. It consumes two workspace packages:
- `@noter/ui` — shared UI component library (shadcn/ui, radix-nova style). Import components from `@noter/ui/components/*` and utils from `@noter/ui/lib/utils`.
- `@noter/api` — shared HTTP client library (provides `createClient` and `createRequest`). Used in `lib/axios/client.ts`.

The tsconfig extends `../../tsconfig.base.json`. The `next.config.ts` transpiles `@noter/ui`.

## Key Libraries
- `zod` — schema validation for API route inputs
- `zustand` — client-side state management (stores in `stores/`)
- `lucide-react` — icons
- shadcn/ui components via `@noter/ui/components/*` (do NOT create local copies)
- `cn()` utility from `@noter/ui/lib/utils`

## Path Aliases
- `@/*` → app root (e.g. `@/lib/axios/auth`)
- `@noter/ui/*` → `../../packages/ui/src/*`

## Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — Supabase anon/publishable key
- `NEXT_PUBLIC_API_URL` — Backend API base URL (defaults to `http://localhost:3001`)

## ESLint
- Flat config (`eslint.config.mjs`) using `eslint-config-next` (core-web-vitals + typescript)
- `@next/next/no-img-element` is disabled

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — run ESLint (flat config, no `.eslintrc`)
