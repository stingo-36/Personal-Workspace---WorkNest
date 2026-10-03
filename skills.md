# Skills — repeatable recipes for WorkNest

> Step-by-step playbooks for the tasks that come up again and again in this codebase.
> Follow the matching recipe instead of improvising, and finish every recipe with
> **Update the docs** (`AGENTS.md` §2). If you find a better way, or a new task
> repeats, add or edit a recipe here.
>
> Last synced with the codebase: **2026-10-03**

## Index

1. [Ship a new feature (end to end)](#1-ship-a-new-feature-end-to-end)
2. [Add a server action](#2-add-a-server-action)
3. [Change the database schema](#3-change-the-database-schema)
4. [Add an authenticated page / nav item](#4-add-an-authenticated-page--nav-item)
5. [Turn a "Coming soon" route into a real feature](#5-turn-a-coming-soon-route-into-a-real-feature)
6. [Add a "favourite" / "important" flag to something](#6-add-a-favourite--important-flag-to-something)
7. [Build UI the WorkNest way](#7-build-ui-the-worknest-way)
8. [Add or change a design token](#8-add-or-change-a-design-token)
9. [Seed data](#9-seed-data)
10. [Run and verify locally](#10-run-and-verify-locally)
11. [Deploy (Vercel + Neon)](#11-deploy-vercel--neon)
12. [Update the docs](#12-update-the-docs)
13. [Claude Code skills worth using here](#13-claude-code-skills-worth-using-here)
---

## 1. Ship a new feature (end to end)

1. Read `PRD.md` (does it fit the principles? is it on the out-of-scope list?) and the
   relevant parts of `Architecture.md` and `Memory.md` (has this been decided before?).
2. **Data:** change the schema if needed → recipe 3.
3. **Server:** add `lib/<area>.ts` functions that take `userId` first → add Zod schemas
   in `lib/validation.ts` → add actions → recipe 2.
4. **UI:** server `page.tsx` loads data (convert `Date`s to ISO strings for client
   components) → client component calls actions → recipe 7. Add a route/nav → recipe 4.
5. **Verify** → recipe 10.
6. **Docs** → recipe 12. A new feature always touches `PRD.md`, `Architecture.md` and
   the `Memory.md` changelog.

## 2. Add a server action

Pattern (copy from `actions/content.ts`):

```ts
"use server";

export async function doThing(input: unknown) {
  const userId = await requireUserId();                 // 1. identity from the session
  const parsed = parseOrFail(doThingSchema, input);     // 2. Zod, from lib/validation.ts
  if (!parsed.ok) return parsed;

  const row = await area.doThing(userId, parsed.data);  // 3. lib fn, userId in every WHERE
  if (!row) return notFound("Thing not found");         //    null = not found / not yours

  revalidatePath("/things");                            // 4. every page that shows it
  return ok(row);                                       // 5. ActionResult<T>
}
```

Checklist:
- Input is `unknown`; never trust an id or `userId` from the client.
- Single-row mutations: `updateMany` / `deleteMany` with `{ id, userId }` and check
  `count`, or `findFirst({ id, userId })` before creating children.
- Revalidate **all** affected paths (e.g. `/favourites` as well as the owning page).
- Client side: branch on `result.ok`; show `result.error.message` via `toast.error`
  (or inline `fields` for forms). Never toast for autosave — use the save-status
  indicator.
- Uploads > 1 MB → a route handler under `app/api/`, not an action.

## 3. Change the database schema

1. Edit `app/prisma/schema.prisma`. New domain models get `userId` +
   `user User @relation(..., onDelete: Cascade)` + a back-relation on `User` +
   indexes led by `userId`. Add `///` doc comments explaining intent.
2. Make changes **additive** where possible: nullable columns or defaults, so existing
   rows stay valid. Keep old enum values if historical rows use them.
3. `npm run db:migrate` (name it in snake_case, e.g. `ticket_project_name`). If data
   must move, hand-edit the generated SQL **before** it's applied (see
   `20260925010000_ticket_project_name` for a copy-then-drop example).
4. The client regenerates automatically; if not, `npm --prefix app exec prisma generate`.
5. Update any `select` constants (`*_SELECT`, `workLogInclude`, …) — and never select
   large blobs in list queries.
6. `npm run typecheck`.
7. Never edit an applied migration. For hosted DBs, see recipe 11.

## 4. Add an authenticated page / nav item

1. Create `app/src/app/(app)/<route>/page.tsx` — a Server Component. It's protected
   automatically (`proxy.ts` + `(app)/layout.tsx`). Use `requireUserId()` for data.
2. `export const metadata = { title: "…" }` (the root template adds "· WorkNest").
3. Start the page with `PageHeader` (title, description, optional action).
4. For the nav, add an entry to `PRIMARY_NAV` in `components/shell/nav-items.ts`
   (Lucide icon). If it depends on a user setting, filter it in `navFor()` and also
   guard the page (see `/tickets` redirect).
5. Detail/edit routes: `[id]` folder; `params` is a Promise in Next 16
   (`const { id } = await params`).
6. Public route? Add it to `PUBLIC_ROUTES` in `lib/auth.config.ts` — only if it shows no
   user data.

## 5. Turn a "Coming soon" route into a real feature

`/tasks`, `/reports`, `/links`, `/settings` render `ComingSoonPage`. `Task` and `Link`
already have models, `lib/content.ts` functions and actions.

1. Confirm with the owner that it's wanted (Tracker tasks and Resources already
   overlap `/tasks` and `/links` — see `PRD.md` §8).
2. Replace the page body; reuse existing actions; add a nav item (recipe 4).
3. Update the homepage/nav only once it's genuinely live ("only what exists").
4. Move the row from "Coming soon" to "Live" in `PRD.md` §4 and add a §5 section.

## 6. Add a "favourite" / "important" flag to something

The established pattern (notes, resources, tracker `pinned`):

1. Schema: `favorite Boolean @default(false)` + `@@index([userId, favorite])` → migrate.
2. Zod schema `{ <thing>Id: idSchema, favorite: z.boolean() }`; action does
   `updateMany({ where: { id, userId }, data: { favorite } })`, revalidates the owning
   page **and** `/favourites`.
3. UI: star toggle button with `aria-pressed` and an `aria-label` naming the item;
   filled `fill-warning text-warning` when on.
4. Add a section to `app/(app)/favourites/page.tsx` (query + jump link + count).

## 7. Build UI the WorkNest way

- Start from primitives in `components/ui/` (`Button`, `Field` + `Input`/`Select`/
  `Textarea`, `Card`, `Modal`, `ConfirmationDialog`, `EmptyState`, `TicketId`,
  `TicketStatusBadge`, `PriorityIndicator`, `ProjectInput`, `TagInput`, `toast`).
- Need a searchable dropdown over a fixed list? Use MUI `Autocomplete` with
  `disableClearable autoHighlight openOnFocus` (see `TypePicker` in
  `resource-library.tsx`). Free-text + suggestions? Follow `TagInput`/`ProjectInput`.
  MUI popups work inside `Modal` automatically — don't add `disablePortal`.
- Add + edit with one form: pass the existing record as an optional prop, prefill
  state from it, and call `update…` vs `create…` on save (see `ResourceComposer`).
- Tokens only: `bg-surface`, `text-text-muted`, `border-border-strong`,
  `text-accent-text`, `bg-card-tint`, `shadow-card`… No raw hex/px.
- Work-log style cards: `.wl-card` + `.wl-card-head`. Ink header: `.wl-hero`.
- Breakpoints `xs md lg xl` only. Mobile-first classes, check 360/768/1024/1440.
- Every control: visible label (`Field`), keyboard reachable, visible focus, 44px
  touch targets on mobile.
- States: empty (`EmptyState` with one action), loading (`loading.tsx` or button
  `loading`), error (`loadError` prop pattern used by Tracker/Resources/Tickets).
- Destructive actions: `ConfirmationDialog` with `destructive`.
- Prefer inline editing over modals; autosave long text with the work-log
  `SaveStatusProvider` pattern.
- Client components get ISO date strings from the server and parse them back.
- Full rules: `Design-System.md` §10.

## 8. Add or change a design token

1. Edit the raw value in `app/src/app/globals.css`: base in `:root`, workspace
   override in `.app-shell` (homepage tokens live in `(marketing)/home.css`).
2. If it's new, map it into Tailwind in the `@theme inline` block so a utility exists
   (`--color-<name>: var(--c-<name>)`).
3. Check contrast: text ≥ 4.5:1, control edges ≥ 3:1 against their real background.
4. MUI colours read CSS tokens; only change `mui-provider.tsx` hexes if the brand
   blue accent (`#4562c9`) or ink (`#2a2c3f`) change — the workspace uses the homepage palette.
5. Update the tables in `Design-System.md`.

## 9. Seed data

| Want | Run (from `app/`) | Effect |
|---|---|---|
| Fresh demo user + ticket history | `npm run db:seed` | creates demo data; password from `SEED_PASSWORD` |
| A realistic current sprint | `npm run db:seed:sprint -- <email>` | **resets that account's content** first |
| A full Tracker | `npm run db:seed:tracker -- <email>` | replaces that account's tracker entries |
| More Tracker data, keeping what's there | `npm run db:seed:tracker -- <email> --append` | adds a second dummy set; deletes nothing |
| Notes + Resources study content | `npm run db:seed:workspace -- <email>` | replaces only its own titled items |
| Achievements | `npm run db:seed:achievements -- <email>` | replaces only its own titled items |

Without an email, scripts target the owner's account (`DEFAULT_EMAIL`). **Ask before
running anything that replaces data.** New seeds: follow `seed-tracker.ts` (dotenv,
`PrismaPg` adapter, target one existing account by email, re-runnable, date data
relative to today), add a `db:seed:<name>` script, document it in
`Architecture.md` §8 and here.

## 10. Run and verify locally

```bash
npm run dev           # setup (idempotent) + Next on http://localhost:3000
```

1. `npm run dev` runs `scripts/setup.mjs` first: env file, deps, Docker Postgres,
   migrations, demo seed on an empty DB. If a step fails it prints the fix. If you
   change what setup must do (new env var, new service), update `scripts/setup.mjs`,
   `app/.env.example` and the README Quick start together, then prove it on a fresh
   copy: rsync the repo (without `node_modules`, `.env`, `.git`, `src/generated`) to a
   scratch dir, point its `docker-compose.yml` at another container name/port, run
   `npm run setup`, sign in, then `docker compose down -v` there.
2. Sign in on `localhost`, not `127.0.0.1` (dev origin is blocked; `localhost` and
   `127.0.0.1` also keep separate cookies).
3. `npm run typecheck && npm run lint`.
4. Open the affected pages in the browser (Claude: the `run` skill or the browser
   preview) at 360/768/1024/1440; check empty/loading/error states and the console.
5. Data rules: confirm rows in `npm run db:studio`.
6. Signed out after changing `AUTH_SECRET`? Expected — the proxy clears the old
   cookie; just sign in again.

## 11. Deploy (Vercel + Neon)

Owner-run; an agent prepares, the owner clicks. Ask before any step that touches a
hosted service.

1. Vercel project → **Root Directory `app`**. Env vars: `DATABASE_URL` (Neon
   **pooled**), `AUTH_SECRET`, `AUTH_TRUST_HOST=true` (values staged in the gitignored
   `app/.env.vercel`).
2. Put the Neon **direct** URL in `app/.env` as `HOSTED_DATABASE_URL`.
3. Apply migrations: `npm --prefix app run db:hosted` (`migrate deploy`).
   `-- --seed` also seeds and **wipes all users** — only on an empty database.
4. Push → Vercel builds (`postinstall` generates the client; build uses `--webpack`).
5. Smoke test: register, open today's log, add a ticket update, upload an attachment.
6. Every schema change after that: run step 3 again **before** the new code goes live.

## 12. Update the docs

After any task, walk the table in `AGENTS.md` §2:

- Feature/route change → `PRD.md` §4 + §5, `Architecture.md` §3.
- Module/action/script change → `Architecture.md`.
- Schema change → `Architecture.md` §5–6.
- Visual change → `Design-System.md`.
- Decision or gotcha → `Memory.md` Decisions / Gotchas.
- **Always** → one line in the `Memory.md` Changelog.
- New repeatable procedure → this file.
- Bump "Last synced" on each file you touched.

## 13. Claude Code skills worth using here

**Project design skills** (installed 2026-09-29 in `.claude/skills/` via
`npx skills add … -a claude-code`; update with `npx skills update -p`):

| Skill | When | Notes |
|---|---|---|
| `redesign-existing-projects` | Improving an existing screen | Scan → diagnose → targeted fix; never rewrite |
| `design-taste-frontend` | Any visual decision | 87 KB — read only §1 dials, §4 directives, §9 AI tells, §11 redesign. App dials: variance 5, motion 4, density 7 |
| `ui-ux-pro-max` | UX/accessibility lookups, pre-delivery checklist | `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux` (local, no network). Ignore its generated fonts/palette — ours are fixed |

Reference guidelines (not installed): Vercel Web Interface Guidelines
(vercel.com/design/guidelines) and Linear's DESIGN.md
(raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/linear.app/DESIGN.md).
The distilled result lives in `Design-System.md` — read that first; open the skills only
for something it doesn't cover.

Other useful built-in / installed skills:

| Skill | When |
|---|---|
| `run` | Launch the app and see a change working |
| `code-review` | Review the current diff before committing |
| `security-review` | Any change touching auth, sessions, uploads or user scoping |
| `simplify` | Tidy a finished change for reuse and clarity |
| `engineering:deploy-checklist` | Before a Vercel deploy with migrations |
| `engineering:debug` | Structured debugging of a reproducible bug |
| `engineering:architecture` | Recording a larger decision (then summarise it in `Memory.md`) |
| `engineering:tech-debt` | Deciding what legacy code (e.g. the dormant dark tokens) to delete |

When a project skill is added or removed under `.claude/skills/`, update the table above.
