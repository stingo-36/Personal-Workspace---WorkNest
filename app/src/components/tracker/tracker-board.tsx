"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CornerDownLeft,
  Hourglass,
  ListTodo,
  MessageSquare,
  MessageSquareReply,
  Plus,
  RotateCcw,
  Send,
  Star,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { createContext, useContext, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

import {
  addFollowUpUpdate,
  createFollowUp,
  deleteFollowUp,
  rescheduleFollowUp,
  setFollowUpPinned,
  setFollowUpStatus,
  setFollowUpTags,
} from "@/actions/follow-ups";
import { cn } from "@/components/cn";
import { PageBand, bandField } from "@/components/shell/page-band";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TagIcon } from "@/components/ui/tag-icon";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type {
  EntryKind,
  FollowUpStatus,
} from "@/generated/prisma/enums";

type TrackerUpdate = {
  id: string;
  note: string;
  /** Free text from the user's channel list (Profile). */
  channel: string;
  occurredAt: string;
  /** Their reply, not something you said. Only meaningful on a follow-up. */
  fromThem: boolean;
  createdAt: string;
};

export type TrackerEntry = {
  id: string;
  kind: EntryKind;
  /** Only a follow-up is addressed to someone; to-dos and notes are yours. */
  person: string | null;
  subject: string;
  ticketKey: string | null;
  status: FollowUpStatus;
  /** Flagged important — sorts first. */
  pinned: boolean;
  /** Lowercase labels; only notes use them. */
  tags: string[];
  /** "YYYY-MM-DD" or null. A plain calendar day — no time, no timezone. */
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Newest first. */
  updates: TrackerUpdate[];
};

/**
 * The board is three plain lists, one per tab. Each kind has one job:
 *   to-do      something you owe — tick it off
 *   follow-up  something you told someone — waiting on them, or they replied
 *   note       something to keep — add updates to it over time
 */
export type TrackerView = "todo" | "followups" | "notes";

const VIEWS: Array<{ id: TrackerView; kind: EntryKind; label: string; Icon: typeof ListTodo }> = [
  { id: "todo", kind: "Task", label: "To-do", Icon: ListTodo },
  { id: "followups", kind: "FollowUp", label: "Follow-ups", Icon: MessageSquare },
  { id: "notes", kind: "Note", label: "Notes", Icon: StickyNote },
];

const VIEW_OF: Record<EntryKind, TrackerView> = { Task: "todo", FollowUp: "followups", Note: "notes" };

const KIND_LABEL: Record<EntryKind, string> = { Task: "To-do", FollowUp: "Follow-up", Note: "Note" };

/**
 * The user's lists from Profile, read deep in the tree (add forms, popups)
 * without threading props through every view.
 */
const ListsContext = createContext<{ channels: string[]; noteTags: string[] }>({ channels: [], noteTags: [] });

/** The channel dropdown: the user's list, plus the current value if it's since been removed. */
function ChannelSelect({ id, value, onChange, className }: { id: string; value: string; onChange: (value: string) => void; className?: string }) {
  const { channels } = useContext(ListsContext);
  const options = value && !channels.includes(value) ? [...channels, value] : channels;
  return (
    <Select id={id} value={value} className={className} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </Select>
  );
}

/** Sets `--tone` for the tinted recipes below (tokens in globals.css). */
function tone(value: string) {
  return { "--tone": value } as React.CSSProperties;
}

/**
 * Tinted chip in one tone: a faint fill, no outline, so it stays quiet. The text
 * is the tone deepened with 20% ink so every tone clears 4.5:1 at 12px.
 */
const TINT_CHIP = "bg-[color-mix(in_srgb,var(--tone)_10%,var(--c-surface))] text-[color-mix(in_srgb,var(--tone)_80%,var(--c-text))]";

function todayIso() {
  // Local calendar day, not UTC: "today" means the user's today.
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** The clock never notifies us; a re-render is close enough for a date. */
function subscribeNever() {
  return () => {};
}

/**
 * From lg the opened entry shows in the right-hand panel; below that it opens
 * as a dialog (the panel would sit under a long list on a phone).
 */
const WIDE = "(min-width: 64rem)";
function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** "today", "yesterday", "3d ago", or a date once it's more than a week old. */
function ago(iso: string, today: string) {
  const days = differenceInCalendarDays(parseISO(today), parseISO(iso));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return format(parseISO(iso), "d MMM");
}

/** Run a server action, toast the outcome, refresh the board. */
function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<{ ok: boolean; error?: { message: string } }>, success?: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error?.message ?? "Something went wrong");
        return;
      }
      if (success) toast.success(success);
      after?.();
      router.refresh();
    });
  }
  return { run, pending };
}

// --- follow-up state ---------------------------------------------------------

type FollowState = "replied" | "waiting" | "closed";

/** Derived from the record, never stored: whoever spoke last decides it. */
function followStateOf(entry: TrackerEntry): FollowState {
  if (entry.status === "Done") return "closed";
  return entry.updates[0]?.fromThem ? "replied" : "waiting";
}

const FOLLOW_STATE: Record<FollowState, { label: string; hint: string; Icon: typeof MessageSquare; tone: string }> = {
  replied: { label: "They replied", hint: "Your turn", Icon: MessageSquareReply, tone: "var(--c-tk-replied)" },
  waiting: { label: "Waiting on them", hint: "No reply yet", Icon: Hourglass, tone: "var(--c-tk-waiting)" },
  closed: { label: "Closed", hint: "Wrapped up", Icon: Check, tone: "var(--c-tk-done)" },
};

// --- to-do sections ----------------------------------------------------------

type TodoSection = "overdue" | "today" | "upcoming" | "someday";

const TODO_SECTIONS: Record<TodoSection, { label: string; tone: string }> = {
  overdue: { label: "Overdue", tone: "var(--c-tk-overdue)" },
  today: { label: "Today", tone: "var(--c-tk-today)" },
  upcoming: { label: "Upcoming", tone: "var(--c-tk-upcoming)" },
  someday: { label: "Someday", tone: "var(--c-tk-undated)" },
};

function todoSectionOf(entry: TrackerEntry, today: string): TodoSection {
  if (!entry.dueDate) return "someday";
  if (entry.dueDate < today) return "overdue";
  if (entry.dueDate === today) return "today";
  return "upcoming";
}

const important = (a: TrackerEntry, b: TrackerEntry) => Number(b.pinned) - Number(a.pinned);
const byRecent = (a: TrackerEntry, b: TrackerEntry) => important(a, b) || b.updatedAt.localeCompare(a.updatedAt);
const byDue = (a: TrackerEntry, b: TrackerEntry) => important(a, b) || (a.dueDate ?? "").localeCompare(b.dueDate ?? "") || byRecent(a, b);
const byCompleted = (a: TrackerEntry, b: TrackerEntry) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt);

