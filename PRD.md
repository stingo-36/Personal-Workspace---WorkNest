# PRD — WorkNest

> **What we're building.** Keep this file true to the code. When a feature ships,
> changes scope, or is retired, update the matching section here (see
> `AGENTS.md → Keeping the docs current`).
>
> Last synced with the codebase: **2026-10-04**

---

## 1. One-line pitch

WorkNest is a private, single-user workspace for a software professional's working
day: daily work logs, ticket history, follow-ups, notes and a resource library —
recorded as it happens so the record can answer *"what did I do, when, and in what
order?"* months later.

> Naming: the product was called **Personal Workspace** until the rebrand. The repo
> folder, the Docker container (`workspace-db`) and root `package.json` still use the
> old name. The UI, metadata and homepage say **WorkNest**.

## 2. Users & situation

- **Who:** one working software professional (the author) who is accountable ticket by
  ticket and day by day — stand-ups, sprint reviews, one-to-ones — and is regularly
  asked *"what happened with ASU-1234?"*.
- **Single-user by construction.** Registration is open, but every row is scoped to a
  `userId`; no user can see another's data. No teams, no sharing, no collaboration.
- **Primary moment:** the end of a working block, with ~90 seconds of willingness to
  write things down. Capture must be cheaper than remembering.
- **Device:** desktop-first, used every working day; must still work down to 360px.

## 3. Product principles

1. **The record is append-only.** Past ticket work and tracker updates are never
   rewritten. Correcting the record means appending a newer, dated entry.
2. **Capture is cheaper than remembering.** Tickets are found or created *inside*
   today's log — no page change, no modal. Autosave everywhere it's safe.
3. **One person's record.** No team, sharing or collaboration language, ever.
4. **Only what exists.** Deferred features and unbuilt routes are never presented as
   available; no invented social proof (users, logos, testimonials, numbers).
5. **Not an admin panel.** Dense and fast, but it should feel like Linear / Notion,
   not a CRUD table.

## 4. Feature inventory (current state)

Status legend: **Live** · **Hidden by setting** · **Coming soon** (authenticated
placeholder page) · **Retired** (redirects).

| Area | Route | Status | Summary |
|---|---|---|---|
| Homepage | `/` | Live (public) | "Next Level" page: serif hero "Keep it all in one place." with four 3D characters on brush strokes; then **Workspace** (`#workspace`, auto-playing tour of Work logs / Tracker / Notes / Resources), **AI summaries** (`#ai-summaries`, notes → summary → 5-15 report, with a 3D character) and **Get started** (`#get-started`, three steps + closing CTA + footer). Desktop scrolls one full-screen section at a time. Login/register use the same style with a 3D character panel. |
| Banner review | `/banner` | **Retired 2026-10-03** | The old "Quiet Studio" homepage review route was removed with its code; the URL now goes to sign-in (signed out) or the 404 page (signed in). |
| Auth | `/login`, `/register` | Live (public) | Email + password. Signed-in visitors are redirected to `/tracker`. |
| Work Logs | `/work-logs`, `/work-logs/[id]`, `/work-logs/[id]/edit` | Live | The core workflow — see §5.1. |
| Tickets | `/tickets` | Live · hidden when *Tickets* is off in Profile | Master-detail ticket manager — see §5.2. |
| Tracker | `/tracker` | Live — **post-login landing page** | To-do · Follow-ups · Notes tabs (`?view=`) — see §5.3. |
| Notes | `/notes`, `/notes/new`, `/notes/[id]`, `/notes/[id]/edit` | Live | Notebooks: note → sections → pages — see §5.4. |
| Resources | `/resources` | Live | Typed personal library — see §5.5. |
| Favourites | `/favourites` | Live | Everything starred in one place — see §5.6. |
| Profile | `/profile` (account menu) | Live | Name, sprint calendar, tickets on/off, AI summary key — see §5.7. |
| Achievements | `/achievements` (account menu) | Live | Certifications/courses/awards timeline with certificates — see §5.8. |
| Reports | `/reports` (account menu) | Live | "5-15 Report" per sprint, ready to paste into a doc — see §5.9. |
| Dashboard | `/dashboard` | **Retired 2026-09-25** | Redirects to `/tracker`. |
| Tasks, Links, Settings | `/tasks`, `/links`, `/settings` | Coming soon | Shared `ComingSoonPage`. `Task`/`Link` tables and actions exist but have no UI. |

