import type { ReactNode } from "react";

import { AppNav, type ShellUser } from "@/components/shell/app-nav";
import { ScrollReveal } from "@/components/shell/scroll-reveal";
/**
 * The authenticated frame: a floating pill nav across the top, then the
 * content well. There is no sidebar — navigation lives in the pill, matching
 * the homepage (2026-09-14).
 *
 * Layout contract (design.md §8):
 *   360   sections collapse into a sheet under the pill
 *   768   sections sit inside the pill
 *   1024  the date and the account name appear
 *   1440  content capped at 1360px, the extra width becomes gutter
 */
export function AppShell({
  user,
  todayLabel,
  children,
}: {
  user: ShellUser;
  todayLabel: string;
  children: ReactNode;
}) {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-md bg-primary-strong px-3 py-2 text-sm font-semibold text-primary-fg focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      {/* `min-w-0` so a wide table inside can scroll itself instead of
          stretching the page — design.md §8 forbids horizontal body scroll. */}
      <div className="app-shell flex min-h-dvh w-full min-w-0 flex-col overflow-x-clip bg-bg text-text">
        <AppNav user={user} todayLabel={todayLabel} />

        <main
          id="main"
          className="min-w-0 flex-1 overflow-x-clip px-3 py-6 md:px-5 lg:px-8"
        >
          <div className="mx-auto w-full max-w-[85rem]">{children}</div>
        </main>
        <ScrollReveal />
      </div>
    </>
  );
}

export type { ShellUser };
