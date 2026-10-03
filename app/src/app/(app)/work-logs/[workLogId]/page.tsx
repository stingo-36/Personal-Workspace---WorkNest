import { format } from "date-fns";
import { Briefcase, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, FolderKanban, Link2, Pencil, Plane, Sun } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { listTodosForDay } from "@/actions/follow-ups";
import { getTicket } from "@/actions/tickets";
import { getAdjacentWorkLogs, getWorkLog } from "@/actions/worklog";
import { cn } from "@/components/cn";
import { TICKET_STATUS_LABELS, TicketStatusBadge } from "@/components/ui/ticket-status-badge";
import { attachmentHref, formatBytes } from "@/components/work-log/attachment-utils";
import { CopyLogButton } from "@/components/work-log/copy-log-button";
import { DayTodos } from "@/components/work-log/day-todos";
import { DAY_LABEL, DEFAULT_TITLE } from "@/components/work-log/day-type";
import { MarkdownContent } from "@/components/work-log/markdown-editor";
import type { HistoryEntry } from "@/components/work-log/types";
import { WorkLogGlance } from "@/components/work-log/work-log-glance";
import { WorkLogSummary } from "@/components/work-log/work-log-summary";
import { getAiSettings } from "@/lib/ai-settings";
import { requireUser } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";

export const metadata = { title: "Work Log" };

const AUTO_TITLES = new Set<string>(Object.values(DEFAULT_TITLE));
const DAY_ICON = { Work: Briefcase, Holiday: Sun, Leave: Plane } as const;

