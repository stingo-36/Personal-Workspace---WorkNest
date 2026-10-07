# Architecture — WorkNest

> **How it's built.** Read this instead of re-scanning the repo. If you add, move or
> delete a module, route, model or script, update the relevant section in the same
> change.
>
> Last synced with the codebase: **2026-10-07**

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.3** (App Router, `src/` dir, alias `@/*`) | Breaking changes vs. older Next — read `app/node_modules/next/dist/docs/` before using an unfamiliar API. `middleware.ts` is now **`proxy.ts`**. Production build uses `next build --webpack`. |
| UI | **React 19.2**, TypeScript 5 | Server Components by default; `"use client"` only where needed. |
| Styling | **Tailwind CSS 4** (CSS-first, no `tailwind.config`) | All tokens in `src/app/globals.css` via `@theme inline`. |
| Form fields | **MUI 9** (`@mui/material`, `@mui/material-nextjs`) + Emotion | In `@layer mui` so Tailwind wins. |
| Rich text | **TipTap 3** (+ lowlight) | Notes pages (JSON) and work-log Markdown fields. |
| Motion | `motion` / `framer-motion` (app); plain CSS + IntersectionObserver on the homepage | |
| Icons | `lucide-react` (app), `react-icons` (note icons) | |
| Data | **PostgreSQL 16** + **Prisma 7.10** with `@prisma/adapter-pg` | Client generated to `src/generated/prisma` (gitignored). URL lives in `prisma.config.ts`, not the schema. |
| Auth | **Auth.js / NextAuth v5 beta** — Credentials provider, **JWT** sessions (30 days), `@auth/prisma-adapter`, `bcryptjs` (cost 12) | |
| Validation | **Zod 4** | Every mutation. |
| Toasts | `sonner` (wrapped in `components/ui/toast.tsx`) | |
| Dates | `date-fns` 4 | |
| Runtime | Node 24 | |

## 2. Repository layout

```
/                              repo root (git)
├── AGENTS.md  CLAUDE.md       agent instructions (CLAUDE.md imports AGENTS.md)
├── PRD.md  Design-System.md  Architecture.md  Memory.md  skills.md
├── .claude/skills/            project design skills (design-taste-frontend, redesign-existing-projects, ui-ux-pro-max)
├── README.md                  clone → `npm run dev` quick start
├── scripts/setup.mjs          one-command, idempotent local setup (zero deps)
├── package.json               root convenience scripts → delegate to app/
├── docker-compose.yml         Postgres 16, container workspace-db, host port 5434
└── app/                       the Next.js application
    ├── next.config.ts         LAN dev origin 192.168.31.130 (dev assets + server actions)
    ├── prisma.config.ts       schema path, migrations dir, seed command, DATABASE_URL
    ├── components.json        shadcn config (utils alias → @/components/cn)
    ├── prisma/
    │   ├── schema.prisma      the data model (§5)
    │   ├── migrations/        23 migrations, init 2026-09-11 → sprint_reports 2026-10-02
    │   └── seed*.ts           seed scripts (§8)
    ├── scripts/
    │   └── hosted-db.mjs      migrate (+ optional seed) the hosted DB
    ├── public/home/           3D character art: hero-1…4.webp (hero corners), recap-avatar.webp, auth-login/auth-register.webp
    └── src/
        ├── proxy.ts           route protection (§4)
        ├── app/               routes (§3)
        ├── actions/           "use server" — the client's entire API surface
        ├── lib/               server-only data + domain layer
        ├── components/        UI (see Design-System.md §8)
        └── generated/prisma/  generated client (never edit)
```

## 3. Routes

Route groups: `(marketing)` public homepage, `(auth)` login/register, `(app)`
authenticated shell.

