---
inclusion: always
---

# Project Structure

```
app/
├── (auth)/              # Auth route group (signin, signup, callback)
├── (main)/              # Authenticated route group (home, notes, documents, search)
│   └── MainLayout.tsx   # Wraps children with UserProvider
├── api/auth/            # Next.js API routes (signin, register, profile, confirmEmail)
├── provider/            # Client-side providers (UserProvider fetches user on mount)
├── layout.tsx           # Root layout (fonts, global CSS, TooltipProvider)
└── page.tsx             # Landing page with sign-in/sign-up links

components/
└── auth/                # Auth form components (login-form, signup-form, profile)

hooks/                   # Custom React hooks (useFormState)

lib/
├── axios/               # HTTP client setup using @noter/api
│   ├── client.ts        # Configured HTTP client with error interceptors
│   └── auth.ts          # Domain API methods (login, register, getProfile, etc.)
└── supabase/            # Supabase client helpers
    ├── server.ts        # Server-side Supabase client (cookie-based)
    └── middleware.ts     # Middleware session refresh

stores/                  # Zustand stores (user state)
types/                   # TypeScript interfaces (auth types, API response types)

utils/noterFetch/
├── http/
│   ├── handler.ts       # Wraps API route handlers with Zod/JSON/generic error catching
│   └── response.ts      # Standardized JSON response helpers: success() / error()
└── feature/<domain>/    # Feature-specific Zod schemas (e.g. feature/auth/schmas.ts)
```

## Conventions
- Pages use `default function` exports (not named exports)
- Client components use the `'use client'` directive
- API routes wrap handlers with `handler()` from `utils/noterFetch/http/handler.ts`
- API responses follow `{ code, message, data }` shape via `success()` / `error()`
- Zod schemas live in `utils/noterFetch/feature/<domain>/` and validate request bodies in API routes
- UI components come from `@noter/ui/components/*` — never create local duplicates
- State management uses Zustand stores in `stores/`
- Form state is managed via the `useFormState` hook from `hooks/`
- New domain API methods go in `lib/axios/` following the pattern in `auth.ts` (object with methods calling `http`)
- Types/interfaces go in `types/` organized by domain
- Global CSS is imported from `@noter/ui/globals.css` in the root layout — do not add a separate `globals.css` import
- Root layout wraps everything in `TooltipProvider` from `@noter/ui`
- The HTTP client (`lib/axios/client.ts`) handles 401 by clearing token and redirecting to `/login`
- Fonts: Geist (sans) and Geist Mono loaded via `next/font/google`