function matches(entry: TrackerEntry, needle: string) {
  if (!needle) return true;
  return [entry.subject, entry.person, entry.ticketKey, ...entry.tags.map((tag) => `#${tag}`), ...entry.updates.map((u) => u.note)].join(" ").toLowerCase().includes(needle);
}

// --- board -------------------------------------------------------------------

/**
 * Layout (2026-10-09 rebuild, matching Work Logs and Tickets): the slate band
 * carries the title, the three tabs and search; below it a list panel on the
 * left and a detail panel on the right. The right panel shows "Needs you"
 * until something is opened (or a new follow-up / note is being written).
 * Viewport-fit from lg via `.wl-fit`. No shadows or tinted boxes — borders only.
 */
export function TrackerBoard({
  entries,
  people,
  channels,
  savedNoteTags,
  serverToday,
  initialView,
  loadError,
}: {
  entries: TrackerEntry[];
  people: string[];
  /** Profile → Dropdown lists → Follow-up channels. */
  channels: string[];
  /** Profile → Tags → Notes: tags saved ahead of use. */
  savedNoteTags: string[];
  serverToday: string;
  initialView: TrackerView;
  loadError?: string;
}) {
  const [view, setView] = useState<TrackerView>(initialView);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const today = useSyncExternalStore(subscribeNever, todayIso, () => serverToday);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
  const needle = query.trim().toLowerCase();

  const byKind = useMemo(() => {
    const next: Record<EntryKind, TrackerEntry[]> = { Task: [], FollowUp: [], Note: [] };
    for (const entry of entries) next[entry.kind].push(entry);
    return next;
  }, [entries]);

  // Tab badges: what still needs you, not the grand total.
  const badge: Record<TrackerView, number> = {
    todo: byKind.Task.filter((e) => e.status !== "Done").length,
    followups: byKind.FollowUp.filter((e) => e.status !== "Done").length,
    notes: byKind.Note.filter((e) => e.status !== "Done").length,
  };
  const repliedCount = byKind.FollowUp.filter((e) => followStateOf(e) === "replied").length;
  const opened = entries.find((entry) => entry.id === openId) ?? null;
  const lists = useMemo(() => ({ channels, noteTags: savedNoteTags }), [channels, savedNoteTags]);
  const tagSuggestions = mergeTags(noteTags(byKind.Note).map(([tag]) => tag), savedNoteTags);
  // To-dos are added inline at the top of the list; the other two get a form.
  const canCompose = composing && view !== "todo";

  function choose(next: TrackerView) {
    setView(next);
    setQuery("");
    setOpenId(null);
    setComposing(false);
    // Shallow URL update so a refresh or a link lands on the same tab, without
    // a server round-trip on every switch.
    window.history.replaceState(null, "", next === "todo" ? "/tracker" : `/tracker?view=${next}`);
  }

  /** Open from anywhere (e.g. Needs you): jump to the entry's own tab so its row is highlighted. */
  function openEntry(entry: TrackerEntry) {
    if (VIEW_OF[entry.kind] !== view) choose(VIEW_OF[entry.kind]);
    setComposing(false);
    setOpenId(entry.id);
  }

  function startComposing() {
    setOpenId(null);
    setComposing(true);
  }

  function onTabKey(event: React.KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = VIEWS.findIndex((v) => v.id === view);
    const next = VIEWS[(index + (event.key === "ArrowRight" ? 1 : VIEWS.length - 1)) % VIEWS.length];
    choose(next.id);
    document.getElementById(`tracker-tab-${next.id}`)?.focus();
  }

  const composerTitle = view === "followups" ? "New follow-up" : "New note";
  const composer = view === "followups" ? <AddFollowUp people={people} onSaved={() => setComposing(false)} /> : <AddNote suggestions={tagSuggestions} onSaved={() => setComposing(false)} />;

  return (
    <ListsContext.Provider value={lists}>
    <div className="wl-fit flex w-full min-w-0 flex-col gap-5">
      <PageBand
        title="Tracker"
        eyebrow="To-dos, follow-ups and notes in one place"
        actions={
          <>
            <label htmlFor="tracker-search" className="sr-only">Search this list</label>
            <input id="tracker-search" type="search" value={query} placeholder="Search, or #tag" onChange={(event) => setQuery(event.target.value)} className={cn(bandField, "w-full lg:w-72")} />
          </>
        }
      >
        {/* The tabs are nav-style pills on the band: white when active, outlined when idle. */}
        <div role="tablist" aria-label="Tracker lists" onKeyDown={onTabKey} className="mt-3.5 flex flex-wrap gap-2">
          {VIEWS.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                id={`tracker-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="tracker-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => choose(item.id)}
                className={cn(
                  "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-fg",
                  active ? "border-transparent bg-sidebar-accent-bg text-sidebar-accent" : "border-sidebar-border text-sidebar-muted hover:bg-sidebar-2 hover:text-sidebar-fg",
                )}
              >
                <item.Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-sidebar text-sidebar-fg" : "bg-sidebar-2 text-sidebar-fg")}>{badge[item.id]}</span>
                {item.id === "followups" && repliedCount > 0 ? (
                  <span style={tone(FOLLOW_STATE.replied.tone)} className="size-2 rounded-full bg-[var(--tone)]" aria-label={`${repliedCount} replied`} />
                ) : null}
              </button>
            );
          })}
        </div>
      </PageBand>

      {loadError ? <FormError>{loadError}</FormError> : null}

      <div className="grid items-start gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        <section
          id="tracker-panel"
          role="tabpanel"
          aria-labelledby={`tracker-tab-${view}`}
          className="wl-scroll flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface lg:h-full lg:overflow-y-auto"
        >
          {view === "todo" ? <TodoList entries={byKind.Task} today={today} needle={needle} openId={openId} onOpen={openEntry} /> : null}
          {view === "followups" ? <FollowUpList entries={byKind.FollowUp} today={today} needle={needle} openId={openId} composing={canCompose} onCompose={startComposing} onOpen={openEntry} /> : null}
          {view === "notes" ? <NoteList entries={byKind.Note} today={today} needle={needle} openId={openId} composing={canCompose} onCompose={startComposing} onOpen={openEntry} /> : null}
        </section>

        <section
          aria-label={canCompose && wide ? composerTitle : opened && wide ? opened.subject : "Needs you"}
          className="order-first flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface lg:order-none lg:h-full"
        >
          {wide && canCompose ? (
            <>
              <PanelHead eyebrow={view === "followups" ? "Follow-up" : "Note"} title={composerTitle} onClose={() => setComposing(false)} />
              <PanelBody>{composer}</PanelBody>
            </>
          ) : wide && opened ? (
            <EntryPanel key={opened.id} entry={opened} tagSuggestions={tagSuggestions} onClose={() => setOpenId(null)} />
          ) : (
            <NeedsYou entries={entries} today={today} onOpen={openEntry} onShowAll={choose} />
          )}
        </section>
      </div>

      {!wide && canCompose ? (
        <Modal open size="lg" onClose={() => setComposing(false)} title={composerTitle}>{composer}</Modal>
      ) : null}
      {!wide && opened ? (
        <Modal open size="lg" onClose={() => setOpenId(null)} eyebrow={<EntryEyebrow entry={opened} />} title={<EntryTitle entry={opened} />}>
          <EntryBody key={opened.id} entry={opened} tagSuggestions={tagSuggestions} onDeleted={() => setOpenId(null)} />
        </Modal>
      ) : null}
    </div>
    </ListsContext.Provider>
  );
}

// --- panel parts -------------------------------------------------------------

/** The right panel's header: eyebrow, big title, optional close back to Needs you. */
function PanelHead({ eyebrow, title, onClose }: { eyebrow: React.ReactNode; title: React.ReactNode; onClose?: () => void }) {
  return (
    <header className="flex shrink-0 items-start gap-4 border-b border-border px-5 py-4 md:px-7">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm text-text-subtle">{eyebrow}</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-text [overflow-wrap:anywhere]">{title}</h2>
      </div>
      {onClose ? (
        <Button size="sm" variant="ghost" iconOnly aria-label="Close" title="Close" onClick={onClose} className="mt-1 shrink-0">
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </header>
  );
}

function PanelBody({ children }: { children: React.ReactNode }) {
  return <div className="wl-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7">{children}</div>;
}

/** A small uppercase group label inside the list panel, sticky while its rows scroll. */
function Group({ label, count, toneValue, children }: { label: string; count: number; toneValue?: string; children: React.ReactNode }) {
  return (
    <section aria-label={label}>
      <h3 style={toneValue ? tone(toneValue) : undefined} className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-surface px-4 py-2 text-2xs font-semibold tracking-[0.08em] text-text-subtle uppercase">
        {toneValue ? <span className="size-2 rounded-full bg-[var(--tone)]" aria-hidden="true" /> : null}
        {label}
        <span className="tabular-nums">{count}</span>
      </h3>
      <ul>{children}</ul>
    </section>
  );
}

/**
 * One list row. The title button covers the whole row (its ::after), so `lead`
 * and `trailing` controls sit above it with `relative z-10`.
 */
function Row({ selected = false, muted = false, title, lead, meta, trailing, onOpen }: { selected?: boolean; muted?: boolean; title: string; lead?: React.ReactNode; meta?: React.ReactNode; trailing?: React.ReactNode; onOpen: () => void }) {
  return (
    <li className={cn("relative flex items-start gap-3 border-b border-border px-4 py-3 transition-colors duration-150 last:border-b-0", selected ? "bg-primary-subtle" : "hover:bg-surface-2")}>
      {lead ? <span className="relative z-10 flex shrink-0 pt-0.5">{lead}</span> : null}
      <button type="button" onClick={onOpen} aria-current={selected ? "true" : undefined} title={title} className="min-w-0 flex-1 cursor-pointer text-left after:absolute after:inset-0">
        <span className={cn("line-clamp-2 text-sm font-semibold leading-snug [overflow-wrap:anywhere]", muted ? "text-text-subtle line-through" : "text-text")}>{title}</span>
        {meta ? <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-subtle">{meta}</span> : null}
      </button>
      {trailing ? <span className="relative z-10 flex shrink-0 items-center gap-1.5 pt-0.5">{trailing}</span> : null}
    </li>
  );
}

/** "Completed · 4" — collapsed at the foot of the list panel. */
function Collapsed({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <details className="group/done border-t border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-accent-text hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 -rotate-90 transition-transform duration-150 group-open/done:rotate-0 motion-reduce:transition-none" aria-hidden="true" />
        {label}
        <span className="rounded-full bg-sidebar px-2 py-0.5 text-xs text-sidebar-fg tabular-nums">{count}</span>
      </summary>
      <ul className="border-t border-border">{children}</ul>
    </details>
  );
}

function Empty({ icon: Icon, title, text }: { icon: typeof ListTodo; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <Icon className="size-6 text-text-subtle" aria-hidden="true" />
      <p className="text-md font-semibold text-text">{title}</p>
      <p className="max-w-[40ch] text-sm text-text-muted">{text}</p>
    </div>
  );
}

/** The slate "New …" button at the top of the follow-ups and notes lists. */
function ComposeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div className="border-b border-border p-4">
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          active ? "border border-sidebar bg-surface text-text" : "bg-sidebar text-sidebar-fg hover:bg-sidebar-3",
        )}
      >
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </button>
    </div>
  );
}

/** The date as a chip: solid red when late, solid blue for today, tinted otherwise. */
function DueChip({ entry, today, prefix }: { entry: TrackerEntry; today: string; prefix?: string }) {
  if (!entry.dueDate || entry.status === "Done") return null;
  const late = entry.dueDate < today;
  const isToday = entry.dueDate === today;
  return (
    <span
      style={tone("var(--c-tk-upcoming)")}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-bold tabular-nums",
        late ? "bg-tk-overdue text-tk-on" : isToday ? "bg-tk-today text-tk-on" : TINT_CHIP,
      )}
    >
      {late ? <CircleAlert className="size-3.5" aria-hidden="true" /> : <CalendarDays className="size-3.5" aria-hidden="true" />}
      {prefix ? `${prefix} ` : ""}
      {isToday ? "today" : format(parseISO(entry.dueDate), "EEE d MMM")}
    </span>
  );
}

function PinnedStar() {
  return <Star className="size-3.5 shrink-0 fill-current text-warning" aria-label="Important" />;
}

function NotesCount({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1" title={`${count} ${count === 1 ? "note" : "notes"}`}>
      <StickyNote className="size-3.5" aria-hidden="true" />
      {count}
    </span>
  );
}

function Avatar({ name, toneValue }: { name: string; toneValue: string }) {
  return (
    <span style={tone(toneValue)} className={cn("grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold", TINT_CHIP)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** A round checkbox that ticks an entry off without opening it. */
function DoneToggle({ entry, label }: { entry: TrackerEntry; label?: string }) {
  const { run, pending } = useRun();
  const done = entry.status === "Done";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label ?? (done ? `Reopen ${entry.subject}` : `Mark ${entry.subject} done`)}
      title={done ? "Reopen" : "Mark done"}
      disabled={pending}
      onClick={() => run(() => setFollowUpStatus({ followUpId: entry.id, status: done ? "Open" : "Done" }), done ? "Reopened" : "Done")}
      className={cn(
        "grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-colors duration-150 disabled:cursor-wait disabled:opacity-60",
        done ? "border-primary bg-primary text-primary-fg" : "border-border-strong bg-surface text-transparent hover:border-primary hover:text-primary",
      )}
    >
      <Check className="size-3" strokeWidth={3} aria-hidden="true" />
    </button>
  );
}

/** The ★ toggle used in every add form. */
function StarToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={value}
      aria-label="Mark important"
      title="Mark important"
      onClick={() => onChange(!value)}
      className={cn("grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg border transition-colors duration-150", value ? "border-warning text-warning" : "border-border text-text-subtle hover:border-border-strong hover:text-text")}
    >
      <Star className={cn("size-4", value && "fill-current")} aria-hidden="true" />
    </button>
  );
}

/** Create an entry, then pin it if asked. Shared by the three add forms. */
function useCreate(onSaved: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  function create(
    input: { kind: EntryKind; subject: string; person?: string; note?: string; channel?: string; dueDate?: string | null; tags?: string[] },
    pinned: boolean,
  ) {
    startTransition(async () => {
      const result = await createFollowUp(input);
      if (!result.ok) {
        const fields = result.error.fields ?? {};
        setError(Object.values(fields)[0] ?? result.error.message);
        return;
      }
      if (pinned) await setFollowUpPinned({ followUpId: result.data.id, pinned: true });
      toast.success(`${KIND_LABEL[input.kind]} added`);
      setError(undefined);
      onSaved();
      router.refresh();
    });
  }
  return { create, pending, error, setError };
}

// --- needs you (the right panel's default) ----------------------------------

/**
 * What to act on now: overdue/today to-dos, replies to answer, nudges due.
 * Shown whenever nothing is open, so the page still opens on concrete work.
 */
/** Rows per group; the rest is one link away in its own tab. */
const NEEDS_PREVIEW = 4;

function NeedsYou({ entries, today, onOpen, onShowAll }: { entries: TrackerEntry[]; today: string; onOpen: (entry: TrackerEntry) => void; onShowAll: (view: TrackerView) => void }) {
  const open = entries.filter((entry) => entry.status !== "Done");
  const tasks = open.filter((entry) => entry.kind === "Task" && entry.dueDate && entry.dueDate <= today).sort(byDue);
  const replied = open.filter((entry) => entry.kind === "FollowUp" && followStateOf(entry) === "replied").sort(byRecent);
  const nudges = open.filter((entry) => entry.kind === "FollowUp" && followStateOf(entry) === "waiting" && entry.dueDate && entry.dueDate <= today).sort(byDue);
  const total = tasks.length + replied.length + nudges.length;

  const stats = [
    { label: "Open to-dos", value: open.filter((e) => e.kind === "Task").length },
    { label: "Due this week", value: open.filter((e) => e.kind === "Task" && e.dueDate && differenceInCalendarDays(parseISO(e.dueDate), parseISO(today)) <= 7).length },
    { label: "Waiting on others", value: open.filter((e) => e.kind === "FollowUp" && followStateOf(e) === "waiting").length },
    { label: "Notes", value: open.filter((e) => e.kind === "Note").length },
  ];

  const groups = [
    {
      label: "Overdue & due today",
      view: "todo" as TrackerView,
      items: tasks,
      row: (entry: TrackerEntry) => (
        <Row key={entry.id} title={entry.subject} lead={<DoneToggle entry={entry} />} meta={<DueChip entry={entry} today={today} />} trailing={entry.pinned ? <PinnedStar /> : null} onOpen={() => onOpen(entry)} />
      ),
    },
    {
      label: "They replied — your turn",
      view: "followups" as TrackerView,
      items: replied,
      row: (entry: TrackerEntry) => (
        <Row key={entry.id} title={entry.subject} lead={<Avatar name={entry.person ?? "?"} toneValue={FOLLOW_STATE.replied.tone} />} meta={<span suppressHydrationWarning><b className="font-semibold text-text">{entry.person}</b> replied {ago(entry.updates[0]!.occurredAt, today)}</span>} trailing={entry.pinned ? <PinnedStar /> : null} onOpen={() => onOpen(entry)} />
      ),
    },
    {
      label: "Nudge due",
      view: "followups" as TrackerView,
      items: nudges,
      row: (entry: TrackerEntry) => (
        <Row key={entry.id} title={entry.subject} lead={<Avatar name={entry.person ?? "?"} toneValue={FOLLOW_STATE.waiting.tone} />} meta={<><b className="font-semibold text-text">{entry.person}</b><DueChip entry={entry} today={today} prefix="nudge" /></>} trailing={entry.pinned ? <PinnedStar /> : null} onOpen={() => onOpen(entry)} />
      ),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <>
      <PanelHead
        eyebrow={<span suppressHydrationWarning>{format(parseISO(today), "EEEE d MMM")}</span>}
        title={total === 0 ? "All caught up" : `${total} ${total === 1 ? "thing needs" : "things need"} you`}
      />
      <PanelBody>
        <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-border md:grid-cols-4">
          {stats.map((stat, index) => (
            <div key={stat.label} className={cn("px-4 py-3", index > 0 && "border-l border-border", index === 2 && "max-md:border-l-0 max-md:border-t", index === 3 && "max-md:border-t")}>
              <dt className="text-xs text-text-muted">{stat.label}</dt>
              <dd className="mt-0.5 text-2xl font-semibold tracking-[-0.02em] text-text tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {groups.length === 0 ? (
          <p className="mt-8 flex items-center gap-2 text-base text-text-muted">
            <Check className="size-5 text-primary" aria-hidden="true" />
            Nothing overdue, due today, or waiting on a reply from you.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h3 className="text-sm font-semibold text-text">
                  {group.label} <span className="font-normal text-text-subtle tabular-nums">· {group.items.length}</span>
                </h3>
                <ul className="mt-2 overflow-hidden rounded-xl border border-border">{group.items.slice(0, NEEDS_PREVIEW).map(group.row)}</ul>
                {group.items.length > NEEDS_PREVIEW ? (
                  <button type="button" onClick={() => onShowAll(group.view)} className="mt-2 cursor-pointer text-sm font-semibold text-accent-text hover:underline">
                    {group.items.length - NEEDS_PREVIEW} more in {group.view === "todo" ? "To-do" : "Follow-ups"} →
                  </button>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </PanelBody>
    </>
  );
}

// --- to-do -------------------------------------------------------------------

function TodoList({ entries, today, needle, openId, onOpen }: { entries: TrackerEntry[]; today: string; needle: string; openId: string | null; onOpen: (entry: TrackerEntry) => void }) {
  const { open, done } = useMemo(() => {
    const sections: Record<TodoSection, TrackerEntry[]> = { overdue: [], today: [], upcoming: [], someday: [] };
    const finished: TrackerEntry[] = [];
    for (const entry of entries) {
      if (!matches(entry, needle)) continue;
      if (entry.status === "Done") finished.push(entry);
      else sections[todoSectionOf(entry, today)].push(entry);
    }
    sections.overdue.sort(byDue);
    sections.today.sort(byRecent);
    sections.upcoming.sort(byDue);
    sections.someday.sort(byRecent);
    return { open: sections, done: finished.sort(byCompleted) };
  }, [entries, today, needle]);

  // Top to bottom by urgency: Overdue → Today → Upcoming → Someday; empty groups hide.
  const visible = (Object.keys(TODO_SECTIONS) as TodoSection[]).filter((key) => open[key].length > 0);

  return (
    <>
      <AddTodo />
      {visible.length === 0 ? (
        <Empty
          icon={ListTodo}
          title={needle ? "Nothing matches" : "Nothing to do"}
          text={needle ? "Try a different word." : "Add a to-do above. Give it a date to see it under Today or Upcoming."}
        />
      ) : (
        visible.map((key) => (
          <Group key={key} label={TODO_SECTIONS[key].label} count={open[key].length} toneValue={TODO_SECTIONS[key].tone}>
            {open[key].map((entry) => <TodoRow key={entry.id} entry={entry} today={today} selected={entry.id === openId} onOpen={() => onOpen(entry)} />)}
          </Group>
        ))
      )}
      <Collapsed label="Completed" count={done.length}>
        {done.map((entry) => <TodoRow key={entry.id} entry={entry} today={today} selected={entry.id === openId} onOpen={() => onOpen(entry)} />)}
      </Collapsed>
    </>
  );
}

function AddTodo() {
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [pinned, setPinned] = useState(false);
  const { create, pending, error, setError } = useCreate(() => { setSubject(""); setDate(""); setPinned(false); });

  function save() {
    if (pending) return;
    // The button is always live (a greyed CTA reads as broken); empty → point at the field.
    if (!subject.trim()) { setError("Write the to-do first"); document.getElementById("add-todo")?.focus(); return; }
    create({ kind: "Task", subject: subject.trim().slice(0, 300), dueDate: date || null }, pinned);
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border p-4">
      <label htmlFor="add-todo" className="sr-only">New to-do</label>
      <Input
        id="add-todo"
        value={subject}
        maxLength={300}
        placeholder="Add a to-do…"
        startIcon={<Plus />}
        endIcon={subject ? <CornerDownLeft /> : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(event) => { setSubject(event.target.value); setError(undefined); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } }}
      />
      <div className="flex items-center gap-2">
        <label htmlFor="add-todo-date" className="sr-only">Due date (optional)</label>
        <Input id="add-todo-date" type="date" value={date} className="min-w-0 flex-1" onChange={(event) => setDate(event.target.value)} />
        <StarToggle value={pinned} onChange={setPinned} />
        <Button onClick={save} loading={pending}>Add</Button>
      </div>
      {error ? <p className="px-1 text-sm font-medium text-danger" role="alert">{error}</p> : null}
    </div>
  );
}

function TodoRow({ entry, today, selected, onOpen }: { entry: TrackerEntry; today: string; selected: boolean; onOpen: () => void }) {
  const isDone = entry.status === "Done";
  const hasMeta = Boolean((entry.dueDate && !isDone) || entry.updates.length || (isDone && entry.completedAt));
  return (
    <Row
      title={entry.subject}
      selected={selected}
      muted={isDone}
      lead={<DoneToggle entry={entry} />}
      meta={hasMeta ? (
        <>
          <DueChip entry={entry} today={today} />
          {isDone && entry.completedAt ? <span>Done {format(parseISO(entry.completedAt), "d MMM")}</span> : null}
          <NotesCount count={entry.updates.length} />
        </>
      ) : null}
      trailing={entry.pinned ? <PinnedStar /> : null}
      onOpen={onOpen}
    />
  );
}

// --- follow-ups --------------------------------------------------------------

function FollowUpList({ entries, today, needle, openId, composing, onCompose, onOpen }: { entries: TrackerEntry[]; today: string; needle: string; openId: string | null; composing: boolean; onCompose: () => void; onOpen: (entry: TrackerEntry) => void }) {
  const groups = useMemo(() => {
    const next: Record<FollowState, TrackerEntry[]> = { replied: [], waiting: [], closed: [] };
    for (const entry of entries) if (matches(entry, needle)) next[followStateOf(entry)].push(entry);
    next.replied.sort(byRecent);
    // Waiting: a nudge that's due goes first, then whoever has waited longest.
    next.waiting.sort((a, b) => important(a, b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.updatedAt.localeCompare(b.updatedAt));
    next.closed.sort(byCompleted);
    return next;
  }, [entries, needle]);

  return (
    <>
      <ComposeButton label="New follow-up" active={composing} onClick={onCompose} />
      {groups.replied.length + groups.waiting.length === 0 ? (
        <Empty
          icon={MessageSquare}
          title={needle ? "Nothing matches" : "No one to chase"}
          text={needle ? "Try a different word." : "When you ask someone for something, add it here. It waits until they reply."}
        />
      ) : (
        // Your turn first, then the people you're waiting on.
        (["replied", "waiting"] as const).filter((state) => groups[state].length > 0).map((state) => (
          <Group key={state} label={FOLLOW_STATE[state].label} count={groups[state].length} toneValue={FOLLOW_STATE[state].tone}>
            {groups[state].map((entry) => <FollowUpRow key={entry.id} entry={entry} today={today} selected={entry.id === openId} onOpen={() => onOpen(entry)} />)}
          </Group>
        ))
      )}
      <Collapsed label="Closed" count={groups.closed.length}>
        {groups.closed.map((entry) => <FollowUpRow key={entry.id} entry={entry} today={today} selected={entry.id === openId} onOpen={() => onOpen(entry)} />)}
      </Collapsed>
    </>
  );
}

function AddFollowUp({ people, onSaved }: { people: string[]; onSaved: () => void }) {
  const [person, setPerson] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const { channels } = useContext(ListsContext);
  const [channel, setChannel] = useState(channels[0] ?? "Slack");
  const [date, setDate] = useState("");
  const [pinned, setPinned] = useState(false);
  const { create, pending, error, setError } = useCreate(() => { setPerson(""); setSubject(""); setMessage(""); setDate(""); setPinned(false); onSaved(); });

  function save() {
    if (pending) return;
    if (!person.trim()) { setError("Who did you tell?"); return; }
    if (!subject.trim()) { setError("Give it a short title"); return; }
    create(
      {
        kind: "FollowUp",
        person: person.trim(),
        subject: subject.trim().slice(0, 300),
        // The first message is a real record row, so "sent 3d ago via Slack"
        // comes from the same place as every later nudge. No message → the
        // title is what you said.
        note: message.trim() || subject.trim(),
        channel,
        dueDate: date || null,
      },
      pinned,
    );
  }

  const saveOnModEnter = (event: React.KeyboardEvent) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); } };

  return (
    <ComposerFields error={error}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Who" htmlFor="add-fu-person" required>
          <Input id="add-fu-person" value={person} list="add-fu-people" placeholder="e.g. Ashwini" maxLength={120} onChange={(event) => { setPerson(event.target.value); setError(undefined); }} />
          <datalist id="add-fu-people">{people.map((name) => <option key={name} value={name} />)}</datalist>
        </Field>
        <Field label="Title" htmlFor="add-fu-subject" required>
          <Input id="add-fu-subject" value={subject} maxLength={300} placeholder="e.g. SMTP credentials for Timebase" onChange={(event) => { setSubject(event.target.value); setError(undefined); }} />
        </Field>
      </div>
      <Field label="What did you ask or tell them?" htmlFor="add-fu-message">
        <Textarea id="add-fu-message" rows={4} value={message} placeholder="e.g. Shared the setup doc and asked for the credentials." onChange={(event) => setMessage(event.target.value)} onKeyDown={saveOnModEnter} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Where" htmlFor="add-fu-channel">
          <ChannelSelect id="add-fu-channel" value={channel} onChange={setChannel} />
        </Field>
        <Field label="Nudge on" htmlFor="add-fu-date">
          <Input id="add-fu-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <StarToggle value={pinned} onChange={setPinned} />
        <Button onClick={save} loading={pending} size="lg">
          <Plus aria-hidden="true" />
          Add follow-up
        </Button>
      </div>
    </ComposerFields>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

function FollowUpRow({ entry, today, selected, onOpen }: { entry: TrackerEntry; today: string; selected: boolean; onOpen: () => void }) {
  const state = followStateOf(entry);
  const last = entry.updates[0];
  const person = entry.person ?? "Someone";
  const lastLine = last
    ? last.fromThem
      ? `replied ${ago(last.occurredAt, today)}`
      : `you wrote ${ago(last.occurredAt, today)} via ${last.channel}`
    : `added ${ago(entry.createdAt, today)}`;

  return (
    <Row
      title={entry.subject}
      selected={selected}
      muted={state === "closed"}
      lead={<Avatar name={person} toneValue={FOLLOW_STATE[state].tone} />}
      meta={
        <>
          <span><b className="font-semibold text-text">{person}</b> · <span suppressHydrationWarning>{lastLine}</span></span>
          {/* Once they've replied there's no one to nudge. */}
          {state === "waiting" ? <DueChip entry={entry} today={today} prefix="nudge" /> : null}
        </>
      }
      trailing={entry.pinned ? <PinnedStar /> : null}
      onOpen={onOpen}
    />
  );
}

// --- notes -------------------------------------------------------------------

/** Used tags first (most used first), then saved-but-unused ones from Profile. */
function mergeTags(used: string[], saved: string[]) {
  return [...used, ...saved.filter((tag) => !used.includes(tag))];
}

/** Every tag used on these notes, most used first. */
function noteTags(entries: TrackerEntry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function NoteList({ entries, today, needle, openId, composing, onCompose, onOpen }: { entries: TrackerEntry[]; today: string; needle: string; openId: string | null; composing: boolean; onCompose: () => void; onOpen: (entry: TrackerEntry) => void }) {
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(false);
  const allTags = useMemo(() => noteTags(entries.filter((entry) => entry.status !== "Done")), [entries]);
  // A tag that's gone (last note untagged/archived) stops filtering.
  const activeTag = tagFilter && allTags.some(([tag]) => tag === tagFilter) ? tagFilter : null;

  const { open, archived } = useMemo(() => {
    const live: TrackerEntry[] = [];
    const old: TrackerEntry[] = [];
    for (const entry of entries) {
      if (!matches(entry, needle)) continue;
      if (activeTag && !entry.tags.includes(activeTag)) continue;
      (entry.status === "Done" ? old : live).push(entry);
    }
    return { open: live.sort(byRecent), archived: old.sort(byCompleted) };
  }, [entries, needle, activeTag]);

  // Group by tag: a note with two tags shows under both; untagged ones last.
  const groups = useMemo(() => {
    if (!grouped) return null;
    const byTag = new Map<string, TrackerEntry[]>();
    for (const entry of open) {
      const tags = entry.tags.length ? entry.tags : [""];
      for (const tag of tags) byTag.set(tag, [...(byTag.get(tag) ?? []), entry]);
    }
    return [...byTag.entries()].sort(([a, x], [b, y]) => (a === "" ? 1 : b === "" ? -1 : y.length - x.length || a.localeCompare(b)));
  }, [grouped, open]);

  const row = (entry: TrackerEntry) => <NoteRow key={entry.id} entry={entry} today={today} selected={entry.id === openId} onOpen={() => onOpen(entry)} />;

  return (
    <>
      <ComposeButton label="New note" active={composing} onClick={onCompose} />
      {allTags.length ? (
        <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3">
          <div role="group" aria-label="Filter notes by tag" className="flex flex-wrap gap-1.5">
            <TagChip label="All" active={!activeTag} onClick={() => setTagFilter(null)} />
            {allTags.map(([tag, count]) => (
              <TagChip key={tag} tag={tag} label={tag} count={count} active={activeTag === tag} onClick={() => setTagFilter(activeTag === tag ? null : tag)} />
            ))}
          </div>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-text">
            <input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} className="size-4 cursor-pointer accent-[var(--c-primary)]" />
            Group by tag
          </label>
        </div>
      ) : null}

      {open.length === 0 ? (
        <Empty
          icon={StickyNote}
          title={needle || activeTag ? "Nothing matches" : "No notes yet"}
          text={needle || activeTag ? "Try a different word or tag." : "Write one with New note. Open a note later to add updates to it."}
        />
      ) : groups ? (
        groups.map(([tag, list]) => (
          <Group key={tag || "untagged"} label={tag ? `#${tag}` : "Untagged"} count={list.length}>{list.map(row)}</Group>
        ))
      ) : (
        <ul>{open.map(row)}</ul>
      )}
      <Collapsed label="Archived" count={archived.length}>{archived.map(row)}</Collapsed>
    </>
  );
}

