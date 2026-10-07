import "server-only";

import { TICKET_STATUS_LABELS } from "@/components/ui/ticket-status-badge";
import type { DayType } from "@/components/work-log/day-type";
import type { WorkflowStatus } from "@/lib/workflow-status";

/**
 * Prepares one work log for the AI summariser (lib/ai-summary.ts): whether it has
 * anything to summarise, and the plain text the model reads. There is no non-AI
 * summary — the user asked for AI or nothing.
 */

export type SummaryInput = {
  dayType: DayType;
  learningNotes: string;
  meetings: Array<{ name: string; notes: string }>;
  ticketUpdates: Array<{
    description: string;
    status: WorkflowStatus;
    ticket: { ticketId: string; title: string; projectName: string | null };
  }>;
  attachmentCount: number;
  ticketsEnabled: boolean;
  /** Tracker to-dos as they stood that day (same split as the detail page's To-dos card). */
  todos?: { completed: string[]; overdue: string[] };
};

/** True when there's anything worth summarising (drives the one-time auto-generate). */
export function workLogHasContent(log: SummaryInput): boolean {
  if (log.dayType !== "Work") return false;
  return Boolean(
    log.learningNotes.trim() ||
      log.meetings.some((meeting) => meeting.notes.trim()) ||
      log.todos?.completed.length ||
      log.todos?.overdue.length ||
      (log.ticketsEnabled && log.ticketUpdates.length),
  );
}

/** The whole log as plain text — what the AI summariser reads. Unclipped. */
export function workLogAsText(log: SummaryInput): string {
  const tickets = log.ticketsEnabled ? log.ticketUpdates : [];
  return [
    tickets.length
      ? `Tickets\n${tickets
          .map((u) => `- ${u.ticket.ticketId} ${u.ticket.title}${u.ticket.projectName ? ` (${u.ticket.projectName})` : ""} [${TICKET_STATUS_LABELS[u.status]}]${u.description.trim() ? `\n  ${u.description.trim().replace(/\n/g, "\n  ")}` : ""}`)
          .join("\n")}`
      : "",
    log.meetings.filter((m) => m.notes.trim()).map((m) => `Meeting: ${m.name}\n${m.notes.trim()}`).join("\n\n"),
    log.learningNotes.trim() ? `Work done\n${log.learningNotes.trim()}` : "",
    log.todos?.completed.length ? `To-dos completed that day\n${log.todos.completed.map((t) => `- ${t}`).join("\n")}` : "",
    log.todos?.overdue.length ? `To-dos overdue / not done by end of day\n${log.todos.overdue.map((t) => `- ${t}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
