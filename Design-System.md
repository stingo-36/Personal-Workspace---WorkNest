# Design System — WorkNest

> **How it looks.** The single source of truth for values is the CSS, not this file:
> `app/src/app/globals.css` (app + auth), `app/src/app/(marketing)/home.css` (homepage)
> and `app/src/app/(auth)/auth-motion.css` (login / register). This file explains the system and the rules. If you change a token,
> update the table here in the same change.
>
> Last synced with the codebase: **2026-10-04**

---

## 1. Three visual worlds

WorkNest deliberately has three scoped palettes. **Never mix them** and never export
one world's variables into another.

| World | Scope (CSS selector) | Where | Tokens |
|---|---|---|---|
| **Workspace** (the product) | `.app-shell` | Every authenticated route | `--c-*` overrides in `globals.css` — values = the homepage palette since 2026-10-03 |
| **Next Level** (homepage) | `.home` | `/` | `--h-*` in `(marketing)/home.css` |
| **Next Level** (sign-in) | `.auth-shell` | `/login`, `/register` | `--a-*`/`--c-*` in `(auth)/auth-motion.css` |

**Light only.** The theme toggle and theme provider were removed; `viewport.colorScheme`
is `light` and `themeColor` is `#ffffff`. The `.dark` / `.dark .app-shell` token blocks
and `--pf-*` night values still exist in the CSS, but **nothing applies the `.dark`
class** — treat them as dormant. Don't build new dark-mode UI unless dark mode is
reintroduced on purpose (and then update this file and `Memory.md`).

## 2. Workspace palette (`.app-shell`) — the homepage palette

Since 2026-10-03 the logged-in app uses **the homepage palette** (replacing
charcoal/teal/navy): ink `#2a2c3f`, muted `#575c72`, page `#f3f5f9`, white cards, and the
homepage tones purple `#9b5cf0`, blue `#7d9cf4`, pink `#f58ea8`, orange `#f8aa4b`, red
`#ec6f6f`. The light tones can't carry text, so text and fills use **deeper shades of the
same hues** (all ≥4.5:1 on white): blue `#4562c9` / `#3d57b6` / `#33499a`, pink `#b8395f`,
red `#c43e3e`, orange `#9a560f`. Tints are ~10% hue on white. **The accent is blue** —
purple was tried first and rejected by the user (2026-10-03); don't reintroduce it.