Primary nav (in order): Work Logs · Tickets (only if enabled) · Tracker · Notes ·
Resources · Favourites. Account menu: Profile & settings, Reports, Achievements, Log out.

## 5. Features in detail

### 5.1 Work Logs — the core workflow

**The one feature that matters most:** *Work Log → find/create ticket → append work
update.*

- **One log per user per calendar day** (`@@unique([userId, date])`). Opening a day
  creates it if missing.
- **Day type:** `Work`, `Holiday` or `Leave`. Holiday/Leave days account for the day
  without meetings or ticket work; their default titles are "Holiday" / "Leave"
  (a work day defaults to "Daily Work Log"). Auto-generated titles are hidden in the UI.
- **Listing (`/work-logs`):** grouped by **sprint** (from the user's Profile sprint
  calendar), newest first, with gaps kept visible so the schedule stays truthful.
  Weekends excluded. Days off render with a hatched tile. A "create day" tile opens a
  log for any date; an existing log tile opens its read-only timeline.
- **Editor (`/work-logs/[id]/edit`):** a navy hero header (title, day type, save
  status, prev/next log arrows), then sections:
  1. **Meetings** — every new log starts with the user's **Default meetings** list
     (Profile; built-in: *ASU Sync-up*, *Veritech Sync-up*, *Client Sync-up*).
     Additional cards can be added and removed per log.
     Notes are Markdown (TipTap WYSIWYG, saved as Markdown text).
  2. **Tickets** (only when tickets are enabled) — type a key such as `ASU-1234`:
     - exists for this user → attach it, show title, status, recent history;
     - doesn't exist → create inline (key, title, project/site). No modal.
     - Write *work done today* and set the status. This upserts **one**
       `TicketWorkUpdate` for *(ticket, this log)*; the ticket's current status
       follows it.
     - Removing a ticket from a log deletes only that log's update row and recomputes
       the ticket's status from the newest surviving update.
  3. **Work done** — a free Markdown daily summary, independent of tickets.
  3a. **To-dos** (read-only, from the Tracker; editor and detail view) — to-dos
     *completed that day* and to-dos *due by that day but not done by its end*
     (overdue / due that day), in the browser's local day. Links to `/tracker`.
  4. **Attachments** — upload files (≤10 MB each, ≤10 per upload) or add links.
- **Autosave** is debounced, shows a save-status indicator, never toasts, and never
  creates duplicate rows.
- **Detail (`/work-logs/[id]`):** read-only view with a side rail (ticket history in
  its own scroll area), a **Summary** card and **Copy as text** — the whole log as plain text for
  stand-ups, chat or email.
