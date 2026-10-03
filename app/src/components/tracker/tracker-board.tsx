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
  Search,
  Send,
  Star,
  StickyNote,
  Tag,
  Trash2,
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
import { PageHeader } from "@/components/shell/page-header";
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
  const today = useSyncExternalStore(subscribeNever, todayIso, () => serverToday);
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

  function choose(next: TrackerView) {
    setView(next);
    setQuery("");
    // Shallow URL update so a refresh or a link lands on the same tab, without
    // a server round-trip on every switch.
    window.history.replaceState(null, "", next === "todo" ? "/tracker" : `/tracker?view=${next}`);
  }

  function onTabKey(event: React.KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = VIEWS.findIndex((v) => v.id === view);
    const next = VIEWS[(index + (event.key === "ArrowRight" ? 1 : VIEWS.length - 1)) % VIEWS.length];
    choose(next.id);
    document.getElementById(`tracker-tab-${next.id}`)?.focus();
  }

  return (
    <ListsContext.Provider value={lists}>
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        className="mb-0"
        title="Tracker"
        description={<StatusLine entries={entries} today={today} onGo={choose} />}
      />

      {loadError ? <FormError>{loadError}</FormError> : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" aria-label="Tracker lists" onKeyDown={onTabKey} className="flex gap-1 rounded-full border border-border bg-surface-2 p-1">
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
                  "relative inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold whitespace-nowrap transition-colors duration-150 md:flex-none md:gap-2 md:px-4",
                  active ? "bg-sidebar text-sidebar-fg shadow-sm" : "text-text-muted hover:text-text",
                )}
              >
                <item.Icon className="size-4 shrink-0 max-md:hidden" aria-hidden="true" />
                {item.label}
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-sidebar-accent-bg text-sidebar-fg" : "bg-surface text-text-muted")}>{badge[item.id]}</span>
                {item.id === "followups" && repliedCount > 0 ? (
                  <span style={tone(FOLLOW_STATE.replied.tone)} className="absolute top-1 right-1 size-2 rounded-full bg-[var(--tone)]" aria-label={`${repliedCount} replied`} />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="md:w-64">
          <label htmlFor="tracker-search" className="sr-only">Search this list</label>
          <Input id="tracker-search" value={query} placeholder="Search" startIcon={<Search />} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

      <div id="tracker-panel" role="tabpanel" aria-labelledby={`tracker-tab-${view}`} className="flex flex-col gap-5">
        {view === "todo" ? <TodoView entries={byKind.Task} today={today} needle={needle} onOpen={setOpenId} /> : null}
        {view === "followups" ? <FollowUpView entries={byKind.FollowUp} people={people} today={today} needle={needle} onOpen={setOpenId} /> : null}
        {view === "notes" ? <NotesView entries={byKind.Note} today={today} needle={needle} onOpen={setOpenId} /> : null}
      </div>

      {opened ? <EntryModal key={opened.id} entry={opened} tagSuggestions={mergeTags(noteTags(byKind.Note).map(([tag]) => tag), savedNoteTags)} onClose={() => setOpenId(null)} /> : null}
    </div>
    </ListsContext.Provider>
  );
}

/**
 * The first thing to read on the page: what needs you right now, each part a
 * link to the tab that holds it. Falls back to a calm "all caught up".
 */