| Path | File | Kind |
|---|---|---|
| `/` | `(marketing)/page.tsx` → `HomePage` (`components/home/*`: `home-page`, `feature-showcase`, `doodles`, `recap-avatar` (user's 3D character cut-out `public/home/recap-avatar.webp`; hidden while missing); `screen-motion` (replays each snapped screen's `[data-anim]` entrance on every arrival, direction-aware); styles `(marketing)/home.css` + `app/brand-art.css`) | public |
| `/login`, `/register` | `(auth)/*/page.tsx` | public; redirect to `/tracker` if signed in |
| `/work-logs` | `(app)/work-logs/page.tsx` | sprint-grouped listing |
| `/work-logs/[workLogId]` | `.../page.tsx` | read-only detail + Copy as text; side rail begins with that day's Tracker to-dos |
| `/work-logs/[workLogId]/edit` | `.../edit/page.tsx` | `WorkLogEditor` |
| `/tickets` | `(app)/tickets/page.tsx` | `TicketBoard`; redirects to `/work-logs` if tickets disabled |
| `/tracker` | `(app)/tracker/page.tsx` | `TrackerBoard` — cross-list Needs you section first, then To-do / Follow-ups / Notes tabs; default landing after login; `?view=todo\|followups\|notes` picks the tab |
| `/notes`, `/notes/new`, `/notes/[noteId]`, `/notes/[noteId]/edit` | `(app)/notes/**` | notebooks |
| `/resources` | `(app)/resources/page.tsx` | `ResourceLibrary` |
| `/favourites` | `(app)/favourites/page.tsx` | reads Prisma directly |
| `/profile` | `(app)/profile/page.tsx` | `ProfileForm` |
| `/achievements` | `(app)/achievements/page.tsx` | `AchievementsBoard` (account menu) |
| `/reports` | `(app)/reports/page.tsx` | `ReportView` (account menu); `?sprint=YYYY-MM-DD` |
| `/dashboard` | `(app)/dashboard/page.tsx` | `redirect("/tracker")` (retired) |
| any unknown URL | `app/not-found.tsx` | branded 404 → Tracker / homepage |
| `/tasks`, `/links`, `/settings` | `(app)/*/page.tsx` | `ComingSoonPage` |
| `GET/POST /api/auth/[...nextauth]` | route handler | NextAuth |
| `POST /api/work-logs/[workLogId]/attachments` | route handler | multipart upload (field `files`) |
| `GET /api/attachments/[attachmentId]` | route handler | owner-only download |
| `POST /api/achievements/[achievementId]/files` | route handler | certificate upload (field `files`) |
| `GET /api/achievement-files/[fileId]` | route handler | owner-only certificate download |

`(app)/layout.tsx` runs `requireUser()` + `getUserSettings()` once, wraps children in
`MuiProvider` + `AppShell`, and passes `ticketsEnabled` to the nav. `AppShell` also
mounts `shell/scroll-reveal.tsx` (one-shot scroll reveals for `data-reveal` /
`data-reveal-stagger` markup — see Design-System §7).

## 4. Request lifecycle & layering

```
browser ──► proxy.ts ──► (app)/layout.tsx ──► page.tsx (Server Component)
            JWT check      requireUser()          reads via actions/* or lib/*
            (no DB)        getUserSettings()      │
                                                  ▼
            client component ──call──► actions/*.ts ("use server")
                                        1. requireUserId()         ← identity from session only
                                        2. parseOrFail(zodSchema)  ← lib/validation.ts
                                        3. lib/*.ts fn(userId, …)  ← every WHERE has userId
                                        4. revalidatePath(...)
                                        5. return ActionResult<T>  ← lib/result.ts
```

- **`proxy.ts`** uses the Prisma-free `lib/auth.config.ts` (`authorized` callback,
  `PUBLIC_ROUTES = ["/", "/login", "/register"]` + `/api/auth/*`). It also
  **clears undecryptable session cookies** (e.g. after an `AUTH_SECRET` change) so a
  stale cookie can't loop forever. Its matcher skips static files by extension (svg/png/jpg/…/woff2) — add any
  new public asset type there or it gets redirected to `/login`.
- **`lib/auth.ts`** adds the Node-only pieces: Credentials provider, PrismaAdapter,
  bcrypt. Unknown emails are compared against a dummy hash (no enumeration).
- **`lib/session.ts`**: `getCurrentUser` (request-memoised; treats a bad cookie as
  signed out), `requireUser`, `requireUserId`. **Every action and query starts here.**
- **`lib/result.ts`**: `ActionResult<T> = {ok:true,data} | {ok:false,error:{code,message,fields?}}`;
  codes `VALIDATION_ERROR | UNAUTHORIZED | NOT_FOUND | CONFLICT | INTERNAL_ERROR`.
- **`lib/*`** files import `"server-only"`. `components/**` must not import them in
  client components — client-safe constants live in components (e.g.
  `components/work-log/day-type.ts` mirrors the server defaults).
- `cn()` lives at `@/components/cn`, not in `lib/`.

### Server modules