- **Summary (detail page):** generated **once automatically** the first time the log
  is viewed with content in it, then only when the user clicks *Regenerate*. **AI
  only** via **OpenRouter** (free models by default; key from Profile → Account → AI
  summaries card, else the server's `OPENROUTER_API_KEY`). **No code-built fallback:**
  with no key the card says AI isn't set up (link to Profile) and generates nothing; if
  a request fails it shows why (key rejected, rate-limited, no credit, unreachable,
  unusable reply) and keeps any saved summary. Output is **a few bullet points, no
  headings or section labels**. The AI reads tickets (if on), noted meetings,
  Work done, and the Tracker to-dos for that day (completed that day / overdue or not
  done — the same split as the To-dos card, in the browser's local day). The card
  shows the model. Stored on the log (older code-built summaries are hidden); a note appears when the log was edited after the
  summary was generated. Generating doesn't change "Last edited".

### 5.2 Tickets

- Ticket keys are free text in the user's own scheme, **unique per user**, not
  globally. No Jira sync.
- `/tickets` is a master-detail board: search/filter the list, then **explicitly**
  select a ticket (nothing is auto-selected).
- Edit the ticket's current **title**, **status** and **project/site** directly.
- **Standalone updates** written on this page are `TicketHistoryEntry` rows. They can
  be deleted (with confirmation). Work-log updates (`TicketWorkUpdate`) are shown in
  the same newest-first timeline, labelled by source, and can **never** be edited or
  deleted from here.
- A ticket "journey" view accounts for holiday/leave days.
- **Workflow statuses (UI):** In Progress → Sent to QA → Ready for Production →
  Released → Done. Legacy stored values (Open, Blocked, Waiting, Testing, Completed,
  Closed) are normalised into these five.
- **Project / site** lives on the ticket (moved from the work log on 2026-09-25) and
  autocompletes from names already used.
- If *Tickets* is switched off in Profile, the nav item disappears, `/tickets`
  redirects to `/work-logs`, and the editor hides the Tickets section.

### 5.3 Tracker

Redesigned 2026-10-01 as three simple lists, one per tab (`?view=todo|followups|notes`),
using the full page width. To-do has a one-line add row (Enter saves); Follow-ups and
Notes have a form card on the left (Who / Title / message / Where / Nudge on, and
Title / Content) with the list on the right. Each tab has a search box:

| Tab (`EntryKind`) | Is | Dated | Sections |
|---|---|---|---|
| **To-do** (`Task`) | something you owe — tick the circle to finish it | optional due date | Overdue → Today → Upcoming → Someday; **Completed** collapsed |
| **Follow-ups** (`FollowUp`) | something you asked/told a person (required) | optional "nudge on" date | **They replied** (your turn) → **Waiting on them**; **Closed** collapsed |
| **Notes** (`Note`) | something to keep and add updates to over time | never | card grid; **Archived** collapsed |

- **Ideas were merged into Notes** (migration converts every Idea row to a Note).
- Tags show a coloured icon derived from the tag (brand logo when the tag names a
  tool, e.g. `vercel`, `drupal`, `docker`).
- **Notes have tags** (`FollowUp.tags`; lowercase, `#` stripped, spaces → dashes, ≤25).
  Add them in the New note form or in a note's popup (saved on change). Above the
  notes: tag chips (with counts) filter the grid; **Group by tag** shows one section
  per tag (a note with two tags appears in both; *Untagged* last). Clicking a tag on a
  card filters to it. Search also matches `#tag`.
- Long titles are cut to one line (two on note cards) with the full text on hover;
  the popup wraps them.
- **Follow-up state is derived, never stored:** if the newest record is *their* reply
  (`FollowUpUpdate.fromThem`) it shows under *They replied*, otherwise *Waiting on
  them*. Row quick actions: **Got reply** (one click, logs an empty reply) and **Close**.
  Logging a new message of yours moves it back to Waiting. Each row shows the
  newest message body ("You: …" / "<person>: …", two lines) under the title. The add row records the
  first message (with channel) as the first update.
- Any entry can be **starred as Important** (sorts first in its section; shows in
  Favourites). Clicking an entry opens a popup: status, date (editable), Done / Close /
  Archive, star, delete, an add-update form (follow-ups pick "I followed up" or
  "<person> replied" + channel) and the timeline.
- Updates are **append-only** (`note` + channel + `occurredAt`). There is no action to
  edit or delete a single update. A whole entry can be deleted.
- Under the title a **"Needs you" status line** (overdue to-dos, due today, replies
  to answer, people to nudge — each a link to its tab; "all caught up" when empty).
  Overdue, Today and They replied are emphasised lists; the others are quieter.
- Tab badges count open items; a dot on Follow-ups means someone replied. "Today" is
  the browser's local day. People previously used are suggested.

> Naming: the models are still `FollowUp` / `FollowUpUpdate` and the files
> `follow-ups.ts`. The UI and route say **Tracker**.

### 5.4 Notes

- OneNote-shaped notebooks: **Note → Sections → Pages**. Pages are TipTap rich-text
  documents (headings, lists, tables, highlights, alignment, syntax-highlighted code
  blocks).
- Each note has a title, description, an icon (searchable react-icons: Simple Icons,
  Lucide, Font Awesome 6) and an accent colour derived from the icon (brand colour
  when known).
- Favourite notes sort to the top. Deleting moves a note to trash (`deletedAt`);
  notes can be restored.
- **List (`/notes`, redesigned 2026-10-02 — no cards):** header line with real counts
  (notebooks · sections · pages · starred) and *New note*; a search box (title,
  description, section names); then a **library index** — one row per notebook
  (starred first): bare coloured icon, title + one-line description, contents preview
  (first 3 sections, "+N"), size (sections / pages), updated, star. Columns from lg;
  below that a single meta line. The whole row links to the note.
- **Reading a note (`/notes/[id]`, redesigned 2026-10-02):** a documentation-style
  reader. **Everything is open** — every section and page in one continuous column
  (section opener: *Section X of N · N pages* + large title; pages numbered *2.3* with
  large titles). A **sticky bar** under the app header always shows the section you
  are in › the current page (and *Section X of N*), switching as you scroll. At lg+ a
  sticky left sidebar holds the note (icon, title, counts), **every section with all
  its topics listed** (the section name pins while its topics scroll past; the current
  page is highlighted, neutral colours — not the note's accent). **Star / Edit / Trash
  sit in the sticky bar** (lg+). Below lg the note header (with the actions) sits at the
  top and a ☰ button in the bar opens the same contents list. The current page is
  measured from scroll position each frame; clicking a topic smooth-scrolls to land
  under the bar — the scroll follows the heading frame by frame and pages it flies
  past wait to load until it lands, so there is no snap at the end (2026-10-04).
  Level-2 headings inside a page show as tinted bands, so each block of a topic
  (e.g. Definition, Example) is easy to spot.
- **Editing a note:** the *At a glance* outline beside the editor is capped to the
  screen and scrolls on its own; clicking a section/page there smooth-scrolls to it.
  A page's editor mounts only when it comes near the screen (long notebooks stay
  smooth to scroll).

### 5.5 Resources

- A personal library whose **types come from the user's list** (Profile; built-in:
  Website, App, Link, Documentation, Command, Snippet, Reference, Tool, Learning,
  Other). Each type has an **icon**: the one picked in Profile, else one guessed from
  the name ("Github" → GitHub logo, "Commands" → terminal, "Vibe Coding" → sparkles…),
  else a bookmark. Icons render bare (no tile) in the dropdown and on cards. Each
  resource has a title, optional URL, **one Description** box, and tags; *Command* /
  *Snippet* also have the code itself (monospace, with Copy) plus a short description.
  (2026-10-02: the separate "Notes or details" box was removed; old text in it is
  folded into Description when the resource is next edited.)
- Grouped by type and searchable — every word must match title, description, content,
  URL, type or a **tag** (`#` ignored, spaces = dashes, so "vibe coding" finds
  `vibe-coding`) — and each resource can be **favourited**, **edited**
  (pencil on every card/row → the same form, prefilled) or deleted.
- In the add/edit form, **Resource type** is a searchable dropdown (type "doc" →
  Documentation) and **Tags** is a search-as-you-type chip field that suggests tags
  already used (most used first). Enter or a comma adds a new tag; tags are stored
  lowercase without "#", spaces become dashes.

### 5.6 Favourites

Aggregates, with jump links: favourite **notes**, favourite **resources**, and
**Important** (pinned, open) **tracker** entries.

### 5.7 Profile

- Display name (email is read-only).
- **Sprint calendar:** start date and length (1, 2, 3 or 4 weeks) with a live preview
  of the current sprint. Default: 14-day sprints anchored on 2 Sep 2026.
- **Tickets on/off:** whether ticket tracking exists for this user (see §5.2).
- **AI summaries** (a card under Account): the user's own **OpenRouter API key** (checked with OpenRouter on
  save, stored encrypted, never shown again — only its last 4 characters) and an
  optional model list (empty = free Gemma, then any free model). Saves on its own, not via the bar.
  The user's key takes priority over the server's `OPENROUTER_API_KEY`; with neither,
  AI is off and no summaries or reports are generated (§5.1, §5.9). Shows a privacy note about what is sent.