function StatusLine({ entries, today, onGo }: { entries: TrackerEntry[]; today: string; onGo: (view: TrackerView) => void }) {
  const open = entries.filter((entry) => entry.status !== "Done");
  const todos = open.filter((entry) => entry.kind === "Task" && entry.dueDate);
  const overdue = todos.filter((entry) => entry.dueDate! < today).length;
  const dueToday = todos.filter((entry) => entry.dueDate === today).length;
  const replied = open.filter((entry) => entry.kind === "FollowUp" && followStateOf(entry) === "replied").length;
  const nudges = open.filter((entry) => entry.kind === "FollowUp" && followStateOf(entry) === "waiting" && entry.dueDate && entry.dueDate <= today).length;

  const parts = [
    overdue ? { key: "overdue", text: `${overdue} overdue`, view: "todo" as const, danger: true } : null,
    dueToday ? { key: "today", text: `${dueToday} due today`, view: "todo" as const, danger: false } : null,
    replied ? { key: "replied", text: `${replied} ${replied === 1 ? "reply" : "replies"} to answer`, view: "followups" as const, danger: false } : null,
    nudges ? { key: "nudges", text: `${nudges} ${nudges === 1 ? "person" : "people"} to nudge`, view: "followups" as const, danger: false } : null,
  ].filter((part) => part !== null);

  if (parts.length === 0) return <p>You&apos;re all caught up — nothing overdue or waiting on you.</p>;
  return (
    // Spacing, not "·" glyphs, separates the parts — a glyph dangles where the line wraps.
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span>Needs you:</span>
      {parts.map((part) => (
        <span key={part.key}>
          <button
            type="button"
            onClick={() => onGo(part.view)}
            className={cn("cursor-pointer rounded font-semibold underline-offset-4 hover:underline", part.danger ? "text-danger" : "text-text")}
          >
            {part.text}
          </button>
        </span>
      ))}
    </p>
  );
}

// --- shared bits -------------------------------------------------------------

/** A quiet list card with an optional small heading row. */
/**
 * A list of rows. Two weights, so the eye lands in the right place first:
 *   `focus` — what needs you now (Overdue, Today, They replied): a toned left
 *             edge and a normal-case heading at body size;
 *   default — everything else: a quiet uppercase micro-label.
 */
function ListCard({ label, count, toneValue, focus = false, children }: { label?: string; count?: number; toneValue?: string; focus?: boolean; children: React.ReactNode }) {
  const headingId = label ? `tracker-list-${label.toLowerCase().replace(/\W+/g, "-")}` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      data-reveal
      style={toneValue ? tone(toneValue) : undefined}
      className={cn("wl-card overflow-hidden", focus && "border-l-4 border-l-[var(--tone)]")}
    >
      {label && focus ? (
        <h2 id={headingId} className="flex items-center gap-2 border-b border-border px-4 py-3 text-base font-semibold text-text md:px-5">
          {label}
          <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold tabular-nums", TINT_CHIP)}>{count}</span>
        </h2>
      ) : label ? (
        <h2 id={headingId} className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2 text-xs font-bold tracking-[0.06em] uppercase text-text md:px-5">
          {toneValue ? <span className="size-2 rounded-full bg-[var(--tone)]" aria-hidden="true" /> : null}
          {label}
          <span className="font-semibold text-text-muted tabular-nums">{count}</span>
        </h2>
      ) : null}
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

/** "Completed · 4" — a collapsed list at the bottom of each tab. */
function Collapsed({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold text-text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
      >
        <ChevronDown className={cn("size-4 transition-transform duration-150 motion-reduce:transition-none", !open && "-rotate-90")} aria-hidden="true" />
        {label} <span className="font-medium text-text-subtle tabular-nums">{count}</span>
      </button>
      {open ? children : null}
    </div>
  );
}

function Empty({ icon: Icon, title, text }: { icon: typeof ListTodo; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
      <Icon className="size-6 text-text-subtle" aria-hidden="true" />
      <p className="text-md font-semibold text-text">{title}</p>
      <p className="max-w-[44ch] text-sm text-text-muted">{text}</p>
    </div>
  );
}

/** The date as a chip: solid red when late, solid teal for today, tinted otherwise. */
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
        "relative z-10 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-colors duration-150 disabled:cursor-wait disabled:opacity-60",
        done ? "border-primary bg-primary text-primary-fg" : "border-border-strong text-transparent hover:border-primary hover:text-primary",
      )}
    >
      <Check className="size-3" strokeWidth={3} aria-hidden="true" />
    </button>
  );
}

/** The ★ toggle used in every add row. */
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

/** Create an entry, then pin it if asked. Shared by the three add rows. */
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

/**
 * Form on the left (sticky), list on the right from lg; stacked below that.
 * Uses the full page width like every other workspace page.
 */
function SideLayout({ composer, children }: { composer: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-20">{composer}</div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </div>
  );
}