function TagChip({ label, tag, count, active, onClick }: { label: string; tag?: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors duration-150",
        active ? "border-sidebar bg-sidebar text-sidebar-fg" : "border-border bg-surface text-text hover:border-border-strong hover:bg-surface-2",
      )}
    >
      {tag ? <span className={cn("inline-flex", active && "rounded-full bg-surface p-0.5")}><TagIcon tag={tag} className="size-3.5" /></span> : null}
      {label}
      {count !== undefined ? <span className={cn("text-xs tabular-nums", active ? "text-sidebar-fg" : "text-text-muted")}>{count}</span> : null}
    </button>
  );
}

function AddNote({ suggestions, onSaved }: { suggestions: string[]; onSaved: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const { create, pending, error, setError } = useCreate(() => { setSubject(""); setBody(""); setTags([]); setPinned(false); onSaved(); });

  function save() {
    if (pending) return;
    if (!subject.trim()) { setError("Give the note a title"); document.getElementById("add-note")?.focus(); return; }
    create({ kind: "Note", subject: subject.trim().slice(0, 300), note: body, tags }, pinned);
  }

  return (
    <ComposerFields error={error}>
      <Field label="Title" htmlFor="add-note" required>
        <Input id="add-note" value={subject} maxLength={300} placeholder="e.g. Staging deploy checklist" aria-invalid={error ? true : undefined} onChange={(event) => { setSubject(event.target.value); setError(undefined); }} />
      </Field>
      <Field label="Content" htmlFor="add-note-body" hint="⌘/Ctrl + Enter to save. Add more updates to it later.">
        <Textarea
          id="add-note-body"
          rows={8}
          value={body}
          placeholder="Write anything — steps, thoughts, links…"
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); } }}
        />
      </Field>
      <Field label="Tags" htmlFor="add-note-tags" hint="Enter or comma adds a tag.">
        <TagInput id="add-note-tags" value={tags} onChange={setTags} suggestions={suggestions} placeholder="e.g. drupal, deploy" />
      </Field>
      <div className="flex items-center gap-2">
        <StarToggle value={pinned} onChange={setPinned} />
        <Button onClick={save} loading={pending} size="lg">
          <Plus aria-hidden="true" />
          Save note
        </Button>
      </div>
    </ComposerFields>
  );
}

