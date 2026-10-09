import type { ReactNode } from "react";

import { cn } from "@/components/cn";

/**
 * The page header band (2026-10-09): flush under the nav, full-bleed, in the
 * nav's own slate, rounded at the bottom — so nav and header read as one block.
 * `.wl-band` (globals.css) pulls it up over main's top padding and re-points the
 * chrome tokens exactly as the nav does, so `sidebar-*` utilities match the nav.
 *
 * Left: eyebrow, title, optional extra (a progress bar), and stat counts.
 * Right: actions — use `bandButton` / `bandField` so they look like nav pills.
 */
export function PageBand({
  title,
  eyebrow,
  stats,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  stats?: Array<{ value: ReactNode; label: string }>;
  actions?: ReactNode;
  /** Extra content under the title, e.g. a segmented progress bar. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label="Page header" className={cn("wl-band shrink-0 rounded-b-[2rem] bg-sidebar text-sidebar-fg", className)}>
      <div className="mx-auto grid w-full max-w-[85rem] gap-5 px-4 pt-5 pb-6 md:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-8">
        <div className="min-w-0">
          {eyebrow ? <p className="text-sm text-sidebar-muted">{eyebrow}</p> : null}
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">{title}</h1>
          {children}
          {stats?.length ? (
            <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-sidebar-muted">
              {stats.map((stat) => (
                <li key={stat.label}><b className="mr-1 text-lg font-semibold text-sidebar-fg tabular-nums">{stat.value}</b>{stat.label}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
      </div>
    </section>
  );
}

/** A button on the band: the nav's active pill (white, slate text). */
export const bandButton =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-sidebar-accent-bg px-5 text-sm font-semibold whitespace-nowrap text-sidebar-accent transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-fg disabled:cursor-wait disabled:opacity-60 [&_svg]:size-4";

/** A field / secondary control on the band: the nav's idle pill. */
export const bandField =
  "h-11 rounded-full border border-sidebar-border bg-transparent px-4 text-sm text-sidebar-fg transition-colors duration-150 placeholder:text-sidebar-muted [color-scheme:dark] hover:bg-sidebar-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-fg";