/** A titled form card for adding a follow-up or a note. */
function Composer({ title, icon: Icon, error, children }: { title: string; icon: typeof ListTodo; error?: string; children: React.ReactNode }) {
  return (
    // Recessed (tinted, no shadow) so your notes and follow-ups — not the form — are
    // what the eye lands on. The white fields and the navy button still stand out.
    <section aria-label={title} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-2 p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text">
        <Icon className="size-4 text-accent-text" aria-hidden="true" />
        {title}
      </h2>
      {children}
      {error ? <p className="text-sm font-medium text-danger" role="alert">{error}</p> : null}
    </section>
  );
}

// --- to-do -------------------------------------------------------------------

function TodoView({ entries, today, needle, onOpen }: { entries: TrackerEntry[]; today: string; needle: string; onOpen: (id: string) => void }) {
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
        // Overdue + Today first and emphasised; Upcoming + Someday below, quieter.
        [visible.filter((key) => key === "overdue" || key === "today"), visible.filter((key) => key === "upcoming" || key === "someday")]
          .filter((row) => row.length > 0)
          .map((row) => (
            <div key={row.join("-")} className={cn("grid items-start gap-5", row.length > 1 && "lg:grid-cols-2")}>
              {row.map((key) => (
                <ListCard key={key} label={TODO_SECTIONS[key].label} count={open[key].length} toneValue={TODO_SECTIONS[key].tone} focus={key === "overdue" || key === "today"}>
                  {open[key].map((entry) => <TodoRow key={entry.id} entry={entry} today={today} onOpen={() => onOpen(entry.id)} />)}
                </ListCard>
              ))}
            </div>
          ))
      )}
      <Collapsed label="Completed" count={done.length}>
        <ListCard>{done.map((entry) => <TodoRow key={entry.id} entry={entry} today={today} onOpen={() => onOpen(entry.id)} />)}</ListCard>
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
    <div className="wl-card flex flex-col gap-2 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <label htmlFor="add-todo" className="sr-only">New to-do</label>
        <Input
          id="add-todo"
          value={subject}
          maxLength={300}
          placeholder="Add a to-do…"
          startIcon={<Plus />}
          endIcon={subject ? <CornerDownLeft /> : undefined}
          aria-invalid={error ? true : undefined}
          className="min-w-0 flex-1"
          onChange={(event) => { setSubject(event.target.value); setError(undefined); }}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } }}
        />
        <div className="flex items-center gap-2">
          <label htmlFor="add-todo-date" className="sr-only">Due date (optional)</label>
          <Input id="add-todo-date" type="date" value={date} className="min-w-0 flex-1 md:w-40 md:flex-none" onChange={(event) => setDate(event.target.value)} />
          <StarToggle value={pinned} onChange={setPinned} />
          <Button onClick={save} loading={pending} size="lg">Add</Button>
        </div>
      </div>
      {error ? <p className="px-1 text-sm font-medium text-danger" role="alert">{error}</p> : null}
    </div>
  );
}

function TodoRow({ entry, today, onOpen }: { entry: TrackerEntry; today: string; onOpen: () => void }) {
  const isDone = entry.status === "Done";
  const notes = entry.updates.length;
  return (
    <li className="group relative flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-2 md:px-5">
      <DoneToggle entry={entry} />
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "min-w-0 flex-1 cursor-pointer truncate text-left text-base font-medium leading-snug after:absolute after:inset-0",
          isDone ? "text-text-subtle line-through" : "text-text",
        )}
        // Long titles are cut to one line; hovering shows the whole thing.
        title={entry.subject}
      >
        {entry.subject}
      </button>
      {entry.pinned ? <PinnedStar /> : null}
      {notes ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-text-subtle" title={`${notes} ${notes === 1 ? "note" : "notes"}`}>
          <StickyNote className="size-3.5" aria-hidden="true" />
          {notes}
        </span>
      ) : null}
      <DueChip entry={entry} today={today} />
    </li>
  );
}

// --- follow-ups --------------------------------------------------------------