/** The fields of a new follow-up / note, in the right panel (or a dialog on phones). */
function ComposerFields({ error, children }: { error?: string; children: React.ReactNode }) {
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {children}
      {error ? <p className="text-sm font-medium text-danger" role="alert">{error}</p> : null}
    </div>
  );
}

function NoteRow({ entry, today, selected, onOpen }: { entry: TrackerEntry; today: string; selected: boolean; onOpen: () => void }) {
  const latest = entry.updates[0];
  return (
    <Row
      title={entry.subject}
      selected={selected}
      onOpen={onOpen}
      meta={
        <>
          {latest?.note ? <span className="line-clamp-2 w-full text-sm leading-relaxed whitespace-pre-line text-text-muted [overflow-wrap:anywhere]">{latest.note}</span> : null}
          {entry.tags.map((tag) => <span key={tag} className="font-semibold text-accent-text">#{tag}</span>)}
          <span suppressHydrationWarning>
            {entry.updates.length > 1 ? `${entry.updates.length} updates · ` : ""}{entry.status === "Done" ? "Archived" : "Updated"} {ago(entry.updatedAt, today)}
          </span>
        </>
      }
      trailing={entry.pinned ? <PinnedStar /> : null}
    />
  );
}

// --- the opened entry ----------------------------------------------------------

function EntryEyebrow({ entry }: { entry: TrackerEntry }) {
  return (
    <span className="flex items-center gap-1.5">
      {KIND_LABEL[entry.kind]}
      {entry.pinned ? <><span aria-hidden="true">·</span><Star className="size-3.5 fill-current text-warning" aria-hidden="true" />Important</> : null}
    </span>
  );
}

function EntryTitle({ entry }: { entry: TrackerEntry }) {
  return <span className={cn("[overflow-wrap:anywhere]", entry.status === "Done" && entry.kind !== "Note" && "text-text-muted line-through")}>{entry.subject}</span>;
}

/** The opened entry in the right panel (from lg). */
function EntryPanel({ entry, tagSuggestions, onClose }: { entry: TrackerEntry; tagSuggestions: string[]; onClose: () => void }) {
  return (
    <>
      <PanelHead eyebrow={<EntryEyebrow entry={entry} />} title={<EntryTitle entry={entry} />} onClose={onClose} />
      <PanelBody>
        <EntryBody entry={entry} tagSuggestions={tagSuggestions} onDeleted={onClose} />
      </PanelBody>
    </>
  );
}

/** Facts, date, actions, add-an-update and the history — shared by the panel and the phone dialog. */
function EntryBody({ entry, tagSuggestions, onDeleted }: { entry: TrackerEntry; tagSuggestions: string[]; onDeleted: () => void }) {
  const { run, pending } = useRun();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isDone = entry.status === "Done";
  const kind = entry.kind;
  const state = kind === "FollowUp" ? followStateOf(entry) : null;

  const doneLabel = kind === "Note" ? (isDone ? "Restore" : "Archive") : kind === "FollowUp" ? (isDone ? "Reopen" : "Close") : isDone ? "Reopen" : "Mark done";
  const doneToast = kind === "Note" ? (isDone ? "Restored" : "Archived") : isDone ? "Reopened" : kind === "FollowUp" ? "Closed" : "Done";

  const facts: Array<{ label: string; value: React.ReactNode }> = [
    ...(entry.person ? [{ label: "With", value: entry.person }] : []),
    ...(state ? [{ label: "Status", value: <span style={tone(FOLLOW_STATE[state].tone)} className="font-semibold text-[color-mix(in_srgb,var(--tone)_80%,var(--c-text))]">{FOLLOW_STATE[state].label}</span> }] : []),
    ...(kind === "Task" ? [{ label: "Status", value: isDone ? `Done${entry.completedAt ? ` · ${format(parseISO(entry.completedAt), "d MMM")}` : ""}` : "Open" }] : []),
    ...(entry.ticketKey ? [{ label: "Ticket", value: <span className="font-mono">{entry.ticketKey}</span> }] : []),
    { label: "Added", value: format(parseISO(entry.createdAt), "d MMM yyyy") },
  ];

  return (
    <div className={cn("flex max-w-3xl flex-col gap-6", pending && "opacity-60")}>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <dl className="flex flex-wrap gap-x-8 gap-y-4">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-xs text-text-subtle">{fact.label}</dt>
              <dd className="mt-1 text-sm font-medium text-text">{fact.value}</dd>
            </div>
          ))}
        </dl>
        {kind !== "Note" && !isDone ? (
          <div className="min-w-0">
            <label htmlFor={`due-${entry.id}`} className="block text-xs text-text-subtle">{kind === "Task" ? "Due" : "Nudge on"}</label>
            <Input
              id={`due-${entry.id}`}
              type="date"
              value={entry.dueDate ?? ""}
              className="mt-1 w-44"
              onChange={(event) => run(() => rescheduleFollowUp({ followUpId: entry.id, dueDate: event.target.value || null }), event.target.value ? "Date set" : "Date cleared")}
            />
          </div>
        ) : null}
      </div>

      {kind === "Note" ? <NoteTagsEditor entry={entry} suggestions={tagSuggestions} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={isDone ? "secondary" : "primary"} onClick={() => run(() => setFollowUpStatus({ followUpId: entry.id, status: isDone ? "Open" : "Done" }), doneToast)}>
          {isDone ? <RotateCcw aria-hidden="true" /> : <Check aria-hidden="true" />}
          {doneLabel}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            aria-pressed={entry.pinned}
            aria-label={entry.pinned ? "Remove from important" : "Mark important"}
            title={entry.pinned ? "Remove from important" : "Mark important"}
            onClick={() => run(() => setFollowUpPinned({ followUpId: entry.id, pinned: !entry.pinned }), entry.pinned ? "Removed from important" : "Marked important")}
          >
            <Star aria-hidden="true" className={cn(entry.pinned && "fill-current text-warning")} />
          </Button>
          <Button size="sm" variant="ghost" iconOnly className="hover:text-danger" aria-label={`Delete ${entry.subject}`} title="Delete" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      <AddUpdateForm key={entry.updates.length} entry={entry} />

      <Timeline entry={entry} />

      <ConfirmationDialog
        open={confirmDelete}
        title={`Delete “${entry.subject}”?`}
        description="This removes it and everything recorded on it. It can't be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDeleted();
          run(() => deleteFollowUp({ followUpId: entry.id }), "Deleted");
        }}
      />
    </div>
  );
}


