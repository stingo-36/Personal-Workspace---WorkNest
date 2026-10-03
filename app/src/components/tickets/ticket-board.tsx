"use client";

import { format } from "date-fns";
import { ArrowRight, Building2, CalendarDays, History, Loader2, Search, ShieldCheck, Ticket as TicketIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { appendTicketHistoryEntry, deleteTicketHistoryEntry, getTicket } from "@/actions/tickets";
import { cn } from "@/components/cn";
import { MarkdownContent, MarkdownEditor } from "@/components/work-log/markdown-editor";
import { TicketId } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TICKET_STATUS_DOT, TICKET_STATUS_LABELS, TICKET_STATUS_ORDER, TicketStatusBadge } from "@/components/ui/ticket-status-badge";
import { toast } from "@/components/ui/toast";
import type { WorkflowStatus } from "@/lib/workflow-status";

export type TicketBoardItem = {
  id: string;
  ticketId: string;
  title: string;
  projectName: string | null;
  status: WorkflowStatus;
  updatedAt: string;
  createdAt: string;
  workLogCount: number;
  latestUpdate: {
    description: string;
    createdAt: string;
    workLog: { id: string; title: string; date: string } | null;
  } | null;
};

type TicketDetail = {
  historyEntries: Array<{ id: string; body: string; status: WorkflowStatus; createdAt: string }>;
  updates: Array<{
    id: string;
    description: string;
    status: WorkflowStatus;
    createdAt: string;
    workLog: { id: string; title: string; date: string } | null;
  }>;
};

type StatusFilter = "All" | WorkflowStatus;

