"use client";

import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Eye, MessagesSquare, Paperclip, Plane, Sun, Ticket } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useRef, useState, useTransition } from "react";

import { detachTicketFromWorkLog, saveTicketWorkUpdate, updateTicket, upsertTicketForWorkLog } from "@/actions/tickets";
import { updateWorkLog } from "@/actions/worklog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/cn";
import { DAY_LABEL, DEFAULT_TITLE, type DayType } from "@/components/work-log/day-type";
import { DayTypeToggle } from "@/components/work-log/day-type-toggle";
import { MeetingSection } from "@/components/work-log/meeting-section";
import { SaveStatusIndicator, SaveStatusProvider, type SaveResult } from "@/components/work-log/save-status";
import { AttachmentsSection } from "@/components/work-log/attachments-section";
import { DayTodos, type DayTodo } from "@/components/work-log/day-todos";
import { LearningSection } from "@/components/work-log/learning-section";
import { TicketSearch } from "@/components/work-log/ticket-search";
import { TicketWorkCard } from "@/components/work-log/ticket-work-card";
import { toHistory, type EditorTicket, type EditorWorkLog, type HistoryEntry } from "@/components/work-log/types";
import { toast } from "@/components/ui/toast";
import type { WorkflowStatus } from "@/lib/workflow-status";

type TicketPayload = {
  id: string;
  ticketId: string;
  title: string;
  projectName?: string | null;
  status: WorkflowStatus;
  updatedAt: Date | string;
  currentUpdate?: { description: string; status: WorkflowStatus } | null;
  updates?: Array<{ id: string; description: string; status: WorkflowStatus; createdAt: Date | string; updatedAt: Date | string; workLog?: { id: string; title: string; date: Date | string } | null }>;
};

function toEditorTicket(input: TicketPayload): EditorTicket {
  return { id: input.id, ticketKey: input.ticketId, title: input.title, projectName: input.projectName ?? null, status: input.status, updatedAt: new Date(input.updatedAt), draft: input.currentUpdate ?? { description: "", status: input.status }, history: input.updates ? toHistory(input.updates) : null };
}

/** Auto-generated titles ("Daily Work Log", "Holiday", "Leave") aren't shown in the title field. */
const DEFAULT_TITLES = new Set<string>(Object.values(DEFAULT_TITLE));
const shownTitle = (stored: string) => (DEFAULT_TITLES.has(stored) ? "" : stored);

type AdjacentLog = { id: string; label: string } | null;

/** ‹ / › to the neighbouring work log; a dimmed square when there is none. */
function AdjacentLink({ log, direction }: { log: AdjacentLog; direction: "previous" | "next" }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const box = "grid size-10 shrink-0 place-items-center rounded-xl border bg-surface transition-[border-color,background-color,box-shadow] duration-150";
  if (!log) {
    return <span className={cn(box, "border-border text-text-subtle opacity-50")} aria-hidden="true"><Icon className="size-4" /></span>;
  }
  return (
    <Link href={`/work-logs/${log.id}/edit`} aria-label={`${direction === "previous" ? "Previous" : "Next"} work log: ${log.label}`} title={log.label} className={cn(box, "border-border-strong text-text shadow-xs hover:border-primary hover:bg-surface-2")}>
      <Icon className="size-4" aria-hidden="true" />
    </Link>
  );
}