- Layout (redesigned 2026-10-01): header with identity inline; a grouped menu
  (*Settings*: Account (with the AI summaries card), Sprint calendar, Work logs · *Dropdown lists*: Follow-up
  channels, Resource types, Default meetings, Projects / sites · *Tags*: Note tags,
  Resource tags). **Only the chosen section is shown** (`?section=` keeps it on
  refresh). Account/sprint/tickets save together via a bottom bar that appears once
  something changes; menu items with unsaved edits show a dot.
- **Dropdown lists** (save immediately; removing an option never rewrites items
  already using it):
  - *Follow-up channels* (Tracker "Where"), *Resource types*, *Default meetings* —
    add, remove, **drag to reorder** (⋮⋮ handle — mouse or touch; ↑/↓ keys on the
    focused handle), and **Reset** to the built-in list. *Resource types* also have an
    **icon picker** per row and on the add row (the notes icon index: Simple Icons,
    Lucide, Font Awesome); Reset keeps picked icons. Rows show no position numbers.
  - *Projects / sites* — ticket project suggestions = names on tickets + names added
    here; removing one stops suggesting it (tickets keep their project).
- **Tags** — separate *Notes* and *Resources* lists: every tag with its usage count;
  **add** (saved as a suggestion before use), **rename** (applies to every item;
  merges if the new name exists), **delete** (removed from every item, with a
  confirmation stating how many) and **Delete all** (every tag of that list, removed
  from every item, after a confirmation).