function FollowUpView({ entries, people, today, needle, onOpen }: { entries: TrackerEntry[]; people: string[]; today: string; needle: string; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const next: Record<FollowState, TrackerEntry[]> = { replied: [], waiting: [], closed: [] };
    for (const entry of entries) if (matches(entry, needle)) next[followStateOf(entry)].push(entry);
    next.replied.sort(byRecent);
    // Waiting: a nudge that's due goes first, then whoever has waited longest.
    next.waiting.sort((a, b) => important(a, b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.updatedAt.localeCompare(b.updatedAt));
    next.closed.sort(byCompleted);
    return next;
  }, [entries, needle]);

  const nothingOpen = groups.replied.length + groups.waiting.length === 0;

  return (
    <SideLayout composer={<AddFollowUp people={people} />}>
      {nothingOpen ? (
        <Empty
          icon={MessageSquare}
          title={needle ? "Nothing matches" : "No one to chase"}
          text={needle ? "Try a different word." : "When you ask someone for something, add it above. It waits here until they reply."}
        />
      ) : (
        (["replied", "waiting"] as const).map((state) =>
          groups[state].length ? (
            <ListCard key={state} label={FOLLOW_STATE[state].label} count={groups[state].length} toneValue={FOLLOW_STATE[state].tone} focus={state === "replied"}>
              {groups[state].map((entry) => <FollowUpRow key={entry.id} entry={entry} today={today} onOpen={() => onOpen(entry.id)} />)}
            </ListCard>
          ) : null,
        )
      )}
      <Collapsed label="Closed" count={groups.closed.length}>
        <ListCard>{groups.closed.map((entry) => <FollowUpRow key={entry.id} entry={entry} today={today} onOpen={() => onOpen(entry.id)} />)}</ListCard>
      </Collapsed>
    </SideLayout>
  );
}

