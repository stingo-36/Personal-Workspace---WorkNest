import { FileText, Plus } from "lucide-react";
import Link from "next/link";

import { NoteLibrary } from "@/components/notes/NoteLibrary";
import { PageBand, bandButton } from "@/components/shell/page-band";
import { buttonVariants } from "@/components/ui/button";
import { isLightColor, noteAccent } from "@/lib/note-colors";
import { listNotes } from "@/lib/note-store";
import { requireUserId } from "@/lib/session";

export const metadata = { title: "Notes" };


export default async function NotesPage() {
  const userId = await requireUserId();
  const notes = await listNotes(userId);
  const starred = notes.filter((note) => note.favorite).length;
  const sectionCount = notes.reduce((sum, note) => sum + note.sectionTitles.length, 0);
  const pageCount = notes.reduce((sum, note) => sum + note.pageCount, 0);

  const newNote = (
    <Link href="/notes/new" className={buttonVariants({ size: "lg" })}>
      <Plus aria-hidden="true" />
      New note
    </Link>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageBand
        title="Notes"
        eyebrow={notes.length ? "Your notebooks — hover a book to peek inside" : "A notebook per subject: sections inside a note, pages inside a section."}
        stats={notes.length ? [
          { value: notes.length, label: notes.length === 1 ? "notebook" : "notebooks" },
          { value: sectionCount, label: sectionCount === 1 ? "section" : "sections" },
          { value: pageCount, label: pageCount === 1 ? "page" : "pages" },
          { value: starred, label: "starred" },
        ] : undefined}
        actions={notes.length ? <Link href="/notes/new" className={bandButton}><Plus aria-hidden="true" />New note</Link> : null}
      />

      {notes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-card px-6 py-14 text-center">
          <FileText className="size-7 text-accent-text" aria-hidden="true" />
          <p className="text-md font-semibold text-text">No notes yet</p>
          <p className="max-w-[52ch] text-sm text-text-muted">
            A note holds sections, and each section holds pages. Good for a
            runbook, a service you keep relearning, or anything you look up more
            than once.
          </p>
          {newNote}
        </div>
      ) : (
        <NoteLibrary
          notes={notes.map((note) => {
            const accent = noteAccent(note.iconName, note.id);
            return {
              id: note.id,
              title: note.title,
              description: note.description,
              iconName: note.iconName,
              iconLibrary: note.iconLibrary,
              // Pale brand colours (JS yellow) are darkened so the bare icon stays legible on white.
              iconColor: isLightColor(accent) ? `color-mix(in srgb, ${accent} 60%, var(--c-text))` : accent,
              coverColor: accent,
              coverInk: isLightColor(accent) ? "var(--c-text)" : "var(--c-text-inverse)",
              favorite: note.favorite,
              sectionTitles: note.sectionTitles,
              pageCount: note.pageCount,
              updatedLabel: note.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
            };
          })}
        />
      )}
    </div>
  );
}