export function TicketBoard({ initialTickets, loadError, daysOff = [] }: { initialTickets: TicketBoardItem[]; loadError?: string; daysOff?: string[] }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("InProgress");

  const visibleTickets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return tickets.filter((ticket) => {
      const matchesStatus = status === "All" || ticket.status === status;
      const matchesQuery = !needle || ticket.ticketId.toLocaleLowerCase().includes(needle) || ticket.title.toLocaleLowerCase().includes(needle) || (ticket.projectName ?? "").toLocaleLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [query, status, tickets]);

  // Never open on an empty detail panel: fall back to the first ticket in the list.
  const selectedTicket = visibleTickets.find((ticket) => ticket.id === selectedId) ?? visibleTickets[0] ?? null;

  function replaceTicket(ticketId: string, patch: Partial<Pick<TicketBoardItem, "title" | "projectName" | "status" | "updatedAt">>) {
    setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, ...patch } : ticket));
  }

  return (
    <div className="tickets-board flex w-full min-w-0 flex-col gap-6">
      <header className="motion-page-enter flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text lg:text-4xl">Tickets</h1>
          <p className="mt-2 max-w-[62ch] text-base leading-relaxed text-text-muted">
            Keep each ticket current while preserving every update as a readable timeline.
          </p>
        </div>
        <span className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-full border border-border bg-surface px-4 text-sm font-semibold text-text-muted">
          <TicketIcon className="size-4 text-accent-text" aria-hidden="true" />
          {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
        </span>
      </header>

      {loadError ? (
        <div role="alert" className="rounded-xl border border-danger bg-danger-subtle p-4 text-sm font-medium text-danger">
          Tickets could not be loaded. {loadError}
        </div>
      ) : null}

      <section aria-label="Ticket filters" className="grid gap-3 border-y border-border py-4 md:grid-cols-[minmax(0,1fr)_15rem]">
        <Field label="Search tickets" htmlFor="ticket-search">
          <Input id="ticket-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ticket ID, title or project" startIcon={<Search />} />
        </Field>
        <Field label="Filter by status" htmlFor="ticket-status-filter">
          <Select id="ticket-status-filter" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-10">
            <option value="All">All statuses</option>
            {TICKET_STATUS_ORDER.map((option) => <option key={option} value={option}>{TICKET_STATUS_LABELS[option]}</option>)}
          </Select>
        </Field>
      </section>

      {tickets.length === 0 && !loadError ? (
        <EmptyState
          icon={TicketIcon}
          title="No tickets yet"
          description="Create your first ticket from a work log, then manage its updates here."
          action={<Link href="/work-logs" className={buttonVariants({ variant: "primary" })}>Open work logs</Link>}
        />
      ) : visibleTickets.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching tickets"
          description="Try another ticket ID, title, or status."
          action={<Button variant="secondary" onClick={() => { setQuery(""); setStatus("All"); }}>Clear filters</Button>}
        />
      ) : (
        <>
          <div className="lg:hidden">
            <Field label="Selected ticket" htmlFor="mobile-ticket-picker">
              <Select id="mobile-ticket-picker" value={selectedTicket?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} className="h-11">
                <option value="" disabled>Choose a ticket</option>
                {visibleTickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.ticketId} — {ticket.title}</option>)}
              </Select>
            </Field>
          </div>

          <div className="grid min-w-0 items-start gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[19rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-6">
            <aside aria-label="Ticket list" className="hidden min-h-0 overflow-hidden rounded-2xl border border-border bg-card lg:flex lg:flex-col">
              {/* Navy header band — the page's dark anchor, matching the open ticket's header. */}
              <div className="flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-fg">
                <p className="text-sm font-semibold">{status === "All" ? "All tickets" : TICKET_STATUS_LABELS[status]}</p>
                <span className="rounded-full bg-sidebar-accent-bg px-2 py-0.5 text-xs font-semibold tabular-nums">{visibleTickets.length} shown</span>
              </div>
              <div data-reveal-stagger className="wl-scroll min-h-0 flex-1 overflow-y-auto p-2">
                {visibleTickets.map((ticket) => (
                  <TicketListItem key={ticket.id} ticket={ticket} selected={ticket.id === selectedTicket?.id} onSelect={() => setSelectedId(ticket.id)} />
                ))}
              </div>
            </aside>

            {selectedTicket ? (
              <TicketDetailPanel key={selectedTicket.id} ticket={selectedTicket} daysOff={daysOff} onChange={replaceTicket} />
            ) : (
              <div className="hidden min-h-72 items-center justify-center rounded-2xl border border-border bg-card lg:flex lg:h-full">
                <EmptyState
                  className="border-0 bg-transparent shadow-none"
                  icon={TicketIcon}
                  title="Select a ticket"
                  description="Choose a ticket from the list to view its details and history."
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TicketListItem({ ticket, selected, onSelect }: { ticket: TicketBoardItem; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "group mb-1 flex w-full cursor-pointer flex-col gap-2 rounded-xl border px-3 py-3 text-left transition-colors duration-150 last:mb-0",
        selected ? "border-sidebar border-l-4 bg-primary-subtle" : "border-transparent hover:border-border hover:bg-surface",
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <TicketId>{ticket.ticketId}</TicketId>
        <TicketStatusBadge status={ticket.status} />
      </div>
      <span className="line-clamp-2 text-sm font-medium leading-5 text-text">{ticket.title}</span>
      <div className="flex w-full items-center justify-between gap-2">
        {ticket.projectName ? (
          <span className="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-accent-text">
            <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{ticket.projectName}</span>
          </span>
        ) : <span className="text-xs text-text-subtle">No project</span>}
        <span className="shrink-0 text-xs text-text-subtle tabular-nums">{ticket.workLogCount} {ticket.workLogCount === 1 ? "log" : "logs"}</span>
      </div>
    </button>
  );
}

function TicketDetailPanel({ ticket, daysOff, onChange }: {
  ticket: TicketBoardItem;
  /** Holiday / Leave days (YYYY-MM-DD) — not counted as working days. */
  daysOff: string[];
  onChange: (ticketId: string, patch: Partial<Pick<TicketBoardItem, "title" | "projectName" | "status" | "updatedAt">>) => void;
}) {
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState(ticket.status);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState<"body" | null>(null);
  const [message, setMessage] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  // Title and project are read-only here; only the status is a draft.
  const statusChanged = status !== ticket.status;

  useEffect(() => {
    let cancelled = false;
    void getTicket(ticket.id).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error.message);
        return;
      }
      setDetail({
        historyEntries: result.data.historyEntries.map((entry) => ({ id: entry.id, body: entry.body, status: entry.status, createdAt: entry.createdAt.toISOString() })),
        updates: result.data.updates.map((update) => ({
          id: update.id,
          description: update.description,
          status: update.status,
          createdAt: update.createdAt.toISOString(),
          workLog: update.workLog ? { id: update.workLog.id, title: update.workLog.title, date: update.workLog.date.toISOString() } : null,
        })),
      });
    });
    return () => { cancelled = true; };
  }, [ticket.id]);

  const timeline = useMemo(() => {
    if (!detail) return [];
    return [
      ...detail.historyEntries.map((entry) => ({ id: entry.id, kind: "ticket" as const, body: entry.body, status: entry.status, createdAt: entry.createdAt, workLog: null })),
      ...detail.updates.map((entry) => ({ id: entry.id, kind: "worklog" as const, body: entry.description, status: entry.status, createdAt: entry.createdAt, workLog: entry.workLog })),
    ].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
  }, [detail]);

  const journey = useMemo(() => (detail ? ticketJourney(ticket, detail, new Set(daysOff)) : null), [detail, ticket, daysOff]);

  /**
   * The one save: writes the update (if any) with the chosen status, or — with
   * no text — just changes the status. Adding a history entry also sets the
   * ticket's status, so the text + status case is a single call.
   */
  async function saveUpdate() {
    const nextBody = body.trim();
    if ((!nextBody && !statusChanged) || saving) return;
    setSaving("body");
    setMessage(nextBody ? "Saving update…" : "Saving status…");

    // A status-only change is still recorded in the history, so every timeline
    // (here and in work logs) shows when the status moved.
    const entryBody = nextBody || `Status changed from ${TICKET_STATUS_LABELS[ticket.status]} to ${TICKET_STATUS_LABELS[status]}.`;
    const result = await appendTicketHistoryEntry({ ticketId: ticket.id, body: entryBody, status });
    setSaving(null);
    if (!result.ok) {
      setMessage(result.error.message);
      toast.error("Ticket update was not saved", { description: result.error.message });
      return;
    }
    const entry = result.data.entry;
    setDetail((current) => current ? {
      ...current,
      historyEntries: [{ id: entry.id, body: entry.body, status: entry.status, createdAt: entry.createdAt.toISOString() }, ...current.historyEntries],
    } : current);
    setBody("");
    setStatus(result.data.ticket.status);
    onChange(ticket.id, { status: result.data.ticket.status, updatedAt: result.data.ticket.updatedAt.toISOString() });
    setMessage(nextBody ? "Update saved to ticket history. Work logs are unchanged." : "Status changed and recorded in the history.");
    toast.success(nextBody ? "Update saved" : "Status updated");
  }

  async function deleteHistoryEntry() {
    if (!deleteTargetId) return;
    const result = await deleteTicketHistoryEntry({ ticketId: ticket.id, entryId: deleteTargetId });
    if (!result.ok) {
      setMessage(result.error.message);
      toast.error("Ticket update was not deleted", { description: result.error.message });
      return;
    }
    setDetail((current) => current ? {
      ...current,
      historyEntries: current.historyEntries.filter((entry) => entry.id !== deleteTargetId),
    } : current);
    setDeleteTargetId(null);
    setMessage("Ticket update deleted. Work-log history is unchanged.");
    toast.success("Ticket update deleted");
  }

  return (
    <article aria-labelledby={`ticket-heading-${ticket.id}`} className="wl-scroll min-w-0 overflow-hidden rounded-2xl border border-border bg-card lg:h-full lg:overflow-y-auto">
      {/* Navy header: the ticket you're looking at is the darkest thing on the page. */}
      <header className="bg-sidebar px-5 py-5 text-sidebar-fg md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TicketId className="text-sidebar-fg">{ticket.ticketId}</TicketId>
              {/* A ring keeps the navy "Released" badge visible on the navy band. */}
              <TicketStatusBadge status={ticket.status} className="ring-1 ring-sidebar-subtle" />
            </div>
            <h2 id={`ticket-heading-${ticket.id}`} className="mt-2 text-2xl font-semibold tracking-tight text-balance">{ticket.title}</h2>
            {ticket.projectName ? <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-sidebar-muted"><Building2 className="size-4" aria-hidden="true" />{ticket.projectName}</p> : null}
          </div>
          <div className="shrink-0 text-sm text-sidebar-muted md:text-right">
            <p>{ticket.workLogCount} {ticket.workLogCount === 1 ? "work log" : "work logs"}</p>
            <time dateTime={ticket.updatedAt}>Updated {formatTicketDate(ticket.updatedAt)}</time>
          </div>
        </div>
      </header>

      {journey ? <TicketJourney journey={journey} /> : null}

      <div className="flex min-w-0 flex-col gap-7 p-5 md:p-6">
        <section aria-labelledby={`add-update-heading-${ticket.id}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 id={`add-update-heading-${ticket.id}`} className="text-lg font-semibold text-text">Add a ticket update</h3>
              <p className="mt-1 max-w-[62ch] text-sm leading-6 text-text-muted">
                Change the status, write an update, or both — then save once. Each update becomes a history entry; work-log notes stay protected.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-success-subtle px-3 py-1.5 text-xs font-semibold text-success">
              <ShieldCheck className="size-4" aria-hidden="true" />Protected work-log history
            </span>
          </div>
          <div className="mt-4 grid gap-4">
            <Field label="Status" htmlFor={`ticket-status-${ticket.id}`} className="md:w-72">
              <Select id={`ticket-status-${ticket.id}`} value={status} disabled={saving !== null} onChange={(event) => { setStatus(event.target.value as WorkflowStatus); setMessage(""); }} className="h-10">
                {TICKET_STATUS_ORDER.map((option) => <option key={option} value={option}>{TICKET_STATUS_LABELS[option]}</option>)}
              </Select>
            </Field>
            <Field label="Update details" htmlFor={`ticket-body-${ticket.id}`} hint="Optional when you're only changing the status.">
              <MarkdownEditor
                id={`ticket-body-${ticket.id}`}
                value={body}
                onChange={(value) => { setBody(value); setMessage(""); }}
                ariaLabel="Ticket update details"
                minHeight="min-h-32"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p role="status" aria-live="polite" className="text-xs text-text-subtle">
              {message || (statusChanged ? `Status will change: ${TICKET_STATUS_LABELS[ticket.status]} → ${TICKET_STATUS_LABELS[status]}` : `Current status: ${TICKET_STATUS_LABELS[ticket.status]}`)}
            </p>
            <Button className="md:min-w-40" disabled={(!body.trim() && !statusChanged) || saving !== null} loading={saving !== null} onClick={() => void saveUpdate()}>
              Save
            </Button>
          </div>
        </section>

        <section aria-labelledby={`history-heading-${ticket.id}`} className="border-t border-border pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><History className="size-4 text-accent-text" aria-hidden="true" /><h3 id={`history-heading-${ticket.id}`} className="text-lg font-semibold text-text">Ticket history</h3></div>
            {detail ? <span className="text-xs text-text-subtle">{timeline.length} {timeline.length === 1 ? "entry" : "entries"}</span> : null}
          </div>

          {loadError ? (
            <div role="alert" className="mt-4 rounded-xl border border-danger bg-danger-subtle p-4 text-sm font-medium text-danger">History could not be loaded. {loadError}</div>
          ) : !detail ? (
            <div className="mt-4 flex min-h-32 items-center justify-center rounded-xl bg-surface text-sm text-text-muted"><Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />Loading history…</div>
          ) : timeline.length === 0 ? (
            <div className="mt-4 rounded-xl bg-surface p-5 text-sm text-text-muted">No history yet. Add the first update above.</div>
          ) : (
            <ol className="mt-5 space-y-5">
              {timeline.map((entry, index) => (
                <li key={`${entry.kind}-${entry.id}`} className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-3">
                  <div className="relative flex justify-center">
                    {index < timeline.length - 1 ? <span className="absolute top-4 bottom-[-1.25rem] w-px bg-border" aria-hidden="true" /> : null}
                    <span className={cn("relative mt-1.5 size-2.5 rounded-full ring-4 ring-surface", entry.kind === "ticket" ? "bg-primary" : "bg-text-subtle")} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 rounded-xl border border-border bg-surface p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{entry.kind === "ticket" ? "Ticket update" : "Work log"}</span>
                        <TicketStatusBadge status={entry.status} />
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <time dateTime={entry.createdAt} className="text-xs text-text-subtle">{formatTimelineDate(entry.createdAt)}</time>
                        {entry.kind === "ticket" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger-subtle hover:text-danger"
                            aria-label={`Delete ticket update from ${formatTimelineDate(entry.createdAt)}`}
                            onClick={() => setDeleteTargetId(entry.id)}
                          >
                            <Trash2 aria-hidden="true" />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {entry.body.trim() ? <MarkdownContent value={entry.body} className="mt-3 text-sm leading-6 text-text" /> : <p className="mt-3 text-sm italic text-text-subtle">No written update.</p>}
                    {entry.workLog ? (
                      <Link href={`/work-logs/${entry.workLog.id}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent-text hover:underline">
                        <CalendarDays className="size-4" aria-hidden="true" />
                        {entry.workLog.title} · {formatTicketDate(entry.workLog.date)}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <ConfirmationDialog
        open={deleteTargetId !== null}
        title="Delete this ticket update?"
        description="This direct ticket update will be permanently removed. The current ticket status and work-log entries will not change."
        confirmLabel="Delete update"
        destructive
        onConfirm={deleteHistoryEntry}
        onCancel={() => setDeleteTargetId(null)}
      />
    </article>
  );
}

function formatTicketDate(value: string) {
  return format(new Date(value), "d MMM yyyy");
}

function formatTimelineDate(value: string) {
  return format(new Date(value), "d MMM yyyy, h:mm a");
}


// ---------------------------------------------------------------------------
// Ticket timeline — when each stage was first reached and how long it took.
// ---------------------------------------------------------------------------

type Journey = {
  stages: Array<{ status: WorkflowStatus; date: Date | null }>;
  start: Date;
  end: Date;
  done: boolean;
  workingDays: number;
  /** Holiday / Leave days inside the span that were not counted. */
  daysOffSkipped: number;
};

function dayOf(value: string | Date) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Weekdays from start to end (inclusive), minus days marked Holiday / Leave. */
function countWorkingDays(start: Date, end: Date, daysOff: Set<string>) {
  let working = 0;
  let skipped = 0;
  for (let day = new Date(start); day <= end; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    if (daysOff.has(format(day, "yyyy-MM-dd"))) skipped += 1;
    else working += 1;
  }
  return { working, skipped };
}

/**
 * Start = the first time the ticket was In Progress (else when it was created);
 * end = the first time it reached Done (else today, still open). Work-log
 * updates count on their work log's date; direct updates on when they were written.
 */
function ticketJourney(ticket: TicketBoardItem, detail: TicketDetail, daysOff: Set<string>): Journey {
  const events = [
    ...detail.updates.map((entry) => ({ status: entry.status, date: dayOf(entry.workLog?.date ?? entry.createdAt) })),
    ...detail.historyEntries.map((entry) => ({ status: entry.status, date: dayOf(entry.createdAt) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const firstReached = (status: WorkflowStatus) => events.find((event) => event.status === status)?.date ?? null;
  const created = dayOf(ticket.createdAt);
  const start = firstReached("InProgress") ?? created;
  const doneAt = events.find((event) => event.status === "Done" && event.date >= start)?.date ?? null;
  const end = doneAt ?? dayOf(new Date());

  const { working, skipped } = countWorkingDays(start, end, daysOff);
  return {
    stages: TICKET_STATUS_ORDER.map((status) => ({ status, date: status === "InProgress" ? start : firstReached(status) })),
    start,
    end,
    done: doneAt !== null,
    workingDays: working,
    daysOffSkipped: skipped,
  };
}

function TicketJourney({ journey }: { journey: Journey }) {
  const reachedIndex = journey.stages.reduce((last, stage, index) => (stage.date ? index : last), 0);
  return (
    <section aria-label="Ticket timeline" className="mx-5 mb-1 mt-4 rounded-xl border border-border bg-surface p-4 md:mx-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text"><CalendarDays className="size-4 text-accent-text" aria-hidden="true" />Ticket timeline</h3>
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", journey.done ? "bg-status-completed-bg text-status-completed-fg ring-1 ring-inset ring-status-completed/50" : "bg-status-progress-bg text-status-progress-fg ring-1 ring-inset ring-status-progress/40")}>
          {journey.done ? "Done in" : "Open for"} {journey.workingDays} {journey.workingDays === 1 ? "day" : "days"}
        </span>
      </div>
      <ol className="grid grid-cols-5 gap-1">
        {journey.stages.map((stage, index) => {
          const reached = stage.date !== null;
          return (
            <li key={stage.status} className="relative flex min-w-0 flex-col items-center text-center">
              {index > 0 ? <span aria-hidden="true" className={cn("absolute top-2 right-1/2 h-0.5 w-full -translate-y-1/2", index <= reachedIndex ? "bg-primary" : "bg-border")} /> : null}
              <span aria-hidden="true" className={cn("relative z-10 size-4 rounded-full border-2", reached ? cn("border-transparent", TICKET_STATUS_DOT[stage.status]) : "border-border-strong bg-surface")} />
              <span className={cn("mt-2 text-xs font-semibold leading-tight", reached ? "text-text" : "text-text-subtle")}>{TICKET_STATUS_LABELS[stage.status]}</span>
              <span className="mt-0.5 text-xs text-text-muted tabular-nums">{stage.date ? format(stage.date, "d MMM") : "—"}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-text-muted">
        Started {format(journey.start, "EEE d MMM")} {journey.done ? `· Done ${format(journey.end, "EEE d MMM")}` : "· not done yet"}
        {journey.daysOffSkipped > 0 ? ` · ${journey.daysOffSkipped} holiday/leave ${journey.daysOffSkipped === 1 ? "day" : "days"} not counted` : ""}
      </p>
    </section>
  );
}