/** Tags are labels, not history: edited in place, saved on every change. */
function NoteTagsEditor({ entry, suggestions }: { entry: TrackerEntry; suggestions: string[] }) {
  const { run } = useRun();
  // Local copy so chips update instantly; the server copy catches up on refresh.
  const [tags, setTags] = useState(entry.tags);
  return (
    <Field label="Tags" htmlFor={`tags-${entry.id}`}>
      <TagInput
        id={`tags-${entry.id}`}
        value={tags}
        suggestions={suggestions}
        placeholder="Add a tag"
        onChange={(next) => {
          setTags(next);
          run(() => setFollowUpTags({ followUpId: entry.id, tags: next }));
        }}
      />
    </Field>
  );
}

/**
 * Appends to the record. A follow-up picks who spoke — you, or them — so the
 * board knows whether it's still waiting. Nothing here edits an earlier row.
 */
function AddUpdateForm({ entry }: { entry: TrackerEntry }) {
  const { run, pending } = useRun();
  const isFollowUp = entry.kind === "FollowUp";
  const [fromThem, setFromThem] = useState(isFollowUp && followStateOf(entry) === "waiting");
  const [note, setNote] = useState("");
  const { channels } = useContext(ListsContext);
  const [channel, setChannel] = useState(entry.updates[0]?.channel ?? (isFollowUp ? (channels[0] ?? "Slack") : "Other"));
  const person = entry.person ?? "They";

  const label = isFollowUp ? (fromThem ? `What did ${person} say?` : "What did you tell them?") : entry.kind === "Task" ? "Add a note" : "Add an update";
  const canSave = fromThem || note.trim().length > 0;

  function save() {
    if (!canSave) return;
    run(
      () => addFollowUpUpdate({ followUpId: entry.id, note, channel: isFollowUp ? channel : "Other", fromThem: isFollowUp ? fromThem : false }),
      isFollowUp ? (fromThem ? "Reply recorded" : "Message recorded") : "Added",
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      {isFollowUp ? (
        <div role="radiogroup" aria-label="Who said it" className="flex w-fit gap-1 rounded-full border border-border bg-surface p-0.5">
          {[
            { value: false, label: "I followed up", Icon: Send },
            { value: true, label: `${person} replied`, Icon: MessageSquareReply },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={fromThem === option.value}
              onClick={() => setFromThem(option.value)}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors duration-150",
                fromThem === option.value ? "bg-sidebar text-sidebar-fg" : "text-text-muted hover:text-text",
              )}
            >
              <option.Icon className="size-3.5" aria-hidden="true" />
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <Field label={label} htmlFor={`note-${entry.id}`} hint={isFollowUp && fromThem ? "Optional — leave blank to just mark it replied." : undefined}>
        <Textarea
          id={`note-${entry.id}`}
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); } }}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        {isFollowUp ? (
          <>
            <label htmlFor={`channel-${entry.id}`} className="sr-only">Where</label>
            <ChannelSelect id={`channel-${entry.id}`} value={channel} onChange={setChannel} className="w-36" />
          </>
        ) : null}
        <Button size="sm" className="ml-auto" onClick={save} loading={pending} disabled={!canSave}>
          <Plus aria-hidden="true" />
          {isFollowUp ? (fromThem ? "Save reply" : "Save") : "Add"}
        </Button>
      </div>
    </div>
  );
}