### 5.8 Achievements

- Own page `/achievements`, reached from the **account menu** (added 2026-10-01;
  briefly lived inside Profile the same day). Certifications, courses, awards. Each has a title, type (Certification, Course, Award, Hackathon,
  Promotion, Other), status (Completed / In progress), optional *assigned by*, start
  and end dates (the card shows the **inclusive** day count), a description and
  **certificate files** (PDF/image, ≤10 MB each, open inline). Add/edit in a popup —
  files picked there upload when you save; saved files can be removed. Delete asks
  for confirmation and removes the files too.
- Layout: header line with real counts (completed · in progress · total days); a
  **timeline grouped by year** (in-progress group first), a medal per entry on a rail
  (md+; phones get full-width cards). Card = type / status eyebrow, title,
  description, a facts strip (Started · Finished · Duration · Assigned by), and a
  certificate footer row ("View certificate"). Edit/delete show on hover/focus at lg+,
  always on touch widths.

### 5.9 Reports

- `/reports?sprint=YYYY-MM-DD`: pick a sprint (current, plus every earlier sprint with
  logs; each shows its log count and whether a report is saved).
- **Generate report** builds the user's **"5-15 Report"** in their doc format:
  `{Name} 5-15 Report`, `(dd-MM-yyyy to dd-MM-yyyy)`, **Completed This Week** (groups
  titled `Ticket <key> - <title>` or a topic, with full-sentence bullets) and
  **Problems or Blockers**. Source: the sprint's work logs (ticket updates, Work done)
  and to-dos completed / still overdue at sprint end. **No meetings section** — meeting
  notes are only context the AI may fold into related work.
- **AI only** via OpenRouter (same key as summaries). With no key the page says so and
  the Generate button is disabled; if a request fails or the reply ignores the format,
  the reason is shown and nothing is saved (an existing report stays). No code-built
  report; older ones are hidden. Stored per sprint; *Regenerate* replaces it; a note
  appears when a log in the sprint changed after generation.
- A copy bar on the report offers **Copy for Google Docs** (formatted) and **Copy as
  plain text**. The preview and the formatted copy follow the doc's layout: centred bold title with the
  date line, light-blue section bands, bold group titles, bullets. The clipboard gets
  HTML with the doc's own styles (Arial 20/14/15/14/11pt, band `#e6f0fa`) plus a
  plain-text fallback, so a paste into Google Docs matches the existing reports.

## 6. Non-functional requirements

- **User isolation:** every query scoped by `userId` taken from the session, never
  from the client.
- **Security:** bcrypt (cost 12) passwords; constant-time login (dummy-hash compare)
  to prevent email enumeration; Zod validation on every mutation server-side; secrets
  only in env; uploaded files served with `nosniff` and only safe types inline.
- **Responsive:** 360 / 768 / 1024 / 1440. No horizontal page scroll.
- **Accessibility:** visible labels, keyboard operable, focus-visible rings, 3:1
  control boundaries, 4.5:1 text, `prefers-reduced-motion` respected.
- **Theme:** light only (the theme toggle was removed; see `Memory.md`).
- **Hosting:** self-host locally (Docker Postgres) or Vercel + Neon.

## 7. Out of scope (don't build, don't promise)

AI beyond the per-log summary; Jira / GitHub / Slack / Calendar integrations; PDF/Markdown export;
emailed reports; team workspaces; sharing; global search (not built yet);
dark mode (removed).

## 8. Open questions / next candidates

- Should standalone `/tasks` and `/links` be removed now that Tracker tasks and
  Resources cover them?
- Global search across logs, tickets, notes, resources.
