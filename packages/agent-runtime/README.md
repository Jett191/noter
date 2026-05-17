# @noter/agent-runtime

Noter agent runtime: Skill Router + Tool Layer providing the 5 Skills (`/brief`, `/tutor`, `/explain`, `/actions`, `/quiz`) as an in-process library consumed by `apps/noter-web` Route Handlers (SSE).

This package is a **monorepo internal package** (`workspace:*`). It is imported directly by `apps/noter-web` — there is no separate HTTP/Deno service.

## Runtime

- TypeScript (ESM, `"type": "module"`)
- Node.js (whatever Next.js Route Handlers run on)
- No Deno import map / std lib

## Dependencies

Runtime:

- `@supabase/supabase-js` — DB client (service_role); pinned to the same version as `apps/noter-web` so the workspace dedupes a single copy.
- `zod` — JSON Schema validation for `LLMTool.completeJson` and tool inputs.

Dev:

- `vitest` — unit + integration test runner.
- `fast-check` — property-based testing.

Install with:

```bash
pnpm install
```

(Run from the monorepo root. Do **not** run `pnpm install` inside this package directory.)

## Environment variables

This package reads its configuration from **process env**. It does not load its own `.env` file — env values are inherited from the host process (`apps/noter-web`'s Next.js runtime, which already loads `apps/noter-web/.env` / `.env.local`).

| Variable                    | Purpose                                                                                                  | Source                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `SUPABASE_URL`              | Supabase project URL. Falls back to `NEXT_PUBLIC_SUPABASE_URL` when running inside the noter-web process. | `apps/noter-web/.env.local`             |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (DB access bypassing RLS — used for `agent_skill_sessions` and tool SQL).      | `apps/noter-web/.env.local` ✅ already set |
| `MIMO_API_KEY`              | API key for MiMo LLM (`mimo-v2.5-pro`).                                                                  | `apps/noter-web/.env.local` ⚠️ **MISSING** |
| `GEMINI_API_KEY`            | API key for Gemini Embedding (`gemini-embedding-2`, 768 维).                                             | `apps/noter-web/.env.local` ⚠️ may exist as `EMBEDDING_API_KEY` — see note |

### Notes on the current `apps/noter-web/.env.local`

At the time this package was scaffolded, `apps/noter-web/.env.local` already had:

- `NEXT_PUBLIC_SUPABASE_URL` — provides `SUPABASE_URL` (the runtime should read both names).
- `SUPABASE_SERVICE_ROLE_KEY` — ready to use.
- `EMBEDDING_API_KEY` — currently used by `vectorize-document` Edge Function. agent-runtime expects the same Gemini key under `GEMINI_API_KEY`. Either:
  - rename / duplicate the value as `GEMINI_API_KEY` in `apps/noter-web/.env.local`, or
  - have the runtime read `process.env.GEMINI_API_KEY ?? process.env.EMBEDDING_API_KEY`.

Still **missing** and must be added to `apps/noter-web/.env.local` before the agent can run end-to-end:

```dotenv
# MiMo LLM (mimo-v2.5-pro) — required by all 5 Skills
MIMO_API_KEY=...

# Gemini Embedding (gemini-embedding-2, 768 dim) — required by /explain
GEMINI_API_KEY=...   # may alias EMBEDDING_API_KEY
```

This package does **not** ship its own `.env` template — config is shared with `noter-web` to keep a single source of truth.
