import { CalendarDays, ChevronDown, History, Plane, Sun } from "lucide-react";
import Link from "next/link";
import { addDays, format, isSameDay, isWeekend, startOfDay } from "date-fns";

import { listWorkLogs } from "@/actions/worklog";
import { getSprint, type SprintConfig } from "@/lib/sprint";
import { requireUserId } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";
import { CreateDayTile } from "@/components/work-log/create-day-tile";
import { DayStamp } from "@/components/work-log/day-stamp";
import { DEFAULT_TITLE } from "@/components/work-log/day-type";
import { CreateWorkLogForm } from "@/components/work-log/create-work-log-form";
import { cn } from "@/components/cn";
import { PageHeader } from "@/components/shell/page-header";

export const metadata = { title: "Work Logs" };

type Period = {
  offset: number;
  start: Date;
  end: Date;
  logs: WorkLogListItem[];
};

type WorkLogListItem = {
  id: string;
  title: string;
  dayType: "Work" | "Holiday" | "Leave";
  date: Date;
  updatedAt: Date;
  _count: { meetings: number; ticketUpdates: number };
  ticketUpdates: Array<{ id: string; ticket: { ticketId: string; title: string } }>;
};

/** Auto-generated titles ("Daily Work Log", …) aren't shown on tiles. */
const AUTO_TITLES = new Set<string>(Object.values(DEFAULT_TITLE));

/** The sprint calendar lives in `lib/sprint.ts` — do not re-derive it here. */
function buildPeriods(logs: WorkLogListItem[], sprint: SprintConfig) {
  const getPeriod = (date: Date) => getSprint(date, sprint);
  const grouped = new Map<number, Period>();

  for (const log of logs) {
    const period = getPeriod(log.date);
    const existing = grouped.get(period.offset);
    grouped.set(period.offset, {
      offset: period.offset,
      start: period.start,
      end: period.end,
      logs: existing ? [...existing.logs, log] : [log],
    });
  }

  const offsets = [...grouped.keys()];
  const latestOffset = offsets.length ? Math.max(...offsets) : 0;
  const earliestOffset = offsets.length ? Math.min(...offsets) : 0;

  // Keep gaps visible so the sprint schedule stays truthful even when a period
  // had no work log. The extra final period keeps the next sprint calculated.
  for (let offset = earliestOffset; offset <= latestOffset + 1; offset += 1) {
    if (grouped.has(offset)) continue;
      const period = getPeriod(addDays(sprint.anchor, offset * sprint.days));
    grouped.set(offset, {
      offset,
      start: period.start,
      end: period.end,
      logs: [],
    });
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, period]) => period);
}