| Token | Value | Use |
|---|---|---|
| `--c-bg` | `#f3f5f9` | page canvas (homepage page colour) |
| `--c-surface` / `--c-card` | `#ffffff` | inputs, menus, cards |
| `--c-surface-2` | `#eef0f6` | toolbars, insets, hover |
| `--c-surface-3` | `#e4e6ef` | pressed / selected |
| `--c-card-tint` | `#f2f5fe` | blue emphasis card |
| `--c-card-navy` | `#eef1fb` | softer blue emphasis card (name is historical) |
| `--c-text` | `#2a2c3f` | headings, primary values (13.7:1) |
| `--c-text-muted` | `#575c72` | descriptions (6.6:1) |
| `--c-text-subtle` | `#62677d` | sublabels, hints, timestamps (5.6:1) |
| `--c-border` | `#dcdfe8` | decorative card edges, dividers |
| `--c-border-strong` | `#8b90a3` | **functional** control edges (3.2:1) |
| `--c-primary` | `#4562c9` | fills, icons, accents (white 5.5:1) |
| `--c-primary-strong` / `--c-accent-text` | `#3d57b6` | links, small labels (6.5:1) |
| `--c-primary-hover` / `-active` | `#3d57b6` / `#33499a` | states |
| `--c-primary-subtle` | `#e3e9fc` | selected state |
| `--c-ring` | `#5f7de6` | focus ring (homepage blue, a step deeper for 3:1) |
| `--c-sidebar` (+`-2`,`-3`) | `#2a2c3f` / `#34374d` / `#3e4159` | **ink chrome**: primary buttons, work-log hero, dark card heads (like the homepage's dark pills) |
| `--c-sidebar-fg` / `-muted` / `-subtle` | `#fff` / `#d6d7e3` / `#a7a9bd` | text on ink |
| `--c-overlay` | `rgba(42,44,63,.55)` | ink scrim behind dialogs |
| `--c-danger` / `--c-warning` / `--c-info` | `#c43e3e` / `#9a560f` / `#4562c9` | feedback (deepened homepage red / orange / blue); success stays green `#15803d` |

The header re-points the chrome tokens to white: ink text, muted labels, a blue active
underline (`#4562c9`) with **no fill behind the active tab**, hairline `#dcdfe8`. MUI
(`components/ui/mui-provider.tsx`) uses the same blue/ink. Per-icon colours (`--c-ic-*`)
map onto the deepened homepage hues (names kept; green/cyan/violet/teal → blue). The name `--c-sidebar-*` is historical.
### Feedback, status, priority, tracker tones

- **Feedback:** `danger #dc2626`, `success #15803d`, `warning #b45309`, `info #1d4ed8`,
  each with `-fg` and `-subtle`.
- **Ticket status** (`--c-status-{open,progress,blocked,waiting,testing,completed,closed}`
  + `-bg` / `-fg`). The UI shows five workflow stages mapped onto these.
- **Priority** (`--c-priority-{low,medium,high,urgent}` + `-bg`) — shown as dot + label,
  never a pill.
- **Tracker tones** `--c-tk-*` — homepage hues, deepened: `overdue #c43e3e` red, `today
  #4562c9` blue, `upcoming #9a560f` orange, `undated #62677d` muted ink (Someday), `done
  #4562c9`, `waiting #9a560f` orange (follow-up, no reply), `replied #b8395f` pink
  (follow-up, your turn), `on #ffffff`. Ticket statuses are **all the same style** —
  light tint + soft ring + dark label, never solid — told apart by hue: In progress blue,
  Sent to QA orange, Ready for production pink, Released muted ink, Done green (blocked
  red); the timeline's "Open for / Done in" pill matches; priorities low ink · medium blue · high orange · urgent pink.
  **Where a tone may appear:** the small dot in a list's uppercase section heading,
  solid date chips (overdue/today), the dot on the Follow-ups tab, and tinted chips /
  initials avatars (10% fill, text = tone + 20% ink so all tones clear 4.5:1 at 12px).
  List cards stay neutral (white + `--c-border`, `surface-2` heading strip) — no tone
  washes over large areas. The active Tracker tab and an active tag chip are solid ink
  (`bg-sidebar text-sidebar-fg`). The page uses the full shell width like other pages; Notes
  and Follow-ups put a titled form card (sticky from `lg`) beside the list.
- **Note accents** (`lib/note-colors.ts`): brand icons keep their real brand hex — the
  one deliberate exception to "tokens only". Generic icons get a stable colour picked
  from the note id.

## 3. Auth palette (`.auth-shell`)

Auth pages use the homepage palette (ink `#2a2c3f`, muted `#575c72`, page `#f3f5f9`) —
the same colours the workspace now uses. They retain their own motion in
`(auth)/auth-motion.css` and composition in `components/auth/auth-shell.tsx` (login =
"resume your day", register = "create your system" — intentionally different layouts).
The art panel shows the user's 3D character as a transparent cut-out
(`public/home/auth-login.webp`: on a pink bean bag with a laptop, pink brush strokes;
`public/home/auth-register.webp`: pointing at a clipboard, blue–violet brush strokes),
`.auth-hero-person`, sized by viewport height so the page never scrolls. Each panel's tint matches its
render's brush strokes (login: soft pinks; register: soft blue–violets), and the register
figure — cut off at the trousers — fades out at the bottom via `mask-image`.
The homepage keeps its own `--h-*` tokens under `.home`; the workspace re-uses its colours.

## 4. Homepage + sign-in — "Next Level" (since 2026-10-02)

Built from the user's "Take it to the next level" banner. Homepage scoped by `.home`
(`--h-*` in `app/(marketing)/home.css`), login/register by `.auth-shell`
(`app/(auth)/auth-motion.css`), shared art in `app/brand-art.css`.

- Palette: page `#f3f5f9`, ink `#2a2c3f`, muted `#575c72`, white cards with tinted shadows.
  Decorative tones (`.tone-purple|blue|pink|orange` → `--tone`): `#9b5cf0`, `#7d9cf4`,
  `#f58ea8`, `#f8aa4b` (+ red `#ec6f6f`) — shapes, doodles, number badges, never body text.
- Type: **DM Serif Display** 400 + italic (`--font-dm-serif`) for display; Plus Jakarta
  Sans for text. Italic muted `<em>` ends headings.
- **People**: the user's own 3D characters as transparent WebP cut-outs in
  `public/home/` — `hero-1…4` (hero corners, each on a coloured brush stroke),
  `recap-avatar` (recap centre), `auth-login` / `auth-register` (auth panels). Hero
  figures get a small drop shadow; the auth figures none (a shadow plus the register
  mask drew a grey box). The DiceBear avatars were removed 2026-10-03.
- **Hero**: a 2000×1020 stage with `container-type: inline-size`; headline in `cqi`
  (8.6cqi), people/doodles at % positions measured off the banner. Dark word chip with a
  double outline, italic connector, outlined pill CTA, orange ring drawn around the last
  word; the middle row is centred under the title. No intro paragraph. On snapped
  screens the stage is full width × (viewport − header), people are pinned to the corners
  and sized by height, and the headline is `min(8.6cqi, 12.5vh)`. Phone: taller stage
  (375×560), people tuck into the corners.
- **Screens**: on ≥900px wide and ≥560px tall the page snaps one viewport at a time —
  (1) header + hero + lead, (2) Features, (3) AI recap, (4) How it works + closing CTA +
  footer. Spacing inside screens uses `vh` clamps so each fits a ~600px-tall window.
- **Sections**: Features = `feature-showcase.tsx` (tab list with tone-coloured italic
  numbers + a tinted panel showing a live mini preview of the selected area;
  auto-advances every 6s until hover/focus/click; no avatars, no cards); AI recap = notes
  paper → AI summary → 5-15 doc joined by marching dashed arrows; How it works =
  centred steps with tone-filled number badges; closing CTA; footer.
- **Type scale** (ui-ux-pro-max: one modular scale, body 1.6): `--fs-xs 13 · sm 14 ·
  base 16 · md 18 · lg 24 · xl 32 · 2xl clamp(36–48) · 3xl clamp(44–72)`; headings
  `max-inline-size: 18ch` + `text-wrap: balance`. Content width `min(100% − 48px, 1360px)`.
- **Login / register**: one screen, no scrolling, no cards — the form sits on the page
  (sizes in `vh` clamps; empty error slots collapse) and beside it one gradient colour
  panel with the 3D character, a serif line and three plain tone-dot points. Panel hidden
  under 900px (the forms already link to each other).
- Motion (all off under `prefers-reduced-motion`): hero lines rise, people pop then
  float, doodles drift, trails march, the ring draws; every full-screen section replays its
  entrance when you arrive (`ScreenMotion`); the auth character is still.

## 5. Typography

Loaded in `app/src/app/layout.tsx` via `next/font` (self-hosted, no runtime Google calls).

| Face | Variable | Used for |
|---|---|---|
| **Geist** | `--font-geist` → `--font-sans` | All authenticated app UI (since 2026-09-28) |
| **Geist Mono** | `--font-geist-mono` → `--font-mono` | Ticket IDs, timestamps, commands, code (ligatures off) |
| Plus Jakarta Sans (+ italic) | `--font-jakarta` | Homepage, login, register body text |
| DM Serif Display (+ italic) | `--font-dm-serif` | Homepage, login, register display type |

**Type scale** (Tailwind `text-*`, 14px app base):

| Class | Size | Use |
|---|---|---|
| `text-2xs` | 11 | uppercase micro-labels (+0.06em tracking) |
| `text-xs` | 12 | meta, timestamps |
| `text-sm` | 13 | table cells, badges |
| `text-base` | **14** | app default body |
| `text-md` | 15 | long-form prose (work-log notes, descriptions) |
| `text-lg` | 16 | card titles |
| `text-xl` | 18 | h3 |
| `text-2xl` | 20 | h2 |
| `text-3xl` | 24 | h1 / page title |
| `text-4xl` | 30 | large numerals |
| `text-5xl` | 36 | auth only |
| `text-6xl`–`text-9xl` | 44–72 | marketing only |

**Headings (2026-09-29 pass).** Hierarchy comes from weight and colour, not raw scale
(taste skill; Linear headline ≈ 28px/600):

| Role | Class | Weight | Tracking |
|---|---|---|---|
| Page title (h1, `PageHeader` and the work-log/ticket pages) | `text-3xl lg:text-4xl` (24 → 30px) | 600 | `-0.03em` |
| Work-log editor date h1 | `text-2xl md:text-3xl` | 600 | `-0.03em` |
| Section h2 | `text-lg`–`text-xl` | 600 | `-0.02em` (global) |
| h3 | `text-base`–`text-lg` | 600 | `-0.01em` (global) |

No weight 750 anywhere in the app. Page description: `text-base`, muted, `max-w-[65ch]`.

**Heading semantics (2026-10-02 audit).** Every page has exactly one visible `h1`
(`PageHeader`, or the page's own header) and never skips a level. Page header → body
gap is **24px** everywhere (`PageHeader` `mb-6`; pages laid out with `gap-6` pass
`mb-0`). A string page description renders as `<p>`. Note page content is rendered
with its heading tags shifted down so it nests: reader `h4–h6` (topic is `h3`),
editor `h3–h5`; sizes follow `data-level`, not the tag.

**Note reader scale (2026-10-02).** `.note-prose` is sized only from tokens, so a page's
own headings always sit below the reader's titles. Weight 600 throughout.

| Role | Size | Source |
|---|---|---|
| Section title (reader h2) | 24 → 30 (`text-3xl md:text-4xl`) | `NoteReader` |
| Topic / page title (reader h3, number inline) | 20 → 24 (`text-2xl md:text-3xl`) | `NoteReader` |
| In-page h1 | 18 (`--text-xl`) | `.note-prose` |
| In-page h2 | 16 (`--text-lg`), 700, on a tinted band with a 3px left rule — one colour for every block: `--c-status-progress-fg` text, `-bg` band, `--c-status-progress` rule (per-block colours dropped 2026-10-04) | `.note-prose [data-level="2"]` |
| In-page h3 / h4 | 15 (`--text-md`), bold; level 3 is 700 with a `--c-border-strong` line underneath (sub-topic inside a block). Topics in the reader are separated by a 2px `--c-border-strong` rule; `.note-prose hr` matches | `.note-prose` |
| Body | 15 (`--text-md`), line-height 1.75 | `.note-prose` |
| Tables | 14 (`--text-base`) | `.note-prose` |
| Code block | 13 (`--text-sm`), `--font-mono`, line-height 1.7 | `.note-prose pre` |
| Inline code | 0.875em, `--font-mono`, no ligatures (0.9em/600 inside headings) | `.note-prose code` |
Headings `text-wrap: balance`, body `text-wrap: pretty`, numbers `tabular-nums` (all set
globally in the base layer). Use the `…` character, never `...`. Ticket keys always go
through the `TicketId` wrapper (`font-mono text-sm font-medium`).

### Icon colours (2026-10-01, re-toned 2026-10-03)

Every Lucide icon in `.app-shell` has its **own colour by meaning**. One CSS map at the
end of `globals.css` keyed on Lucide's `lucide-<name>` class — no component changes; a
new icon needs a line in the map (else it inherits the text colour). The token names
are historical; the values are the deepened homepage hues (no purple, no teal):

| Token | Hex | Meaning (icons) |
|---|---|---|
| `--c-ic-blue` | `#4562c9` | dates, time, messages (calendar-*, clock, mail, send, message-*) |
| `--c-ic-violet` | `#4562c9` | tickets, boards (ticket, folder-kanban, square-terminal…) |
| `--c-ic-amber` | `#9a560f` | notes, ideas, favourites (file-text, sticky-note, lightbulb, star) |
| `--c-ic-green` | `#4562c9` | done, add (check, list-checks, plus, upload) |
| `--c-ic-red` | `#c43e3e` | delete, alerts, sign out |
| `--c-ic-orange` | `#b8661a` | edit, tools (pencil, highlighter, wrench, briefcase) |
| `--c-ic-cyan` | `#4562c9` | people, places (user*, users, building, plane, globe) |
| `--c-ic-indigo` | `#3a52a8` | links, library, code (link-*, library-big, app-window…) |
| `--c-ic-pink` | `#b8395f` | tags |
| `--c-ic-teal` | `#4562c9` | search, view, copy, lock |
| `--c-ic-slate` | `#575c72` | structural glyphs (chevrons, ×, grip, arrows, editor toolbar) |

All ≥ 4.2:1 on white and `surface-2`. **Exceptions** (icon keeps `currentColor`):
anything inside a solid fill — `.bg-sidebar`, `.wl-hero`, `.bg-primary`, `.bg-danger`,
solid tracker/status chips — and `[role="checkbox"]` ticks (hidden with
`text-transparent` until checked). Inline-styled icons (tag icons, brand logos) keep
their own colour.

### Palette-only pages (2026-10-01)

Every workspace page has **one ink anchor** (the dark `--c-sidebar` chrome) and no
off-palette hues except semantic red/green, orange stars, and real brand logos:

| Page | Ink anchor | Notes |
|---|---|---|
| Nav | — | active link: 600 weight + 3px blue rule, no tinted column |
| Work Logs | "today" panel | unchanged |
| Tickets | list header band + open ticket header band | first ticket opens by default |
| Tracker | active tab, focus lists' toned edge | |
| Notes | stats band (notes · favourites · sections) with the white "New note" CTA | Favourites / All notes groups |
| Resources | selected type (solid ink) + panel header band | every type uses the accent (`TYPE_ACCENT`); icons tell types apart |
| Favourites | summary band of three count tiles (jump links) | |
| Profile | open section header band, active menu item | |

- **Ticket workflow** (`.app-shell` `--c-status-*`): every stage is a light tint + soft
  ring + dark label, told apart by hue — In progress blue, Sent to QA orange, Ready for
  production pink, Released muted ink, Done green (see §2).
- **Fallback accent colours** (`lib/note-colors.ts`, notes and tags without a brand):
  deepened homepage hues (blue / pink / orange / ink), all ≥ 5:1 on white.
- **Tag icons** (`ui/tag-icon.tsx`): derived from the tag text via the Notes icon index
  — alias or exact name only (no prefix matches), brand colour when known, else a
  stable palette shade; otherwise a coloured tag glyph.

### Hierarchy ladder (workspace pages, 2026-10-01)

What the eye should hit, in order — one step per level, never two the same size:

| Level | Role | Style |
|---|---|---|
| 1 | Page title | `PageHeader` h1, 24 → 30px, 600, `text-balance` |
| 2 | **What needs you** | the `PageHeader` description as a status line (e.g. Tracker: "Needs you: 1 overdue · …", links in 600 weight, overdue in `text-danger`) |
| 3 | Section | h2 `text-xl` (18) 600 |
| 4 | Focus list / card title | `text-base` 600, normal case; *focus* lists get a 4px toned left edge |
| 5 | Secondary group | 12px uppercase micro-label on a `surface-2` strip |
| 6 | Meta | `text-xs` muted/subtle |

- **One solid CTA per surface** (ink `primary`). It is **never shown disabled** for
  "empty input" — a greyed CTA reads as broken; an empty submit focuses the field and
  says what's missing. Disable only while saving.
- **Forms are recessed when content is the point** (Tracker composers: `surface-2`,
  no shadow) so the user's items, in white cards, lead.
- **Row controls are full strength** (reversed 2026-10-01 — dimmed controls read as
  disabled and the page felt washed out).
- **One dark anchor per view:** Profile's open section card has an ink header band
  (`bg-sidebar`, white title, `sidebar-muted` description); the active menu item is
  solid ink. Ordered-list rows carry a soft position badge (`bg-surface-3 text-accent-text`, round) and a ⋮⋮ drag handle — a solid badge on every row was too heavy.
- **No icon tile on every card** when a nav rail already shows the icons.
- Separate inline facts with spacing (`gap-x-4`) or chips, not "·" glyphs — glyphs
  dangle where the line wraps.
- Spacing groups: 32px between sections, 16–20px between cards in a section.

## 6. Layout, spacing, radius, elevation

- **Breakpoints — exactly four:** `xs` 360 · `md` 768 · `lg` 1024 · `xl` 1440.
  **`sm:` and `2xl:` do not exist** (reset on purpose).
- **Shell:** top nav bar, **64px at every size, always one line** (no sidebar).
  The bar is **white** (2026-10-03 values): `.app-header` re-points the `--c-sidebar-*`
  tokens locally (fg ink `#2a2c3f`, idle labels muted `#575c72`, hover `#f3f5f9`, accent
  blue `#4562c9`, hairline `#dcdfe8`), so primary buttons elsewhere stay ink. The brand
  tile is blue. The current section is a blue underline with no fill behind it.
  Below `md` sections move into a sheet; `md` shows text-only links with the brand icon
  (brand text hidden to make room); `lg` adds the brand text and account name; `xl`
  adds section icons and the date. Labels are `whitespace-nowrap`. Content capped at
  1360px (`max-w-[85rem]`). Skip-to-content link. No horizontal body scroll — wide
  content scrolls inside itself. Anything sized against the nav (`.tickets-board`
  height, sticky asides at `top-20`) assumes 4rem.
- **Page rhythm:** page title block → 32px (`mb-8`) → content. Sections inside a page
  are separated by 20–24px (`gap-5`/`gap-6`).
- **Spacing:** Tailwind 4px scale. Page padding `px-3 md:px-5 lg:px-8`.
- **Radius:** `xs 3` dots · `sm 4` badges · `md 6` inputs/menu items · `lg 8` panels ·
  `xl 12` dialogs · `2xl 16` max. Buttons and chips are `rounded-full`. Work-log cards
  (`.wl-card`) use 16px.
- **Elevation:** soft ink-tinted shadows `--sh-card`, `--sh-card-hover`, `--sh-button`,
  `--sh-md`, `--sh-lg`, `--sh-focus`. Depth comes from borders + surface ladder first;
  shadows are subtle.

## 7. Motion

**Scroll reveals in the app (2026-10-01).** Add `data-reveal` to a section/card, or
`data-reveal-stagger` to a list (its children cascade, 50ms apart, max 8). Driven by
`components/shell/scroll-reveal.tsx` + the `reveal-*` rules at the end of
`globals.css`: 12px rise, 420ms, `--ease-smooth-out`, `translate` + `animation` (so
hover lifts and colour transitions keep working). Guarantees: content already on
screen at first paint is never hidden; only below-the-fold items wait, once; content
that mounts later (tab switch, section change) cascades in; no-JS and
`prefers-reduced-motion` show everything. Used on: Tracker lists and note grids,
Notes cards and note sections, Resources cards, Favourites lists, Tickets list,
work-log timeline/cards/to-dos, Profile cards and tag rows. Headers keep the
`t-reveal` text reveal. The CSS scroll-timeline `.scroll-reveal` stays **off** in the
app (it stranded content); existing `.scroll-reveal(-item)` markup is driven by the
controller instead.

Tokens in `:root`: `--duration-{stagger 40, micro 80, quick 150, fast 250, medium 350,
slow 400, very-slow 500}ms`, `--ease-smooth-out`, `--ease-bounce`, distance/scale/blur
tokens. Utilities: `.motion-page-enter`, `.motion-stagger`, `.motion-lift`,
`.motion-disclosure-content`, `.scroll-reveal`, `.t-dropdown`, `.t-sheet`.

- Motion dial for the app: **4/10** (standard, not cinematic). State transitions
  150–250ms. Buttons press with `active:scale-[0.98]`.
- Animate `transform` and `opacity` only; list properties explicitly
  (`transition-[transform,opacity]`), never `transition-all`. Moving indicators
  (such as meeting tabs) position with `translate3d`, not `left/top`.
- Navigation never animates in.
- `prefers-reduced-motion` disables all of it.
- Homepage scrolling moves **one section per scroll** on desktop (≥900×560): native CSS
  `scroll-snap-type: y mandatory` + `scroll-snap-stop: always` — no JS paging (it made you
  wait). Phones scroll freely; nav links smooth-scroll. Looping decoration pauses on screens
  that aren't active, and animated art is `will-change`-promoted.
- Homepage: CSS keyframes for the hero; `ScreenMotion` (`components/home/screen-motion.tsx`)
  replays each snapped screen's `[data-anim]` entrance on every arrival, from either
  direction. Content is visible without JS; hiding is armed only after on-screen sections
  are marked active, so nothing on screen flashes out.

## 8. Components

All under `app/src/components/`. Use these before writing new markup.

### Primitives — `ui/`
| Component | Notes |
|---|---|
| `Button`, `buttonVariants` | cva. Variants: `primary` (ink), `subtle`, `secondary`, `outline`, `ghost`, `danger`. Sizes `xs 28` / `sm 32` / `md 36` (default) / `lg 40`. Props `iconOnly`, `block`, `loading`. Rounded-full. |
| `Input`, `Select`, `Textarea` | MUI-backed fields (see §9). Never re-patch borders at call sites. |
| `Field`, `FormError` | Visible label + control + error/hint wired with ids. Never placeholder-only labels. |
| `Badge`, `TicketId` | Generic badge; `TicketId` is mandatory for ticket keys. |
| `TicketStatusBadge`, `TICKET_STATUS_DOT` | Status colours + labels + order (all tinted badges). |
| `ProjectInput` | MUI Autocomplete (freeSolo) of the user's project names; loads on open, no module cache. |
| `TagInput`, `normalizeTag` | MUI Autocomplete (multiple + freeSolo) chip field over existing tags. Click or ↓+Enter picks a suggestion; Enter/comma adds typed text; blur keeps typed text. Tags normalised (lowercase, no `#`, spaces → `-`), max 25. No `autoHighlight` — in MUI 9 freeSolo, Enter commits typed text, so a pre-highlight would mislead. |
| `Modal` | Native `<dialog>`: header (eyebrow + title + close), scrolling body, optional footer; `md`/`lg`. Backdrop close only when the press **and** the click are both on the backdrop. |
| `ConfirmationDialog` | Native `<dialog>`; `destructive` uses the danger button; async `onConfirm`. |
| `EmptyState` | Muted icon, one line, one action. |
| `Toaster`, `toast` | sonner, bottom-right, max 2. Import `toast` from here, never from sonner. **Not for autosave.** |

### Shell — `shell/`
`AppShell`, `AppNav` (white bar + blue active underline + mobile sheet + account menu), `nav-items.ts`
(`PRIMARY_NAV`, `navFor(ticketsEnabled)`, `isActivePath`), `Menu` (doesn't close on a
submit button, so form actions still fire), `PageHeader`, `ComingSoonPage`.

### Feature components
`work-log/*` (editor, sections, ticket search/card/history, save status, attachments,
learning, day type/stamp, copy button), `tickets/ticket-board`, `tracker/tracker-board`
(all per-kind wording lives in `KIND_META`), `notes/*` (TipTap editors, icon picker,
viewer, TOC), `resources/resource-library`, `profile/profile-form`, `auth/*`,
`home/*` (homepage).

### CSS recipes in `globals.css`
`.wl-card` / `.wl-card-head` (work-log card), `.wl-hero` (ink header that re-points
tokens so normal components render light-on-ink; `.wl-solid` / `.wl-field` reset to
light inside it), `.wl-inset`, `.wl-off` (hatched holiday/leave tile), `.wl-scroll`
(slim scrollbar), `.worklog-prose` (Markdown fields, 15px), `.note-prose` /
`.note-editor-body` (Notes editor), `.tickets-board` (fits the viewport at `lg`).

## 9. MUI inside Tailwind

Form fields use MUI (`@mui/material` 9) via `components/ui/mui-provider.tsx`, mounted
in the `(app)` layout only.

- `@layer theme, base, mui, components, utilities;` — MUI lives in `@layer mui`
  (`enableCssLayer`), so Tailwind utilities passed through `className` win.
- MUI's palette holds concrete hexes (it computes alphas); every visible colour in the
  overrides reads CSS tokens.
- **Popups inside dialogs:** MUI portals menus/listboxes to `<body>`, which sits
  *below* a native modal `<dialog>` (top layer). The theme's `MuiPopper` /
  `MuiPopover` defaults portal into the open `dialog:modal` instead (else into
  `.app-shell`, so popups inherit the workspace tokens; else `<body>`),
  and Poppers use `strategy: "fixed"` so the dialog's `overflow: hidden` can't clip
  them. Any MUI field works inside `Modal` with no extra props.
- MUI draws its own 2px blue focus border, so the global outline is suppressed on
  `.MuiInputBase-input`, `.MuiSelect-select`, `.MuiAutocomplete-input`.
- Deliberately *not* MUI: tiny inline micro-controls (e.g. the Notes move-to-section
  pill, code-block language chip).

## 10. Rules (non-negotiable)

1. **Tokens only.** No raw hex, px font sizes or ad-hoc shadows in components. The
   only exception is brand colours in `lib/note-colors.ts`.
1a. **One accent for UI chrome** (buttons = ink; links, focus, selection = blue).
   Coding colour is allowed where it helps scanning: status, priority, Tracker date
   groups, feedback, note brand colours, and **Resources types** — each of the 10 types
   keeps its own hue (`TYPE_COLOR` in `resource-library.tsx`: Documentation `#2563EB`,
   Learning `#16A34A`, Reference `#D97706`, Tool `#0D9488`, Website `#0284C7`, App
   `#7C3AED`, Link `#DB2777`, Command `#EA580C`, Snippet `#4F46E5`, Other `#284B63`).
   The owner chose these over a single accent (2026-09-29) — don't flatten them.
2. `--c-primary` is for large text, icons and fills; normal-size text uses
   `primary-strong` / `accent-text`.
3. Control edges use `border-border-strong` (≥3:1, WCAG 1.4.11); `border-border` is
   decorative only.
4. Focus is always visible: 2px `--c-ring`, 2px offset. The ring never changes a
   control's `border-radius`.
5. Icons: **Lucide** in the app (`iconLibrary: "lucide"`), react-icons for note icons
   only.
6. Minimal modals. Prefer inline creation (tickets are created inside the log).
7. Nothing implies history can be rewritten: no edit/delete affordance on
   `TicketWorkUpdate` or `FollowUpUpdate` rows.
8. Check every new screen at 375, 768, 1024 and 1440 — nav on one line, no clipped
   labels, no horizontal scroll.
9. Destructive confirmations use `ConfirmationDialog` (or an Undo), never
   `window.confirm` / `alert`.
10. Only `xs md lg xl` breakpoints exist — an `sm:` class silently does nothing.

### Sources

Rules above were checked against (2026-09-29): the **redesign-existing-projects** and
**design-taste-frontend** skills (taste-skill), **ui-ux-pro-max** (pre-delivery
checklist; its generated font/pattern suggestions didn't fit a dense app and were not
used), **Vercel Web Interface Guidelines** (vercel.com/design/guidelines) and the
**Linear** DESIGN.md from awesome-design-md (type scale, 64–72px nav, 4px spacing).
Palette and fonts are unchanged.