export function WorkLogEditor({ workLog, relative, adjacent, ticketsEnabled, dayTodos }: { workLog: EditorWorkLog; relative: string; adjacent: { previous: AdjacentLog; next: AdjacentLog }; ticketsEnabled: boolean; /** Tracker to-dos finished/overdue on this day. */ dayTodos: { date: string; todos: DayTodo[] } }) {
  const [title, setTitle] = useState(shownTitle(workLog.title));
  const [savedTitle, setSavedTitle] = useState(workLog.title);
  const [meetingsDone, setMeetingsDone] = useState(workLog.meetings.filter((meeting) => meeting.notes.trim()).length);
  const [learningWritten, setLearningWritten] = useState(workLog.learningNotes.trim().length > 0);
  const [attachmentCount, setAttachmentCount] = useState(workLog.attachments.length);
  const [tickets, setTickets] = useState(workLog.tickets);
  const [dayType, setDayType] = useState<DayType>(workLog.dayType);
  const [renaming, startRename] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  function saveTitle() {
    // An empty field stores the day type's default, which stays hidden here.
    const next = title.trim() || DEFAULT_TITLE[dayType];
    if (next === savedTitle || (!title.trim() && DEFAULT_TITLES.has(savedTitle))) { setTitle(shownTitle(savedTitle)); return; }
    startRename(async () => {
      const result = await updateWorkLog({ workLogId: workLog.id, title: next });
      if (!result.ok) { setTitle(shownTitle(savedTitle)); toast.error(result.error.message); return; }
      setTitle(shownTitle(result.data.title));
      setSavedTitle(result.data.title);
      toast.success(title.trim() ? "Work log renamed" : "Title cleared");
    });
  }

  function changeDayType(next: DayType) {
    if (next === dayType) return;
    const previous = dayType;
    setDayType(next);
    startRename(async () => {
      const result = await updateWorkLog({ workLogId: workLog.id, dayType: next });
      if (!result.ok) { setDayType(previous); toast.error(result.error.message); return; }
      toast.success(next === "Work" ? "Back to a work day" : `Marked as ${DAY_LABEL[next].toLowerCase()}`);
    });
  }

  async function attach(input: { ticketKey: string; title?: string; projectName?: string; status?: WorkflowStatus; description?: string }) {
    const result = await upsertTicketForWorkLog({ workLogId: workLog.id, ticketKey: input.ticketKey, title: input.title, projectName: input.projectName, status: input.status });
    if (!result.ok) { toast.error(result.error.message); return false; }
    let nextTicket = toEditorTicket({ ...result.data.ticket, currentUpdate: result.data.currentUpdate, updates: result.data.ticket.updates });

    // Save the work text BEFORE the card mounts: TicketWorkCard seeds its
    // editor from `ticket.draft` once, so a card added empty and filled in
    // afterwards would never show what was just typed.
    const description = input.description?.trim() ?? "";
    // `status` only seeds a NEW ticket server-side; for an existing ticket the
    // chosen status is applied through this log's work update.
    const status = input.status ?? nextTicket.draft.status;
    if (description || status !== nextTicket.draft.status) {
      const saved = await saveTicketWorkUpdate({ workLogId: workLog.id, ticketId: nextTicket.id, description, status });
      if (saved.ok) nextTicket = { ...nextTicket, draft: { description, status }, status: saved.data.ticket.status, updatedAt: new Date() };
      else toast.error(saved.error.message);
    }

    // upsert only sets the project on a NEW ticket; apply an edit to an existing one here.
    const project = input.projectName?.trim() ?? "";
    if (input.projectName !== undefined && project !== (nextTicket.projectName ?? "")) {
      const updated = await updateTicket({ ticketId: nextTicket.id, projectName: project });
      if (updated.ok) nextTicket = { ...nextTicket, projectName: updated.data.projectName };
      else toast.error(updated.error.message);
    }

    const added = nextTicket;
    setTickets((current) => current.some((ticket) => ticket.id === added.id) ? current.map((ticket) => ticket.id === added.id ? added : ticket) : [...current, added]);
    toast.success(`${added.ticketKey} added to this log`);
    return true;
  }

  async function saveWork(input: { ticketId: string; draft: { description: string; status: WorkflowStatus } }): Promise<SaveResult> {
    const result = await saveTicketWorkUpdate({ workLogId: workLog.id, ticketId: input.ticketId, description: input.draft.description, status: input.draft.status });
    if (!result.ok) return { ok: false, message: result.error.message };
    setTickets((current) => current.map((ticket) => ticket.id === input.ticketId ? { ...ticket, status: result.data.ticket.status, draft: input.draft, updatedAt: new Date() } : ticket));
    return { ok: true };
  }

  /** Project lives on the Ticket, so this updates it everywhere, not just in this log. */
  async function saveProject(ticketId: string, projectName: string) {
    const result = await updateTicket({ ticketId, projectName });
    if (!result.ok) { toast.error(result.error.message); return undefined; }
    const stored = result.data.projectName;
    setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, projectName: stored } : ticket));
    toast.success(stored ? "Project saved" : "Project cleared");
    return stored;
  }

  async function detach(ticketId: string) {
    const result = await detachTicketFromWorkLog({ workLogId: workLog.id, ticketId });
    if (!result.ok) { toast.error(result.error.message); return false; }
    setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
    toast.success("Ticket removed from this log");
    return true;
  }

  function updateHistory(ticketId: string, history: HistoryEntry[]) {
    setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, history } : ticket));
  }

  const progress = [
    { id: "meetings-heading", label: "Meeting notes", Icon: MessagesSquare, value: `${meetingsDone} of ${workLog.meetings.length} written`, done: meetingsDone > 0 },
    ...(ticketsEnabled ? [{ id: "tickets-heading", label: "Ticket work", Icon: Ticket, value: tickets.length === 1 ? "1 ticket" : `${tickets.length} tickets`, done: tickets.length > 0 }] : []),
    { id: "learning-heading", label: "Work done", Icon: ClipboardCheck, value: learningWritten ? "Written" : "Not yet", done: learningWritten },
    { id: "attachments-heading", label: "Attachments", Icon: Paperclip, value: attachmentCount === 1 ? "1 item" : `${attachmentCount} items`, done: attachmentCount > 0 },
  ];

  return (
    <SaveStatusProvider>
      <div className="work-logs-page work-log-edit-page flex min-w-0 flex-col gap-5">
        <Link href="/work-logs" className="tap-area inline-flex w-fit items-center gap-1 text-sm font-semibold text-accent-text hover:underline">
          <ChevronLeft className="size-4" aria-hidden="true" />All work logs
        </Link>

        {/* One navy card: date + title on the left, status + day type on the right. */}
        <header className="wl-card wl-hero motion-page-enter grid overflow-hidden xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="flex min-w-0 flex-col justify-between gap-5 p-5 md:p-6">
            <div className="flex items-center gap-3">
              <h1 className="min-w-0 text-2xl font-semibold tracking-[-0.03em] text-text md:text-3xl">
                <time dateTime={format(workLog.date, "yyyy-MM-dd")}>{format(workLog.date, "EEEE, d MMMM")}</time>
              </h1>
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", relative === "Today" ? "wl-solid bg-surface text-accent-text" : "bg-surface-2 text-text")}>{relative}</span>
              {/* Grouped at the far end so they never shift with the date's width. */}
              <nav aria-label="Other work logs" className="ml-auto flex shrink-0 items-center gap-1.5">
                <AdjacentLink log={adjacent.previous} direction="previous" />
                <AdjacentLink log={adjacent.next} direction="next" />
              </nav>
            </div>
            <div className="min-w-0">
              <label htmlFor="work-log-title" className="block text-xs font-semibold uppercase tracking-[0.1em] text-text">Log title</label>
              <Input
                bare
                id="work-log-title"
                ref={titleRef}
                value={title}
                placeholder={dayType === "Work" ? "Give today a title — e.g. Catalogue migration fixes" : "Add a note — optional"}
                disabled={renaming}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={saveTitle}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); titleRef.current?.blur(); } }}
                className="h-12 w-full rounded-none border-0 border-b-2 border-border bg-transparent px-0 py-0 text-lg font-semibold tracking-[-0.02em] text-text shadow-none transition-colors duration-150 placeholder:font-normal placeholder:text-text-subtle/55 hover:border-border-strong focus:border-primary focus:ring-0 md:text-xl"
              />
            </div>
          </div>

          <div role="group" aria-label="Log status" className="flex min-w-0 flex-col justify-between gap-4 border-t border-border p-5 md:p-6 xl:border-t-0 xl:border-l">
            <span className="min-w-0 text-sm [--c-text-subtle:var(--c-text-muted)]"><SaveStatusIndicator /></span>
            <div>
              <span id="work-log-day-type-label" className="mb-2 block text-xs font-semibold uppercase tracking-[0.1em] text-text">Day type</span>
              <DayTypeToggle name="work-log-day-type" labelledBy="work-log-day-type-label" value={dayType} onChange={changeDayType} disabled={renaming} surface="hero" short />
            </div>
            <Link href={`/work-logs/${workLog.id}`} className="wl-solid inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-surface text-sm font-semibold text-accent-text shadow-sm transition-colors duration-150 hover:bg-surface-2">
              <Eye className="size-4" aria-hidden="true" />View timeline
            </Link>
          </div>
        </header>

        {/* Below: sections + a right column. Column wrappers are `display: contents`
            below xl so the order classes give progress → sections → attachments. */}
        <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:gap-8">
          <div className="order-2 flex min-w-0 flex-col gap-5 xl:order-none xl:flex-1">
          {dayType !== "Work" ? (
            <section aria-label="Day off" className="wl-card wl-off flex flex-col items-start gap-3 p-6 md:p-8">
              <span className="grid size-11 place-items-center rounded-xl bg-sidebar text-sidebar-fg" aria-hidden="true">
                {dayType === "Holiday" ? <Sun className="size-5" /> : <Plane className="size-5" />}
              </span>
              <h2 className="text-xl font-semibold text-text">This day is marked as {DAY_LABEL[dayType].toLowerCase()}.</h2>
              <p className="max-w-[60ch] text-sm text-text-muted">No meetings or ticket work to capture. Switch the day type back to <strong className="font-semibold text-text">Work day</strong> if you did work — anything already written is kept.</p>
              <Button variant="secondary" onClick={() => changeDayType("Work")} loading={renaming}>Switch to work day</Button>
            </section>
          ) : null}

          <div className={dayType !== "Work" ? "hidden" : "flex min-w-0 flex-col gap-5"}>
            <MeetingSection workLogId={workLog.id} meetings={workLog.meetings} onCompletedChange={setMeetingsDone} />

            {ticketsEnabled ? (
            <section aria-labelledby="tickets-heading" className="wl-card overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-4 md:px-5">
                <h2 id="tickets-heading" className="flex items-center gap-2 text-lg font-semibold tracking-[-0.015em] text-text">
                  Tickets
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-accent-text tabular-nums">{tickets.length}</span>
                </h2>
                <TicketSearch attachedKeys={tickets.map((ticket) => ticket.ticketKey)} onAttach={attach} onFocusAttached={(ticketKey) => document.getElementById(`ticket-card-${ticketKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} />
              </div>
              {tickets.length > 0 ? (
                <div className="flex flex-col divide-y divide-border">
                  {tickets.map((ticket) => <TicketWorkCard key={ticket.id} workLogId={workLog.id} ticket={ticket} onSaveWork={saveWork} onDetach={detach} onHistoryLoaded={updateHistory} onSaveProject={saveProject} />)}
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-5 md:px-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent-text" aria-hidden="true"><Ticket className="size-4" /></span>
                  <span><span className="block text-sm font-semibold text-text">No ticket work yet</span><span className="block text-xs text-text-muted">Search above to attach a ticket and record what you did.</span></span>
                </div>
              )}
            </section>
            ) : null}

            <LearningSection workLogId={workLog.id} initialNotes={workLog.learningNotes} onFilledChange={setLearningWritten} />
            <DayTodos date={dayTodos.date} todos={dayTodos.todos} />
            </div>
          </div>

          <div className="contents xl:flex xl:w-[19rem] xl:shrink-0 xl:flex-col xl:gap-4">
            <div className="order-1 xl:order-none">
          {dayType === "Work" ? (
            <div className="wl-card p-3 xl:p-4">
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.1em] text-text-subtle">Today&apos;s log</p>
              <ul className={cn("grid grid-cols-2 gap-1.5 xl:grid-cols-1", ticketsEnabled ? "md:grid-cols-4" : "md:grid-cols-3")}>
                {progress.map(({ id, label, Icon, value, done }) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => document.getElementById(id)?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-surface-2"
                    >
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", done ? "bg-sidebar text-sidebar-fg" : "border border-border bg-surface text-text-muted")}>
                        {done ? <Check className="size-4" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text">{label}</span>
                        <span className={cn("block truncate text-xs", done ? "text-accent-text" : "text-text-subtle")}>{value}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
            </div>
            <div className={cn("order-3 xl:order-none", dayType !== "Work" && "hidden")}>
              <AttachmentsSection workLogId={workLog.id} initial={workLog.attachments} onCountChange={setAttachmentCount} />
            </div>
          </div>
        </div>
      </div>
    </SaveStatusProvider>
  );
}