export default async function WorkLogViewPage({ params }: { params: Promise<{ workLogId: string }> }) {
  const { workLogId } = await params;
  const [result, adjacentResult, user] = await Promise.all([getWorkLog(workLogId), getAdjacentWorkLogs(workLogId), requireUser()]);
  if (!result.ok) notFound();
  const data = result.data;
  const [{ ticketsEnabled }, ai] = await Promise.all([getUserSettings(user.id), getAiSettings(user.id)]);

  // Full history per ticket (work-log updates + direct ticket updates), newest first.
  const histories = await Promise.all(data.ticketUpdates.map(async (update): Promise<HistoryEntry[]> => {
    const ticket = await getTicket(update.ticket.id);
    if (!ticket.ok) return [];
    return [
      ...ticket.data.updates.map((entry) => ({ id: entry.id, description: entry.description, status: entry.status, createdAt: new Date(entry.createdAt), updatedAt: new Date(entry.updatedAt), workLog: entry.workLog ? { id: entry.workLog.id, title: entry.workLog.title, date: new Date(entry.workLog.date) } : null })),
      ...ticket.data.historyEntries.map((entry) => ({ id: entry.id, description: entry.body, status: entry.status, createdAt: new Date(entry.createdAt), updatedAt: new Date(entry.createdAt), workLog: null })),
    ].sort((a, b) => (b.workLog?.date ?? b.createdAt).getTime() - (a.workLog?.date ?? a.createdAt).getTime() || b.createdAt.getTime() - a.createdAt.getTime());
  }));

  const date = new Date(data.date);
  // WorkLog.date is UTC midnight, so its ISO prefix is the calendar day.
  const dayIso = date.toISOString().slice(0, 10);
  const todosResult = await listTodosForDay({ date: dayIso });
  const dayTodos = todosResult.ok
    ? todosResult.data.map((todo) => ({
        ...todo,
        dueDate: todo.dueDate ? todo.dueDate.toISOString().slice(0, 10) : null,
        completedAt: todo.completedAt?.toISOString() ?? null,
      }))
    : [];
  const createdAt = new Date(data.createdAt);
  const updatedAt = new Date(data.updatedAt);
  const customTitle = AUTO_TITLES.has(data.title) ? null : data.title;
  const DayIcon = DAY_ICON[data.dayType];
  const isWork = data.dayType === "Work";

  const tickets = data.ticketUpdates.map((update, index) => ({
    id: update.ticket.id,
    ticketKey: update.ticket.ticketId,
    title: update.ticket.title,
    projectName: update.ticket.projectName,
    status: update.ticket.status,
    updatedAt: new Date(update.ticket.updatedAt),
    draft: { description: update.description, status: update.status },
    history: histories[index],
  }));
  const meetings = [...data.meetings].sort((a, b) => a.order - b.order);
  const meetingsNoted = meetings.filter((meeting) => meeting.notes.trim()).length;
  const learning = data.learningNotes.trim();
  const attachments = data.attachments;

  const adjacent = adjacentResult.ok ? adjacentResult.data : { previous: null, next: null };
  const displayName = user.name ?? user.email ?? "You";
  const initials = displayName.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  // Plain-text version for "Copy as text".
  const copyText = [
    `${format(date, "EEEE, d MMMM yyyy")}${customTitle ? ` — ${customTitle}` : ""}`,
    isWork ? "" : `Day type: ${DAY_LABEL[data.dayType]}`,
    ticketsEnabled && tickets.length ? `\nTickets\n${tickets.map((ticket) => `- ${ticket.ticketKey} ${ticket.title}${ticket.projectName ? ` (${ticket.projectName})` : ""} [${TICKET_STATUS_LABELS[ticket.draft.status]}]${ticket.draft.description.trim() ? `\n  ${ticket.draft.description.trim().replace(/\n/g, "\n  ")}` : ""}`).join("\n")}` : "",
    meetingsNoted ? `\nMeetings\n${meetings.filter((meeting) => meeting.notes.trim()).map((meeting) => `${meeting.name}\n${meeting.notes.trim()}`).join("\n\n")}` : "",
    learning ? `\nWork done\n${learning}` : "",
    attachments.length ? `\nLinks & files\n${attachments.map((item) => `- ${item.name}${item.kind === "Link" && item.url ? `: ${item.url}` : ""}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  return (
    <div className="work-logs-page work-log-detail-page flex flex-col gap-5">
      {/* Header */}
      <header className="wl-card wl-hero motion-page-enter flex flex-col gap-3 px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/work-logs" className="inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
            <ChevronLeft className="size-4" aria-hidden="true" />All work logs
          </Link>
          <nav aria-label="Other work logs" className="flex items-center gap-1.5">
            <AdjacentLink log={adjacent.previous} direction="previous" />
            <AdjacentLink log={adjacent.next} direction="next" />
          </nav>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
              <time dateTime={format(date, "yyyy-MM-dd")}>{format(date, customTitle ? "EEEE, d MMMM yyyy" : "yyyy")}</time>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 normal-case tracking-normal text-text">
                <DayIcon className="size-3.5" aria-hidden="true" />{DAY_LABEL[data.dayType]}
              </span>
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-text">{customTitle ?? format(date, "EEEE, d MMMM")}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
              <span className="wl-solid grid size-6 place-items-center rounded-full bg-surface text-2xs font-bold text-accent-text" aria-hidden="true">{initials}</span>
              <span className="font-medium text-text">{displayName}</span>
              <span aria-hidden="true">·</span>
              <span>Last edited <time dateTime={updatedAt.toISOString()}>{format(updatedAt, "d MMM yyyy, h:mm a")}</time></span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <CopyLogButton text={copyText} />
            <Link href={`/work-logs/${data.id}/edit`} className="wl-solid inline-flex h-10 items-center gap-2 rounded-full bg-surface px-5 text-sm font-semibold text-accent-text shadow-sm transition-colors duration-150 hover:bg-surface-2">
              <Pencil className="size-4" aria-hidden="true" />Edit log
            </Link>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          <WorkLogSummary
            workLogId={data.id}
            // Summaries without a model were built by code before AI-only (2026-10-02); not shown.
            summary={data.summaryModel ? data.summary : null}
            model={data.summaryModel}
            generatedAt={data.summaryModel && data.summaryGeneratedAt ? new Date(data.summaryGeneratedAt).toISOString() : null}
            updatedAt={updatedAt.toISOString()}
            hasContent={isWork && Boolean(learning || meetingsNoted || (ticketsEnabled && tickets.length))}
            aiOn={ai.keySource !== null}
          />

          {!isWork ? (
            <section className="wl-card wl-off flex flex-col items-start gap-2 p-6 md:p-8">
              <span className="grid size-11 place-items-center rounded-xl bg-sidebar text-sidebar-fg" aria-hidden="true"><DayIcon className="size-5" /></span>
              <h2 className="mt-2 text-xl font-semibold text-text">This day was marked as {data.dayType === "Holiday" ? "a holiday" : "leave"}.</h2>
              <p className="text-sm text-text-muted">No meetings or ticket work were logged. Change the day type from “Edit log” if that’s wrong.</p>
            </section>
          ) : (
            <>
              {ticketsEnabled ? (
              <Card id="tickets-heading" title="Ticket work" count={tickets.length}>
                {tickets.length === 0 ? (
                  <Empty>No tickets in this log.</Empty>
                ) : (
                  <ol className="divide-y divide-border">
                    {tickets.map((ticket) => (
                      <li key={ticket.id} id={`ticket-card-${ticket.ticketKey}`} className="grid gap-2 px-4 py-4 md:grid-cols-[7rem_minmax(0,1fr)] md:gap-4 md:px-6 md:py-5">
                        <span className="font-mono text-sm font-semibold text-text-muted">#{ticket.ticketKey}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h3 className="min-w-0 text-base font-semibold text-text">{ticket.title}</h3>
                            <TicketStatusBadge status={ticket.draft.status} />
                          </div>
                          {ticket.projectName ? <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-text-muted"><FolderKanban className="size-3.5" aria-hidden="true" />{ticket.projectName}</p> : null}
                          {ticket.draft.description.trim() ? (
                            <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3">
                              <MarkdownContent value={ticket.draft.description} className="text-text" />
                            </div>
                          ) : (
                            <p className="mt-3 rounded-xl border border-dashed border-border-strong px-4 py-3 text-sm text-text-muted">No update written for this ticket.</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
              ) : null}

              <Card id="meetings-heading" title="Meeting notes" count={`${meetingsNoted} of ${meetings.length}`}>
                <ol className="divide-y divide-border">
                  {meetings.map((meeting) => {
                    const filled = Boolean(meeting.notes.trim());
                    return (
                      <li key={meeting.id} className={cn("grid gap-2 px-4 py-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6 md:px-6", !filled && "bg-surface-2")}>
                        <h3 className={cn("flex items-center gap-2 text-sm font-semibold", filled ? "text-text" : "text-text-muted")}>
                          {filled ? <Check className="size-4 text-primary" strokeWidth={2.5} aria-hidden="true" /> : null}
                          {meeting.name}
                        </h3>
                        {filled ? <MarkdownContent value={meeting.notes} className="text-text" /> : <p className="text-sm text-text-subtle">No notes</p>}
                      </li>
                    );
                  })}
                </ol>
              </Card>

              <Card id="learning-heading" title="Work done">
                <div className="px-4 py-4 md:px-6">
                  {learning ? <MarkdownContent value={data.learningNotes} className="text-text" /> : <p className="text-sm text-text-muted">Nothing added for this day.</p>}
                </div>
              </Card>
            </>
          )}

          {/* From the Tracker: what was ticked off, and what was still overdue, on this day. */}
          <DayTodos date={dayIso} todos={dayTodos} />
        </div>

        <aside aria-label="Log details" className="flex min-w-0 flex-col gap-5">
          <Card id="attachments-heading" title="Attachments & links" count={attachments.length || undefined}>
            {attachments.length === 0 ? (
              <p className="px-4 py-4 text-sm text-text-muted md:px-5">No files or links.</p>
            ) : (
              <ul className="divide-y divide-border">
                {attachments.map((item) => (
                  <li key={item.id}>
                    <a href={attachmentHref(item)} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-2 md:px-5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent-text" aria-hidden="true">
                        {item.kind === "Link" ? <Link2 className="size-4" /> : <FileText className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-text group-hover:text-accent-text">{item.name}</span>
                        <span className="block truncate text-xs text-text-muted">{item.kind === "Link" ? item.url : formatBytes(item.size)}</span>
                      </span>
                      <ExternalLink className="size-4 shrink-0 text-text-subtle group-hover:text-accent-text" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card id="activity-heading" title="Activity">
            <ol className="flex flex-col gap-4 px-4 py-4 md:px-5">
              <Activity label="Log edited" at={updatedAt} strong />
              <Activity label="Log created" at={createdAt} />
            </ol>
          </Card>

          {ticketsEnabled && tickets.length ? <WorkLogGlance workLogId={data.id} tickets={tickets} /> : null}
        </aside>
      </div>
    </div>
  );
}

/** ‹ / › to the neighbouring log's read-only view; dimmed when there is none. */
function AdjacentLink({ log, direction }: { log: { id: string; date: Date } | null; direction: "previous" | "next" }) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const box = "grid size-9 place-items-center rounded-xl border bg-surface transition-colors duration-150";
  if (!log) return <span className={cn(box, "border-border text-text-subtle opacity-50")} aria-hidden="true"><Icon className="size-4" /></span>;
  const label = format(new Date(log.date), "EEEE d MMMM");
  return (
    <Link href={`/work-logs/${log.id}`} aria-label={`${direction === "previous" ? "Previous" : "Next"} work log: ${label}`} title={label} className={cn(box, "border-border-strong text-text hover:bg-surface-2")}>
      <Icon className="size-4" aria-hidden="true" />
    </Link>
  );
}

function Card({ id, title, count, children }: { id: string; title: string; count?: number | string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-reveal className="wl-card overflow-hidden">
      <h2 id={id} className="flex items-center gap-2 border-b border-border px-4 py-4 text-lg font-semibold tracking-[-0.015em] text-text md:px-6">
        {title}
        {count !== undefined ? <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-accent-text tabular-nums">{count}</span> : null}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-5 text-sm text-text-muted md:px-6">{children}</p>;
}

function Activity({ label, at, strong }: { label: string; at: Date; strong?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", strong ? "bg-sidebar" : "bg-border")} aria-hidden="true" />
      <span>
        <span className="block text-sm font-semibold text-text">{label}</span>
        <time dateTime={at.toISOString()} className="block text-xs text-text-muted">{format(at, "d MMM yyyy, h:mm a")}</time>
      </span>
    </li>
  );
}
