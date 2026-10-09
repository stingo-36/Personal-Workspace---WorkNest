import { format } from "date-fns";
import { FileText, ListTodo, MessageSquare, Star, StickyNote } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { cn } from "@/components/cn";
import { PageBand, bandField } from "@/components/shell/page-band";
import { NoteIcon } from "@/components/notes/NoteIcon";
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
    // Redesigned 2026-10-08 as a bento: intro + jump counts, the important tracker
    // items on slate, then notes and resources as mixed-size tiles.
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <PageBand
          title="Favourites"
          eyebrow="Everything you starred, in one place"
          stats={[
            { value: tracker.length, label: "important in Tracker" },
            { value: notes.length, label: notes.length === 1 ? "note" : "notes" },
            { value: resources.length, label: resources.length === 1 ? "resource" : "resources" },
          ]}
          actions={
            <nav aria-label="Jump to" className="flex flex-wrap gap-2">
              <a href="#fav-tracker" className={bandField + " inline-flex items-center"}>Important</a>
              <a href="#fav-notes" className={bandField + " inline-flex items-center"}>Notes</a>
              <a href="#fav-resources" className={bandField + " inline-flex items-center"}>Resources</a>
            </nav>
          }
        />
      </div>

      <section id="fav-tracker" aria-labelledby="fav-tracker-heading" className="flex scroll-mt-24 flex-col gap-2 rounded-3xl border border-border bg-surface p-6 text-text lg:col-span-12">
        <div className="mb-1 flex items-center gap-3">
          <h2 id="fav-tracker-heading" className="text-xs font-semibold tracking-[0.1em] text-text-subtle uppercase">Important · open in Tracker</h2>
          <Link href="/tracker" className="tap-area ml-auto text-sm font-semibold text-accent-text hover:underline">Open Tracker</Link>
        </div>
        {tracker.length === 0 ? (
          <p className="py-3 text-sm text-text-muted">Mark a tracker item important to pin it here.</p>
        ) : (
          <ul className="flex flex-col">
            {tracker.map((entry) => {
              const kind = KIND[entry.kind];
              return (
                <li key={entry.id}>
                  <Link href={kind.href} className="-mx-3 flex min-h-12 items-center gap-3 rounded-xl px-3 text-text transition-colors duration-150 hover:bg-surface-2">
                    <Star className="size-4 shrink-0 fill-current text-warning" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-medium">{entry.subject}</span>
                    <span className="shrink-0 text-xs text-text-subtle">
                      {kind.label}
                      {entry.person ? ` · ${entry.person}` : ""}
                      {entry.dueDate ? ` · ${format(new Date(`${entry.dueDate.toISOString().slice(0, 10)}T00:00:00`), "EEE d MMM")}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {total === 0 ? (
        <p className="rounded-3xl border border-dashed border-border-strong px-6 py-10 text-center text-sm text-text-muted lg:col-span-12">
          Nothing starred yet. Star a note or a resource, or mark a tracker item important — it will show up here.
        </p>
      ) : null}

      <GroupHeading id="fav-notes" title="Notes" count={notes.length} empty="Star a note on the Notes page to pin it here." />
      {notes.map((note) => {
        const accent = noteAccent(note.iconName, note.id);
        return (
          <Link
            key={note.id}
            href={`/notes/${note.id}`}
            style={{ "--note": accent } as CSSProperties}
            className="flex min-w-0 flex-col gap-3 rounded-3xl border border-border bg-surface p-5 transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-card-hover lg:col-span-4"
          >
            <span
              style={{ color: isLightColor(accent) ? "#0f172a" : "#ffffff" }}
              className="grid size-12 place-items-center rounded-2xl bg-[var(--note)]"
              aria-hidden="true"
            >
              <NoteIcon icon={note.iconLibrary && note.iconName ? { library: note.iconLibrary, name: note.iconName } : null} className="size-6" fallback={<FileText className="size-6" />} />
            </span>
            <span className="block truncate text-lg font-semibold text-text">{note.title}</span>
            {note.description ? <span className="line-clamp-2 text-sm text-text-muted">{note.description}</span> : null}
            <span className="mt-auto text-xs text-text-subtle">{note._count.sections} {note._count.sections === 1 ? "section" : "sections"} · Updated {format(note.updatedAt, "d MMM")}</span>
          </Link>
        );
      })}

      <GroupHeading id="fav-resources" title="Resources" count={resources.length} empty="Star a resource on the Resources page to pin it here." />
      {resources.map((resource) => {
        const code = resource.type === "Command" || resource.type === "Snippet";
        const Inner = (
          <>
            <span className="w-fit rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-text-muted">{resource.type}</span>
            <span className="block truncate text-base font-semibold text-text">{resource.title}</span>
            {code && resource.content ? (
              <code className="line-clamp-2 block rounded-xl bg-sidebar px-3.5 py-3 font-mono text-xs text-sidebar-fg">{resource.content}</code>
            ) : resource.url ? (
              <span className="block truncate text-sm text-accent-text">{host(resource.url)}</span>
            ) : resource.description ? (
              <span className="line-clamp-2 block text-sm text-text-muted">{resource.description}</span>
            ) : null}
          </>
        );
        const card = cn(
          "flex min-w-0 flex-col gap-2.5 rounded-3xl border border-border bg-surface p-5 transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-card-hover",
          code ? "lg:col-span-6" : "lg:col-span-3",
        );
        return resource.url && !code ? (
          <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer" className={card}>{Inner}</a>
        ) : (
          <Link key={resource.id} href="/resources" className={card}>{Inner}</Link>
        );
      })}
    </div>
  );
}

function GroupHeading({ id, title, count, empty }: { id: string; title: string; count: number; empty: string }) {
  return (
    <div id={id} className="flex scroll-mt-24 flex-col gap-2 pt-4 lg:col-span-12">
      <h2 className="flex items-baseline gap-2 text-xl font-semibold tracking-[-0.02em] text-text">
        {title}
        <span className="text-sm font-medium text-text-subtle tabular-nums">{count}</span>
      </h2>
      {count ? null : <p className="rounded-2xl border border-dashed border-border-strong px-4 py-4 text-sm text-text-muted">{empty}</p>}
    </div>
  );
}

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