| File | Owns |
|---|---|
| `lib/worklogs.ts` | work logs, meetings (3 defaults), learning notes, attachments, days off, UTC-date helpers, `touchWorkLog`, `saveWorkLogSummaryRow` |
| `lib/worklog-summary.ts` | AI input for one log: `workLogHasContent`, `workLogAsText` (tickets, noted meetings, Work done, the day's to-dos via `todosOnDay` in `lib/worklogs.ts`). No code-built summary |
| `lib/ai-summary.ts` | `openRouterComplete` → `AiResult` (text/model, or an `AiFailure`: not_configured/auth/credits/rate_limited/unavailable/cut_off/bad_reply, with the model when one answered); optional `accept` to tidy/reject; one automatic retry on cut_off/bad_reply; `aiFailureMessage`; `summarizeWithOpenRouter`. **AI only — no fallback** |
| `lib/tickets.ts` | **the critical piece** — ticket lookup/upsert, `addTicketWorkUpdate` (upsert on `(ticketId, workLogId)`), detach, standalone history, project names |
| `lib/workflow-status.ts` | 5-stage workflow + legacy status normalisation |
| `lib/follow-ups.ts` | Tracker entries + append-only updates, pin, status, reschedule, tags, `listTodosAroundDay` (work-log to-dos card) |
| `lib/note-store.ts`, `lib/notes.ts`, `lib/note-icons.ts`, `lib/note-colors.ts` | notebooks, trash/restore, icon search, accent colours |
| `components/notes/smooth-scroll.ts`, `components/notes/doc-height.ts` | client: frame-by-frame smooth jump that follows a moving target and pauses lazy page mounting while in flight (`isJumping`, `NOTE_SCROLL_END`); estimated height for an unmounted page body. Used by the reader and the editor |
| `lib/content.ts` | tasks, links, resources (+ favourite) |
| `lib/sprint.ts` | **the only** sprint arithmetic (`getSprint`) — local calendar days |
| `lib/user-lists.ts` | Profile-editable lists: `DEFAULT_LISTS`, ordered lists, project options/suggestions, tag usage + rename/delete (raw SQL, user-scoped) |
| `lib/reports.ts` | sprint list, report data per sprint, AI-only "5-15 Report" (`generateSprintReport` → ok or failure reason; `normalizeReportBody` tolerates bold/other-level section headings and `*`/`•` bullets), staleness; model-less (old code-built) reports ignored |
| `lib/achievements.ts` | achievements + certificate files (bytes only read by the download route) |
| `lib/user-settings.ts` | profile settings (name, sprint config, `ticketsEnabled`), request-memoised |
| `lib/ai-settings.ts` | per-user OpenRouter key/model: `getAiSettings` (client-safe view, never the key), `getOpenRouterConfig` (user key → env fallback), `checkOpenRouterKey`, save/clear |
| `lib/secret-box.ts` | AES-256-GCM `seal`/`open` for stored secrets, keyed off `AUTH_SECRET` |
| `lib/validation.ts` | all Zod schemas |
| `lib/prisma.ts` | Prisma client singleton with the pg adapter |

| Actions file | Exposes |
|---|---|
| `actions/auth.ts` | `register`, `login` (→ `/tracker`), `logout` (→ `/login`) |
| `actions/worklog.ts` | open today/by date, get, adjacent, list, update, delete, meetings CRUD, learning notes, link attachments, delete attachment |
| `actions/tickets.ts` | find, upsert-for-work-log, save work update, detach, get, list, projects, active, update, append/delete history entry, delete ticket |
| `actions/follow-ups.ts` | create, add update, pin, status, reschedule, `setFollowUpTags`, `listTodosForDay`, delete, list, people |
| `actions/notes.ts` | create, update, delete (trash), restore, toggle favourite |
| `actions/content.ts` | tasks, links, resources CRUD + `toggleResourceFavorite` |
| `actions/profile.ts` | `updateProfile`, `saveAiKey`, `removeAiKey`, `saveAiModel` |
| `actions/user-lists.ts` | Profile lists: set/reset ordered list, resource-type icon, add/remove project, add/rename/delete/delete-all tags |
| `actions/reports.ts` | `generateReport` |
| `components/reports/report-format.ts` | client-safe: parse report Markdown → title/sections/groups; `reportToHtml` (doc-styled clipboard HTML), `reportToText` |
| `actions/achievements.ts` | create, update, delete achievement; delete achievement file |

Client-safe shared modules outside `lib/`: `components/work-log/day-type.ts`,
`components/cn.ts`.

## 5. Data model (`app/prisma/schema.prisma`)

Every domain table has `userId` → `User` with `onDelete: Cascade`, and indexes led by
`userId`.

```
User ─┬─ WorkLog ─┬─ Meeting
      │           ├─ WorkLogAttachment (File bytes | Link)
      │           └─ TicketWorkUpdate ─┐
      ├─ Ticket ──┬────────────────────┘   @@unique([ticketId, workLogId])
      │           ├─ TicketHistoryEntry     (standalone, deletable)
      │           └─ Task (optional FK)
      ├─ FollowUp ── FollowUpUpdate          (Tracker; append-only)
      ├─ Note ── NoteSection ── NotePage     (TipTap JSON)
      ├─ Achievement ── AchievementFile      (certificate bytes)
      ├─ Resource   ├─ Link   ├─ Task
      └─ Account / Session (Auth.js)         VerificationToken
```

| Model | Key fields & invariants |
|---|---|
| `User` | `email` unique, `passwordHash`, profile: `sprintStartDate` (`@db.Date`, null = default), `sprintLengthDays` (14), `ticketsEnabled` (true), `openRouterKeyEnc` (sealed, never sent to client) + `openRouterKeyHint` + `openRouterModel` |
| `WorkLog` | `date` `@db.Date` stored as UTC midnight, **`@@unique([userId, date])`**; `title`, `dayType` (Work/Holiday/Leave), `learningNotes` (Markdown), `summary` (generated Markdown, nullable) + `summaryGeneratedAt` + `summaryModel` (null = built from entries) |
| `Meeting` | `name`, `notes` (Markdown), `order`, `isDefault` |
| `WorkLogAttachment` | `kind` File/Link, `name`, `url?`, `mimeType?`, `size?`, `data Bytes?` (≤10 MB). **`data` is never selected in lists** — only the download route reads it. |
| `Ticket` | `ticketId` = human key, **`@@unique([userId, ticketId])`**; `title`, `projectName?`, `status` |
| `TicketWorkUpdate` | one per (ticket, work log): `description`, `status` snapshot. **Append-only history.** |
| `TicketHistoryEntry` | `body`, `status` snapshot; written from `/tickets`; may be deleted |
| `FollowUp` | `kind` (FollowUp/Task/Note — `Idea` folded into Note 2026-10-01), `tags String[]` (notes), `person?` (FollowUp only), `subject`, `ticketKey?` (free text, not FK), `status` Open/Done, `pinned`, `dueDate?` |
| `FollowUpUpdate` | `note`, `channel` (free text from the user's list), `occurredAt`, `fromThem` (their reply vs. what you said — drives Waiting/Replied). **Never updated in place.** |
| `Note` / `NoteSection` / `NotePage` | icon (`iconName`, `iconLibrary` si/lu/fa6), `favorite`, `deletedAt` (trash); sections & pages ordered by `order`; page `content Json` |
| `Resource` | `type` (free text from the user's list; was an enum), `url?`, `content`, `tags[]`, `favorite` |
| `SprintReport` | one per `(userId, sprintStart)` (`@db.Date`, UTC midnight like `WorkLog.date`); `content` (Markdown), `model?` (null = built), `generatedAt` |
| `Achievement` | `title`, `type` (free text), `status` (`AchievementStatus` InProgress/Completed), `assignedBy?`, `startDate?`/`endDate?` `@db.Date`, `description` |
| `AchievementFile` | `name`, `mimeType`, `size`, `data Bytes` (≤10 MB); `userId` denormalised for owner-only download. **`data` never selected in lists.** |
| `Task`, `Link` | exist with actions; no UI yet |
| `UserList` | PK `(userId, kind)`; `values[]` (ordered options, or saved-ahead names for Project/NoteTag/ResourceTag), `hidden[]` (Project: in-use names no longer suggested), `icons Json` (ResourceType: value → `"library:Name"`). No row = built-in defaults; a row whose values equal the defaults isn't "customised" (it may exist only for icons). |

**Enums:** `DayType`, `AttachmentKind`, `TicketStatus` (11 values, 5 used for new
writes), `TaskPriority`, `TaskStatus`, `FollowUpStatus`, `EntryKind`,
`UserListKind`, `AchievementStatus`. (`FollowUpChannel` and `ResourceType` became free-text columns on
2026-10-01 — their options live in `UserList`.)

## 6. Critical invariants

1. **User isolation.** Every read/write filters by the session `userId`. Ownership is
   checked before creating child rows (`assertWorkLogOwned`, `assertTicketOwned`,
   `findFirst({ id, userId })`). Use `updateMany`/`deleteMany` with `userId` in the
   WHERE for single-row mutations.
2. **Append-only ticket history.** All work-update writes go through
   `prisma.ticketWorkUpdate.upsert` keyed on `(ticketId, workLogId)`:
   same log → in-place (autosave-safe), different log → new row. No code path may
   update "the latest update" or blind-create.
3. **Ticket status follows the newest update**; detaching recomputes it.
4. **Tracker updates are append-only** — no edit/delete action exists for a
   `FollowUpUpdate`; a first note is created as an update row, not a field.
5. **Dates:** `WorkLog.date` is UTC midnight (`toDateOnly`, `todayUtc`). Sprint maths
   and "today" in the Tracker use **local** calendar days (`lib/sprint.ts`; the board
   corrects to the browser clock after hydration via `useSyncExternalStore`).
   Dates cross the server→client boundary as ISO strings.
6. **Get-or-create races** are handled by the unique index: on `P2002`, re-read the
   winner's row.
7. **Uploads use route handlers**, not server actions (actions cap bodies at 1 MB).
   Downloads: owner-only, safe types inline (png/jpeg/gif/webp/pdf/txt), everything else
   forced to download, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.

## 7. Environment

`app/.env` (gitignored; template `app/.env.example`):

| Var | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql://workspace:workspace@localhost:5434/workspace?schema=public` locally; pooled Neon URL on Vercel |
| `AUTH_SECRET` | Auth.js secret (`npx auth secret`) |
| `AUTH_TRUST_HOST` | `true` |
| `SEED_EMAIL` | email of the account `db:seed` creates; setup writes `demo@worknest.local` (unset → falls back to the owner's email) |
| `SEED_PASSWORD` | password seeds give the demo account (8+ chars); setup generates one |
| `HOSTED_DATABASE_URL` | Neon **direct/unpooled** URL for `npm run db:hosted` |
| `OPENROUTER_API_KEY` | optional server-wide key for AI work-log summaries; a user's Profile key takes priority |
| `OPENROUTER_MODEL` | comma-separated fallback list; default `google/gemma-4-31b-it:free, openrouter/free` |

`app/.env.vercel` (gitignored) holds values to paste into Vercel. Never commit real
env files; the GitHub repo is public.

## 8. Scripts

Root (`/package.json`, `engines.node >=20.9`):
`setup` (`scripts/setup.mjs`: check Node + Docker → create `app/.env` with generated
`AUTH_SECRET`/`SEED_PASSWORD` if missing → `npm ci` if `node_modules` missing or the
lock changed → `docker compose up -d --wait` → `prisma migrate deploy` → `db:seed`
**only when the `User` table is empty**; every step is idempotent), `dev` (runs `setup`
then app dev), `build`, `start`, `lint`, `typecheck`,
`install:app`, `db:up`, `db:down`, `db:seed`, `db:studio`, `db:migrate`.

App (`/app/package.json`):

| Script | Does |
|---|---|
| `dev` / `build` / `start` / `lint` | Next + ESLint |
| `typecheck` | `next typegen && tsc --noEmit` — typegen first so `LayoutProps` etc. exist on a fresh clone |
| `postinstall` | `prisma generate` (required — client is gitignored) |
| `db:migrate` / `db:reset` / `db:studio` | Prisma |
| `db:seed` | `prisma/seed.ts` — demo user + multi-entry ticket history |
| `db:seed:bulk`, `db:seed:fill`, `db:seed:notes` | older bulk/fill/notes seeds (`fill [-- email days]` also tops up *empty* auto-created logs in the window) |
| `db:seed:sprint [-- email]` | reset one account's content; fill current sprint with work logs + tickets |
| `db:seed:tracker [-- email] [--append]` | replace one account's Tracker entries with a realistic mix; `--append` keeps existing entries and adds a second, different set |
| `db:seed:workspace [-- email]` | fill one account's Notes + Resources with study content (re-runnable) |
| `db:seed:achievements [-- email]` | fill one account's Achievements (7 items; replaces only its own titles) |
| `db:hosted [-- --seed]` | `prisma migrate deploy` (+ seed, which wipes users) against `HOSTED_DATABASE_URL` |

## 9. Deployment

- **Local:** `npm run dev` from the root (Docker Postgres on 5434 + Next on 3000). The
  dev server also accepts the LAN origin `192.168.31.130` (for testing from another
  device) — update `next.config.ts` if the LAN IP changes.
- **Hosted:** Vercel with **Root Directory = `app`** + Neon Postgres. Vercel env:
  `DATABASE_URL` (pooled), `AUTH_SECRET`, `AUTH_TRUST_HOST=true`. `postinstall`
  generates the client. Migrations are **not** run in the Vercel build — run
  `npm --prefix app run db:hosted` from a laptop against the direct URL.
- Attachments live in Postgres, so they survive serverless hosting.

## 10. Legacy / dormant code

- `.dark` token blocks, `--pf-*` night values — dormant (no theme toggle).
- `Task` / `Link` models + actions — no UI (routes are Coming Soon).
- `TicketStatus` legacy enum values — kept for historical rows; normalised on read.