function AddFollowUp({ people }: { people: string[] }) {
  const [person, setPerson] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const { channels } = useContext(ListsContext);
  const [channel, setChannel] = useState(channels[0] ?? "Slack");
  const [date, setDate] = useState("");
  const [pinned, setPinned] = useState(false);
  const { create, pending, error, setError } = useCreate(() => { setPerson(""); setSubject(""); setMessage(""); setDate(""); setPinned(false); });

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
    <Composer title="New follow-up" icon={Send} error={error}>
      <Field label="Who" htmlFor="add-fu-person" required>
        <Input id="add-fu-person" value={person} list="add-fu-people" placeholder="e.g. Ashwini" maxLength={120} onChange={(event) => { setPerson(event.target.value); setError(undefined); }} />
        <datalist id="add-fu-people">{people.map((name) => <option key={name} value={name} />)}</datalist>
      </Field>
      <Field label="Title" htmlFor="add-fu-subject" required>
        <Input id="add-fu-subject" value={subject} maxLength={300} placeholder="e.g. SMTP credentials for Timebase" onChange={(event) => { setSubject(event.target.value); setError(undefined); }} />
      </Field>
      <Field label="What did you ask or tell them?" htmlFor="add-fu-message">
        <Textarea id="add-fu-message" rows={4} value={message} placeholder="e.g. Shared the setup doc and asked for the credentials." onChange={(event) => setMessage(event.target.value)} onKeyDown={saveOnModEnter} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Where" htmlFor="add-fu-channel">
          <ChannelSelect id="add-fu-channel" value={channel} onChange={setChannel} />
        </Field>
        <Field label="Nudge on" htmlFor="add-fu-date">
          <Input id="add-fu-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <StarToggle value={pinned} onChange={setPinned} />
        <Button onClick={save} loading={pending} size="lg" className="flex-1">
          <Plus aria-hidden="true" />
          Add follow-up
        </Button>
      </div>
    </Composer>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

function FollowUpRow({ entry, today, onOpen }: { entry: TrackerEntry; today: string; onOpen: () => void }) {
  const { run, pending } = useRun();
  const state = followStateOf(entry);
  const meta = FOLLOW_STATE[state];
  const last = entry.updates[0];
  const person = entry.person ?? "Someone";

  const lastLine = last
    ? last.fromThem
      ? `${person} replied ${ago(last.occurredAt, today)}`
      : `You · ${ago(last.occurredAt, today)} via ${last.channel}`
    : `Added ${ago(entry.createdAt, today)}`;
  // The body: the newest message with real text that isn't just the title again.
  const body = entry.updates.find((update) => update.note.trim() && update.note.trim() !== entry.subject.trim());

  return (
    <li className="group relative flex items-start gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-surface-2 md:items-center md:px-5">
      <span style={tone(meta.tone)} className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold", TINT_CHIP)} aria-hidden="true">
        {initials(person)}
      </span>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className={cn("flex w-full cursor-pointer items-center gap-1.5 text-left after:absolute after:inset-0", state === "closed" && "text-text-subtle")}
        >
          <span className="min-w-0 truncate text-base font-semibold text-text" title={person}>{person}</span>
          {entry.pinned ? <PinnedStar /> : null}
        </button>
        <p title={entry.subject} className={cn("mt-0.5 truncate text-sm", state === "closed" ? "text-text-subtle line-through" : "text-text")}>{entry.subject}</p>
        {body ? (
          <p
            title={body.note}
            className="mt-1.5 line-clamp-2 border-l-2 border-border-strong pl-2.5 text-sm leading-relaxed whitespace-pre-line text-text-muted [overflow-wrap:anywhere]"
          >
            <span className="font-semibold text-text">{body.fromThem ? person : "You"}:</span> {body.note}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-text-muted">
          <span suppressHydrationWarning>{lastLine}</span>
          {/* Once they've replied there's no one to nudge. */}
          {state === "waiting" ? <DueChip entry={entry} today={today} prefix="nudge" /> : null}
        </div>
      </div>

      {/* Quick actions sit above the row's click target. */}
      <div className="relative z-10 flex shrink-0 items-center gap-1.5">
        {state === "waiting" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            title="They replied"
            onClick={() => run(() => addFollowUpUpdate({ followUpId: entry.id, note: "", fromThem: true, channel: last?.channel ?? "Slack" }), "Marked as replied")}
          >
            <MessageSquareReply aria-hidden="true" />
            <span className="max-md:hidden">Got reply</span>
          </Button>
        ) : null}
        {state !== "closed" ? (
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            disabled={pending}
            aria-label={`Close follow-up with ${person}`}
            title="Close — nothing left to chase"
            onClick={() => run(() => setFollowUpStatus({ followUpId: entry.id, status: "Done" }), "Closed")}
            className="size-8"
          >
            <Check aria-hidden="true" />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setFollowUpStatus({ followUpId: entry.id, status: "Open" }), "Reopened")}>
            <RotateCcw aria-hidden="true" />
            Reopen
          </Button>
        )}
      </div>
    </li>
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

function NotesView({ entries, today, needle, onOpen }: { entries: TrackerEntry[]; today: string; needle: string; onOpen: (id: string) => void }) {
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(false);
  const allTags = useMemo(() => noteTags(entries.filter((entry) => entry.status !== "Done")), [entries]);
  const { noteTags: savedTags } = useContext(ListsContext);
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

  const grid = (list: TrackerEntry[]) => (
    <ul data-reveal-stagger className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {list.map((entry) => <NoteCard key={entry.id} entry={entry} today={today} onOpen={() => onOpen(entry.id)} onTag={setTagFilter} />)}
    </ul>
  );

  return (
    <SideLayout composer={<AddNote suggestions={mergeTags(allTags.map(([tag]) => tag), savedTags)} />}>
      {allTags.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter notes by tag" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            <TagChip label="All" active={!activeTag} onClick={() => setTagFilter(null)} />
            {allTags.map(([tag, count]) => (
              <TagChip key={tag} tag={tag} label={tag} count={count} active={activeTag === tag} onClick={() => setTagFilter(activeTag === tag ? null : tag)} />
            ))}
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold text-text">
            <input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} className="size-4 cursor-pointer accent-[var(--c-primary)]" />
            Group by tag
          </label>
        </div>
      ) : null}

      {open.length === 0 ? (
        <Empty
          icon={StickyNote}
          title={needle || activeTag ? "Nothing matches" : "No notes yet"}
          text={needle || activeTag ? "Try a different word or tag." : "Write one with the form. Open a note later to add updates to it."}
        />
      ) : groups ? (
        groups.map(([tag, list]) => (
          <section key={tag || "untagged"} aria-label={tag ? `#${tag}` : "Untagged"} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-text">
              <Tag className="size-3.5 text-accent-text" aria-hidden="true" />
              {tag ? `#${tag}` : "Untagged"}
              <span className="font-semibold text-text-subtle tabular-nums">{list.length}</span>
            </h2>
            {grid(list)}
          </section>
        ))
      ) : (
        grid(open)
      )}
      <Collapsed label="Archived" count={archived.length}>{grid(archived)}</Collapsed>
    </SideLayout>
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

function AddNote({ suggestions }: { suggestions: string[] }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const { create, pending, error, setError } = useCreate(() => { setSubject(""); setBody(""); setTags([]); setPinned(false); });

  function save() {
    if (pending) return;
    if (!subject.trim()) { setError("Give the note a title"); document.getElementById("add-note")?.focus(); return; }
    create({ kind: "Note", subject: subject.trim().slice(0, 300), note: body, tags }, pinned);
  }

  return (
    <Composer title="New note" icon={StickyNote} error={error}>
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
        <Button onClick={save} loading={pending} size="lg" className="flex-1">
          <Plus aria-hidden="true" />
          Save note
        </Button>
      </div>
    </Composer>
  );
}

function NoteCard({ entry, today, onOpen, onTag }: { entry: TrackerEntry; today: string; onOpen: () => void; onTag: (tag: string) => void }) {
  const latest = entry.updates[0];
  const count = entry.updates.length;
  return (
    <li className="group relative flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-md">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onOpen}
          title={entry.subject}
          className={cn("line-clamp-2 min-w-0 flex-1 cursor-pointer text-left text-md font-semibold leading-snug [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-[inherit]", entry.status === "Done" ? "text-text-subtle" : "text-text group-hover:text-accent-text")}
        >
          {entry.subject}
        </button>
        {entry.pinned ? <PinnedStar /> : null}
      </div>
      {latest?.note ? <p className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-text-muted [overflow-wrap:anywhere]">{latest.note}</p> : null}
      {entry.tags.length ? (
        // Above the card's click target so a tag filters instead of opening the note.
        <div className="relative z-10 flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <button key={tag} type="button" onClick={() => onTag(tag)} title={`Show #${tag} notes`} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-semibold text-text transition-colors duration-150 hover:bg-surface-2">
              <TagIcon tag={tag} className="size-3" />
              {tag}
            </button>
          ))}
        </div>
      ) : null}
      <p className="mt-auto pt-1 text-xs text-text-subtle" suppressHydrationWarning>
        {count > 1 ? `${count} updates · ` : ""}Updated {ago(entry.updatedAt, today)}
      </p>
    </li>
  );
}