function Timeline({ entry }: { entry: TrackerEntry }) {
  const isFollowUp = entry.kind === "FollowUp";
  const heading = isFollowUp ? "Conversation" : entry.kind === "Task" ? "Notes" : "Updates";
  return (
    <section aria-label={heading} className="border-t border-border pt-5">
      <h3 className="text-sm font-semibold text-text">
        {heading} <span className="font-normal text-text-subtle tabular-nums">· {entry.updates.length}</span>
      </h3>
      {entry.updates.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-4 flex flex-col">
          {entry.updates.map((update, index) => {
            const who = isFollowUp ? (update.fromThem ? (entry.person ?? "They") : "You") : null;
            return (
              <li key={update.id} className="relative flex gap-4 pb-5 last:pb-0">
                {index < entry.updates.length - 1 ? <span aria-hidden="true" className="absolute top-4 bottom-0 left-[0.3125rem] w-px bg-border" /> : null}
                <span
                  aria-hidden="true"
                  style={update.fromThem ? tone(FOLLOW_STATE.replied.tone) : undefined}
                  className={cn("relative mt-1.5 size-2.5 shrink-0 rounded-full", update.fromThem ? "bg-[var(--tone)]" : "bg-sidebar")}
                />
                <div className="min-w-0">
                  <p className="text-xs text-text-muted">
                    {who ? <span className="font-semibold text-text">{who} · </span> : null}
                    <time dateTime={update.occurredAt}>{format(parseISO(update.occurredAt), "EEE d MMM yyyy, HH:mm")}</time>
                    {isFollowUp ? ` · ${update.channel}` : ""}
                  </p>
                  {update.note ? (
                    <p className="mt-1 whitespace-pre-wrap text-md leading-6 text-text [overflow-wrap:anywhere]">{update.note}</p>
                  ) : (
                    <p className="mt-1 text-sm text-text-muted italic">{update.fromThem ? "Replied" : "—"}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