export default async function WorkLogsPage() {
  const [result, settings] = await Promise.all([listWorkLogs({ take: 50 }), requireUserId().then(getUserSettings)]);
  const sprint = settings.sprint;
  const logs = result.ok ? result.data.items : [];
  const weekdayLogs = logs.filter((log) => !isWeekend(log.date));
  const periods = buildPeriods(weekdayLogs, sprint);
  // One `today` for the whole render, so the accent marker cannot land on two
  // different days if the render straddles midnight.
  const today = startOfDay(new Date());
  const currentOffset = getSprint(today, sprint).offset;
  const currentPeriod = periods.find((period) => period.offset === currentOffset);
  // Older sprints stay collapsed until asked for; only ones with logs are listed.
  const todaySummary = { day: format(today, "d"), weekday: format(today, "EEEE"), monthYear: format(today, "MMMM yyyy") };
  const previousPeriods = periods.filter((period) => period.offset < currentOffset && period.logs.length > 0);

  return (
    <div className="work-logs-page">
      <PageHeader
        title="Work Logs"
        description="Capture the day once, then revisit it as a clean timeline."
      />

      <div className="flex flex-col gap-4">
        <CreateWorkLogForm existingLogs={logs.map((log) => ({ id: log.id, date: format(log.date, "yyyy-MM-dd") }))} today={todaySummary} />

        <section aria-labelledby="work-log-periods-heading" className="wl-card flex min-w-0 flex-col gap-4 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="work-log-periods-heading" className="text-lg font-semibold tracking-[-0.015em] text-text">Sprint timeline</h2>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-text-muted" aria-label="Legend">
              <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />Today</li>
              <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-primary bg-card-tint" aria-hidden="true" />Logged</li>
              <li className="inline-flex items-center gap-1.5"><span className="wl-off size-3 rounded-full border border-accent-text/45" aria-hidden="true" />Holiday / leave</li>
              <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-dashed border-border-strong" aria-hidden="true" />Not logged</li>
            </ul>
          </div>
          {currentPeriod ? <SprintTable period={currentPeriod} currentOffset={currentOffset} today={today} sprintDays={sprint.days} showTickets={settings.ticketsEnabled} /> : null}

          {previousPeriods.length > 0 ? (
            <details className="motion-disclosure group/disclosure mt-2 border-t border-border pt-4">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-full border border-border-strong px-4 py-2 text-sm font-semibold text-accent-text transition-colors hover:border-primary hover:bg-primary-subtle [&::-webkit-details-marker]:hidden">
                <History className="size-4" aria-hidden="true" />
                <span className="group-open/disclosure:hidden">Show previous sprints</span>
                <span className="hidden group-open/disclosure:inline">Hide previous sprints</span>
                <span className="rounded-full bg-sidebar px-2 py-0.5 text-xs text-sidebar-fg tabular-nums">{previousPeriods.length}</span>
                <ChevronDown className="size-4 transition-transform group-open/disclosure:rotate-180" aria-hidden="true" />
              </summary>
              <div className="motion-disclosure-content mt-5 flex flex-col gap-8">
                {previousPeriods.map((period) => <SprintTable key={period.start.toISOString()} period={period} currentOffset={currentOffset} today={today} sprintDays={sprint.days} showTickets={settings.ticketsEnabled} />)}
              </div>
            </details>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/**
 * One sprint as a calendar: its ten weekdays in a 2 × 5 grid (the sprint
 * starts mid-week, so tiles carry their own weekday instead of column heads).
 * Logged days link to the log; today is filled teal; missed days are dashed;
 * days still ahead are faded.
 */
function SprintTable({ period, currentOffset, today, sprintDays, showTickets }: { period: Period; currentOffset: number; today: Date; sprintDays: number; showTickets: boolean }) {
  const isCurrent = period.offset === currentOffset;
  const byDay = new Map(period.logs.map((log) => [format(log.date, "yyyy-MM-dd"), log]));
  const days = Array.from({ length: sprintDays }, (_, index) => addDays(period.start, index)).filter((day) => !isWeekend(day));
  const elapsed = days.filter((day) => day <= today).length;
  const logged = days.filter((day) => byDay.has(format(day, "yyyy-MM-dd"))).length;
  const progress = days.length ? Math.round((logged / days.length) * 100) : 0;

  return (
    <div className="motion-page-enter min-w-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-text">
          <CalendarDays className="size-4 text-primary" aria-hidden="true" />
          {format(period.start, "d MMM")} – {format(period.end, "d MMM yyyy")}
          {isCurrent ? <span className="rounded-full bg-sidebar px-2 py-0.5 text-xs font-semibold text-sidebar-fg">Current</span> : null}
        </h3>
        <div className="flex min-w-48 flex-col items-end gap-1.5">
          <span className="text-sm font-medium text-text-muted tabular-nums">
            <strong className="font-bold text-text">{logged}</strong> of {days.length} days accounted for{isCurrent ? ` · ${days.length - elapsed} to go` : ""}
          </span>
          <span className="h-1.5 w-48 overflow-hidden rounded-full bg-card-navy" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Sprint days logged">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </span>
        </div>
      </div>

      <ol data-reveal-stagger className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {days.map((day, index) => {
          const isToday = isSameDay(day, today);
          const future = day > today && !isToday;
          // Future days can't be logged, so they never show (or link to) content.
          const log = future ? undefined : byDay.get(format(day, "yyyy-MM-dd"));
          // Only today's work log is a filled teal tile, so only it gets light text.
          const filled = isToday && log?.dayType === "Work";
          const dateLabel = (
            <DayStamp day={format(day, "d")} weekday={format(day, "EEEE")} month={format(day, "MMM")} tone={filled ? "inverse" : future ? "faded" : "default"} />
          );

          if (log && log.dayType !== "Work") {
            const holiday = log.dayType === "Holiday";
            const DayIcon = holiday ? Sun : Plane;
            return (
              <li key={day.toISOString()} className="min-w-0">
                <Link
                  href={`/work-logs/${log.id}`}
                  aria-label={`${format(day, "EEEE d MMMM")}: ${holiday ? "Holiday" : "Leave"} — view timeline`}
                  className={cn(
                    "wl-off group flex h-full min-h-28 flex-col gap-2 rounded-xl p-3 hover:-translate-y-0.5 hover:shadow-lg transition-[border-color,transform,box-shadow] duration-150 hover:border-sidebar",
                    isToday ? "border-2 border-primary" : "border border-accent-text/45",
                  )}
                >
                  {dateLabel}
                  <span className="mt-auto flex items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sidebar text-sidebar-fg">
                      <DayIcon className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-semibold text-accent-text">{holiday ? "Holiday" : "Leave"}</span>
                    {isToday ? <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-2xs font-bold text-accent-text">Today</span> : null}
                  </span>
                </Link>
              </li>
            );
          }

          if (log) {
            const tickets = log.ticketUpdates;
            return (
              <li key={day.toISOString()} className="relative min-w-0 hover:z-10 focus-within:z-10">
                <Link
                  href={`/work-logs/${log.id}`}
                  aria-label={`${format(day, "EEEE d MMMM")}: ${log.title}, ${tickets.length} ${tickets.length === 1 ? "ticket" : "tickets"} — view timeline`}
                  className={cn(
                    "group relative flex h-full min-h-28 flex-col gap-2 rounded-xl border p-3 hover:-translate-y-0.5 hover:shadow-lg transition-[border-color,background-color,transform,box-shadow] duration-150",
                    isToday ? "border-primary bg-primary text-primary-fg hover:bg-primary-hover" : "border-border bg-card-tint hover:border-primary hover:bg-surface focus-visible:border-primary focus-visible:bg-surface",
                  )}
                >
                  {dateLabel}
                  {AUTO_TITLES.has(log.title) ? null : <span className={cn("line-clamp-2 text-sm font-semibold", isToday ? "text-primary-fg" : "text-text group-hover:text-accent-text")}>{log.title}</span>}
                  {isToday ? <span className="mt-auto ml-auto rounded-full bg-surface px-2 py-0.5 text-2xs font-bold text-accent-text">Today</span> : null}

                  {showTickets && tickets.length > 0 ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none invisible absolute top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] translate-y-1 rounded-xl border border-border bg-surface p-3 text-left opacity-0 shadow-lg",
                        "transition-[opacity,translate,visibility] duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:visible group-focus-visible:translate-y-0 group-focus-visible:opacity-100",
                        // Open toward the middle of the grid so edge columns stay on screen.
                        index % 2 === 1 ? "right-0" : "left-0",
                        index % 5 >= 3 ? "md:left-auto md:right-0" : "md:right-auto md:left-0",
                      )}
                    >
                      <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.08em] text-text-subtle">
                        {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
                      </span>
                      <span className="flex flex-col divide-y divide-border">
                        {tickets.map(({ id, ticket }) => (
                          <span key={id} className="flex min-w-0 items-baseline gap-2 py-1.5">
                            <span className="shrink-0 text-xs font-semibold text-accent-text tabular-nums">{ticket.ticketId}</span>
                            <span className="truncate text-sm text-text">{ticket.title}</span>
                          </span>
                        ))}
                      </span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          }

          if (!future) {
            return (
              <li key={day.toISOString()} className="min-w-0">
                <CreateDayTile date={format(day, "yyyy-MM-dd")} weekday={format(day, "EEEE")} day={format(day, "d")} month={format(day, "MMM")} longLabel={format(day, "EEEE d MMMM")} isToday={isToday} />
              </li>
            );
          }

          return (
            <li key={day.toISOString()} className="flex min-h-28 cursor-default select-none flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3 opacity-60">
              {dateLabel}
              <span className="mt-auto text-xs font-medium text-text-subtle">Upcoming</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
