---
inclusion: always
---

# Product: Noter

Noter is a web-based note-taking and document management application. Users sign up, log in, and manage notes and documents through a dashboard interface.

## Status
Early development. Auth flows (sign in, sign up, email confirmation) are functional. The main content pages (home, notes, documents, search) are scaffolded but have no real implementation yet.

## Language
- UI text is in English
- Code comments and API response messages are in Chinese (中文). Follow this convention when adding new API messages or code comments.

## Auth Architecture
Authentication uses a dual-layer approach:
1. Supabase Auth (server-side via `@supabase/ssr` with cookie-based sessions) handles actual identity management
2. Next.js API routes (`app/api/auth/*`) act as a proxy layer, validating input with Zod and returning standardized `{ code, message, data }` responses
3. The client calls these API routes through the `@noter/api` HTTP client, not Supabase directly

Client-side auth flow: login-form calls `userApi.login()` → fetches profile via `userApi.getProfile()` → stores user in Zustand (`useUserStore`). The `UserProvider` in `MainLayout` auto-fetches the profile on mount for authenticated routes.

## Planned Features
- Home dashboard, notes management, document management, and search are scaffolded under `app/(main)/` but not yet implemented.