// --- details popup -----------------------------------------------------------

function EntryModal({ entry, tagSuggestions, onClose }: { entry: TrackerEntry; tagSuggestions: string[]; onClose: () => void }) {
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
    <Modal
      open
      size="lg"
      onClose={onClose}
      eyebrow={
        <span className="flex items-center gap-1.5">
          {KIND_LABEL[kind]}
          {entry.pinned ? <><span aria-hidden="true">·</span><Star className="size-3.5 fill-current text-warning" aria-hidden="true" />Important</> : null}
        </span>
      }
      title={<span className={cn("[overflow-wrap:anywhere]", isDone && kind !== "Note" && "text-text-muted line-through")}>{entry.subject}</span>}
    >
      <div className={cn("flex flex-col gap-6", pending && "opacity-60")}>
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
              <label htmlFor={`due-${entry.id}`} className="text-xs text-text-subtle">{kind === "Task" ? "Due" : "Nudge on"}</label>
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
      </div>

      <ConfirmationDialog
        open={confirmDelete}
        title={`Delete “${entry.subject}”?`}
        description="This removes it and everything recorded on it. It can't be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onClose();
          run(() => deleteFollowUp({ followUpId: entry.id }), "Deleted");
        }}
      />
    </Modal>
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
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3.5">
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
