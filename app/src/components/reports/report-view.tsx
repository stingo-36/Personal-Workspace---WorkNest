"use client";

import { format } from "date-fns";
import { Check, CircleAlert, Copy, FileText, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { generateReport } from "@/actions/reports";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { parseReport, reportToHtml, reportToText, type ParsedReport } from "@/components/reports/report-format";

type SprintOption = { key: string; label: string; logCount: number; hasReport: boolean };
type Report = { content: string; model: string | null; generatedAt: string };

/**
 * /reports — a "5-15 Report" per sprint in the user's doc format, written on
 * demand by AI (OpenRouter) — no AI, no report: the page says why — and
 * stored. The preview and the copy bar ("Copy for Google Docs" / "Copy as plain text") follow the user's Google Doc layout; the
 * clipboard gets rich HTML with the doc's own styles, so a paste lands as-is.
 */
export function ReportView({ sprintKey, sprints, report, stale, aiOn }: { sprintKey: string; sprints: SprintOption[]; report: Report | null; stale: boolean; aiOn: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<"doc" | "text" | null>(null);
  const parsed = useMemo(() => (report ? parseReport(report.content) : null), [report]);
  const selected = sprints.find((s) => s.key === sprintKey);

  function generate() {
    setError(undefined);
    startTransition(async () => {
      const result = await generateReport({ sprint: sprintKey });
      if (!result.ok) { setError(result.error.message); return; }
      toast.success(report ? "Report regenerated" : "Report generated");
      router.refresh();
    });
  }

  /** "doc" = formatted for Google Docs (rich HTML + text fallback); "text" = plain text only. */
  async function copy(kind: "doc" | "text") {
    if (!parsed) return;
    const plain = reportToText(parsed);
    try {
      if (kind === "doc" && typeof ClipboardItem !== "undefined") {
        const html = reportToHtml(parsed);
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(kind);
      toast.success(kind === "doc" ? "Report copied — paste it into your doc" : "Report copied as plain text");
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader title="Reports" description="A 5-15 report for each sprint, built from your work logs. Copy it straight into your doc." className="mb-0" />

      <section aria-label="Choose a sprint" className="wl-card flex flex-col gap-4 p-4 md:flex-row md:items-end md:p-5">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span id="report-sprint-label" className="text-sm font-semibold text-text">Sprint</span>
          <Select
            id="report-sprint"
            value={sprintKey}
            onChange={(event) => router.push(`/reports?sprint=${event.target.value}`)}
          >
            {sprints.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} · {s.logCount} {s.logCount === 1 ? "log" : "logs"}{s.hasReport ? " · report saved" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant={report ? "secondary" : "primary"} onClick={generate} loading={pending} disabled={!aiOn || !selected?.logCount}>
            {!pending ? <RefreshCw aria-hidden="true" /> : null}
            {pending ? "Generating…" : report ? "Regenerate" : "Generate report"}
          </Button>
        </div>
      </section>

      {!aiOn ? (
        <p role="status" className="wl-card flex items-start gap-2 px-4 py-3 text-sm text-text md:px-5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
          <span>
            Reports are written by AI, and AI isn’t set up. Add your OpenRouter key in{" "}
            <Link href="/profile" className="font-semibold text-accent-text hover:underline">Profile → Account</Link> to generate one.
          </span>
        </p>
      ) : error ? (
        <p role="alert" className="wl-card flex items-start gap-2 px-4 py-3 text-sm text-text md:px-5">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <span>
            {error} Nothing was generated{report ? " — the saved report below is unchanged" : ""}.
            {/Profile/.test(error) ? <> <Link href="/profile" className="font-semibold text-accent-text hover:underline">Open Profile</Link></> : null}
          </span>
        </p>
      ) : null}

      <section aria-labelledby="report-heading" aria-busy={pending} className="wl-card overflow-hidden">
        {report ? (
          <>
            {/* Copy bar: sits on the report so it's the obvious next step after generating. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2 px-5 py-3 md:px-8">
              <h2 id="report-heading" className="text-sm font-semibold text-text">Report</h2>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void copy("text")} disabled={pending || !parsed}>
                  {copied === "text" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied === "text" ? "Copied" : "Copy as plain text"}
                </Button>
                <Button size="sm" onClick={() => void copy("doc")} disabled={pending || !parsed}>
                  {copied === "doc" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied === "doc" ? "Copied" : "Copy for Google Docs"}
                </Button>
              </div>
            </div>
            {parsed ? <ReportDocument report={parsed} /> : null}
            <p className="border-t border-border px-5 py-3 text-xs text-text-muted md:px-8" aria-live="polite">
              AI report · {report.model} · Generated{" "}
              <time dateTime={report.generatedAt}>{format(new Date(report.generatedAt), "d MMM yyyy, h:mm a")}</time>
              {stale ? <span className="font-semibold text-text"> · Logs in this sprint changed since — regenerate to include them.</span> : null}
            </p>
          </>
        ) : (
          <div className="flex flex-col items-start gap-2 px-5 py-8 md:px-8">
            <h2 id="report-heading" className="sr-only">Report</h2>
            <FileText className="size-6 text-accent-text" aria-hidden="true" />
            <p className="text-base font-semibold text-text">
              {pending ? "Writing the report…" : selected?.logCount ? "No report for this sprint yet." : "No work logs in this sprint yet."}
            </p>
            <p className="max-w-[60ch] text-sm text-text-muted">
              {!selected?.logCount
                ? "Log some days first, then come back to generate the report."
                : aiOn
                  ? "Generate one and AI groups the sprint’s tickets, work done and to-dos into Completed This Week and Problems or Blockers."
                  : "Set up AI (above) to generate it."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/** On-screen preview in the doc's layout: centred title, section bands, bold groups, bullets. */
function ReportDocument({ report }: { report: ParsedReport }) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col px-5 py-8 text-text md:px-10 md:py-10">
      <header className="pb-4 text-center">
        <p className="text-2xl font-bold tracking-[-0.01em]">{report.title}</p>
        {report.dates ? <p className="mt-1 text-lg font-bold">{report.dates}</p> : null}
      </header>
      {report.sections.map((section, index) => (
        <section key={index} className="mt-6 flex flex-col gap-5">
          {section.heading ? <h3 className="rounded-sm bg-primary-subtle px-3 py-2.5 text-lg font-bold">{section.heading}</h3> : null}
          {section.groups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {group.title ? <h4 className="text-base font-bold">{group.title}</h4> : null}
              {group.bullets.length ? (
                <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-6 text-sm leading-relaxed">
                  {group.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{bullet}</li>)}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ))}
    </article>
  );
}
