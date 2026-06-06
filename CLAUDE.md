# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ระบบยืมคืนเครื่องดนตรี v5.2 — Music instrument borrowing/return system for a school. Deployed at [music-borrow.vercel.app](https://music-borrow.vercel.app).

**Stack:** Vanilla JS SPA (main app) + React/Vite sub-app (`student-groups/`) + Supabase (PostgreSQL + Auth + Edge Functions) + Vercel

---

## Commands

### Deploy
```bash
# Preview deploy
vercel

# Production deploy — ALWAYS run promote after, otherwise the alias does NOT update
vercel --prod
vercel promote <deployment-url>
```

### student-groups sub-app (React/Vite)
```bash
cd student-groups
npm install
npm run dev        # dev server
npm run build      # production build
npm run preview    # preview build
```

### SQL Migrations
Run migrations manually in the **Supabase SQL Editor** (Dashboard > SQL Editor). Files are in the root:
- `supabase_schema.sql` — base schema
- `supabase_rls.sql` — RLS policies
- `MIGRATION_*.sql` — feature migrations (run in order if setting up fresh)

---

## Architecture

### File Roles (Strict — do not break)

| File | Responsibility |
|---|---|
| `api.js` | **All** Supabase calls. No other file may call `supabase` directly. |
| `ui.js` | DOM manipulation, event handlers (no DB calls) |
| `student-dashboard.js` | Student view rendering |
| `admin-dashboard.js` | Admin view rendering |
| `main.js` | Bootstrap: auth listeners, service worker, form wiring |
| `auth.js` | Login, register, OAuth, password reset |
| `config.js` | Supabase client init, VAPID key, icon maps, translation strings |
| `utils.js` | Shared helpers (safe event listeners, etc.) |
| `player-card.js` | Reusable player card component |
| `sw.js` | Service worker — must use **Network-First** for `.html` routes |

### Routing
- `/` → `index.html` (vanilla JS SPA)
- `/student-groups/*` → React app at `student-groups/dist/` (via Vercel rewrites in `vercel.json`)
- `/staffwars.html`, `/rhythmcore.html` → isolated mini-games

### Mini-Games (staffwars.html, rhythmcore.html)
- Isolated; must NOT call Supabase directly
- Send scores to main app via `window.postMessage`
- Timer logic must be tamper-resistant

### Auth
- Supabase Auth (JWT) is the single source of truth for permissions and scores
- Never trust `localStorage` for role/score logic
- Auth guard: wait for `INITIAL_SESSION` event before calling `launchDashboard`; skip early `SIGNED_IN` events
- `noopLock` must remain disabled in Supabase client config

### PWA
- `sw.js` uses Network-First for HTML, Cache-First for assets
- Use Event Delegation for frequently re-rendered UI (prevents memory leaks)
- Web Push: subscriptions stored in `push_subscriptions` table; Edge Function `send-push` fires notifications via VAPID

### No Global Pollution
All code uses ES Modules. Never attach functions/variables to `window`. Always use `export`.

---

## Database (Supabase)

**Key tables:** `users`, `instruments`, `borrow_records`, `push_subscriptions`, `notifications`, `learning_feed`

RLS is active on all tables. Always verify RLS policies when adding new tables or functions. Reference `AUDIT_RLS_POLICIES.sql` for the audit pattern.

When writing new RPCs/functions, add them to `api.js` — never call `.rpc()` from UI files directly.

---

## Known Pitfalls

1. `vercel --prod` does NOT auto-update the production alias — must run `vercel promote <url>` after every production deploy.
2. Supabase `noopLock` must stay disabled or auth will break.
3. Skip `SIGNED_IN` events that fire before `INITIAL_SESSION` in the auth listener.
4. `api.js` is the only file allowed to import from `@supabase/supabase-js`.
