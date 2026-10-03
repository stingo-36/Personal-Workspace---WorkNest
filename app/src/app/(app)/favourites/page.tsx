import { format } from "date-fns";
import { ExternalLink, FileText, ListTodo, MessageSquare, SquareTerminal, Star, StickyNote } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { NoteIcon } from "@/components/notes/NoteIcon";
import { PageHeader } from "@/components/shell/page-header";
import { isLightColor, noteAccent } from "@/lib/note-colors";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export const metadata = { title: "Favourites" };

const KIND = {
  FollowUp: { label: "Follow-up", Icon: MessageSquare, href: "/tracker?view=followups" },
  Task: { label: "To-do", Icon: ListTodo, href: "/tracker" },
  Note: { label: "Note", Icon: StickyNote, href: "/tracker?view=notes" },
} as const;

/** Everything you've starred, in one place: notes, resources, and important tracker items. */
export default async function FavouritesPage() {
  const userId = await requireUserId();
  const [notes, resources, tracker] = await Promise.all([
    prisma.note.findMany({
      where: { userId, deletedAt: null, favorite: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, description: true, iconName: true, iconLibrary: true, updatedAt: true, _count: { select: { sections: true } } },
    }),
    prisma.resource.findMany({
      where: { userId, favorite: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, description: true, type: true, url: true, content: true },
    }),
    prisma.followUp.findMany({
      where: { userId, pinned: true, status: "Open" },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      select: { id: true, kind: true, subject: true, person: true, dueDate: true },
    }),
  ]);
  const total = notes.length + resources.length + tracker.length;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader title="Favourites" description="Everything you've starred — notes, resources and important tracker items — in one place." className="mb-0" />

      {/* Navy summary band — the page's dark anchor (like Work Logs' "today" panel).
          Each count jumps to its section. */}
      <nav aria-label="Jump to" className="-mt-2 grid overflow-hidden rounded-2xl bg-sidebar text-sidebar-fg shadow-sm md:grid-cols-3">
        {[
          { href: "#fav-notes", label: "Favourite notes", count: notes.length, Icon: FileText },
          { href: "#fav-resources", label: "Favourite resources", count: resources.length, Icon: ExternalLink },
          { href: "#fav-tracker", label: "Important in Tracker", count: tracker.length, Icon: Star },
        ].map(({ href, label, count, Icon }, index) => (
          <a
            key={href}
            href={href}
            className={`flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-sidebar-2 ${index > 0 ? "border-t border-sidebar-border md:border-t-0 md:border-l" : ""}`}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sidebar-accent-bg" aria-hidden="true">
              <Icon className={`size-5 ${Icon === Star ? "fill-current" : ""}`} />
            </span>
            <span className="min-w-0">
              <span className="block text-3xl leading-none font-semibold tabular-nums">{count}</span>
              <span className="mt-1 block text-sm text-sidebar-muted">{label}</span>
            </span>
          </a>
        ))}
      </nav>

      {total === 0 ? (
        <div className="wl-card flex flex-col items-center gap-2 px-6 py-14 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-warning"><Star className="size-5" aria-hidden="true" /></span>
          <p className="text-base font-semibold text-text">Nothing starred yet</p>
          <p className="max-w-md text-sm text-text-muted">Star a note or a resource, or mark a tracker item important — it will show up here.</p>
        </div>
      ) : null}

      <Group id="fav-notes" title="Notes" count={notes.length} empty="Star a note on the Notes page to pin it here.">
        <ul data-reveal-stagger className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {notes.map((note) => {
            const accent = noteAccent(note.iconName, note.id);
            return (
              <li key={note.id}>
                <Link
                  href={`/notes/${note.id}`}
                  style={{ "--note": accent } as CSSProperties}
                  className="flex h-full items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--note)_60%,var(--c-surface))] bg-[color-mix(in_srgb,var(--note)_4%,var(--c-surface))] p-4 transition-shadow duration-150 hover:shadow-md"
                >
                  <span
                    style={{ color: isLightColor(accent) ? "color-mix(in srgb, var(--note) 70%, #1f2937)" : "var(--note)" }}
                    className="grid size-10 shrink-0 place-items-center rounded-lg border border-[color-mix(in_srgb,var(--note)_45%,var(--c-surface))] bg-surface"
                    aria-hidden="true"
                  >
                    <NoteIcon icon={note.iconLibrary && note.iconName ? { library: note.iconLibrary, name: note.iconName } : null} className="size-5" fallback={<FileText className="size-5" />} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-text">{note.title}</span>
                    {note.description ? <span className="mt-0.5 line-clamp-2 block text-sm text-text-muted">{note.description}</span> : null}
                    <span className="mt-2 block text-xs text-text-subtle">{note._count.sections} {note._count.sections === 1 ? "section" : "sections"} · Updated {format(note.updatedAt, "d MMM")}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group id="fav-resources" title="Resources" count={resources.length} empty="Star a resource on the Resources page to pin it here.">
        <ul data-reveal-stagger className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {resources.map((resource) => {
            const code = resource.type === "Command" || resource.type === "Snippet";
            const Inner = (
              <>
                <span className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent-text" aria-hidden="true">
                    {code ? <SquareTerminal className="size-5" /> : <ExternalLink className="size-5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-text">{resource.title}</span>
                    <span className="block truncate text-xs text-text-subtle">{resource.type}{resource.url ? ` · ${host(resource.url)}` : ""}</span>
                  </span>
                </span>
                {code && resource.content ? (
                  <code className="line-clamp-2 block rounded-lg bg-sidebar px-3 py-2 font-mono text-xs text-sidebar-fg">{resource.content}</code>
                ) : resource.description ? (
                  <span className="line-clamp-2 block text-sm text-text-muted">{resource.description}</span>
                ) : null}
              </>
            );
            const card = "wl-card flex h-full flex-col gap-3 p-4 transition-[border-color,box-shadow] duration-150 hover:border-primary hover:shadow-md";
            return (
              <li key={resource.id}>
                {resource.url && !code ? (
                  <a href={resource.url} target="_blank" rel="noreferrer" className={card}>{Inner}</a>
                ) : (
                  <Link href="/resources" className={card}>{Inner}</Link>
                )}
              </li>
            );
          })}
        </ul>
      </Group>

      <Group id="fav-tracker" title="Important in Tracker" count={tracker.length} empty="Mark a tracker item important to pin it here.">
        <ul data-reveal-stagger className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tracker.map((entry) => {
            const kind = KIND[entry.kind];
            return (
              <li key={entry.id}>
                <Link href={kind.href} className="wl-card flex h-full items-start gap-3 p-4 transition-[border-color,box-shadow] duration-150 hover:border-primary hover:shadow-md">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-accent-text" aria-hidden="true"><kind.Icon className="size-5" /></span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-base font-semibold text-text">
                      <span className="truncate">{entry.subject}</span>
                      <Star className="size-3.5 shrink-0 fill-current text-warning" aria-hidden="true" />
                    </span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {kind.label}
                      {entry.person ? ` · ${entry.person}` : ""}
                      {entry.dueDate ? ` · ${format(new Date(`${entry.dueDate.toISOString().slice(0, 10)}T00:00:00`), "EEE d MMM")}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Group>
    </div>
  );
}

function Group({ id, title, count, empty, children }: { id: string; title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <h2 id={`${id}-heading`} className="mb-3 flex items-center gap-2 text-xl font-semibold tracking-[-0.015em] text-text">
        {title}
        <span className="text-sm font-medium text-text-subtle tabular-nums">{count}</span>
      </h2>
      {count ? children : <p className="rounded-xl border border-dashed border-border-strong px-4 py-4 text-sm text-text-muted">{empty}</p>}
    </section>
  );
}

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
