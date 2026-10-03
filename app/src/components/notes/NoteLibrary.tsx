"use client";

import { FileText, Search, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { toggleNoteFavorite } from "@/actions/notes";
import { cn } from "@/components/cn";
import { NoteIcon } from "@/components/notes/NoteIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type LibraryNote = {
  id: string;
  title: string;
  description: string | null;
  iconName: string | null;
  iconLibrary: string | null;
  /** icon colour, already darkened for pale brand colours */
  iconColor: string;
  favorite: boolean;
  sectionTitles: string[];
  pageCount: number;
  updatedLabel: string;
};

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const PREVIEW_SECTIONS = 3;

/** The row grid, shared by the column header and every row so they line up. */
const ROW_GRID = "lg:grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1fr)_8rem_6.5rem_2.25rem]";

/**
 * Notes as a library index — one row per notebook, not a card grid. Starred
 * notes come first (server order). Search matches title, description and
 * section names, client-side: the list is small and already loaded.
 */
export function NoteLibrary({ notes }: { notes: LibraryNote[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) =>
      [note.title, note.description ?? "", ...note.sectionTitles].some((text) => text.toLowerCase().includes(q)),
    );
  }, [notes, query]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <label className="block w-full md:max-w-sm">
        <span className="sr-only">Search notes</span>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes and sections" startIcon={<Search />} />
      </label>

      <div className="min-w-0 border-t border-border">
        {/* Column labels — desktop only; rows carry their own labels below that. */}
        <div aria-hidden="true" className={cn("hidden gap-5 border-b border-border px-3 py-2.5 text-2xs font-bold tracking-[0.08em] text-text-muted uppercase lg:grid", ROW_GRID)}>
          <span />
          <span>Notebook</span>
          <span>Contents</span>
          <span>Size</span>
          <span>Updated</span>
          <span />
        </div>

        {shown.length === 0 ? (
          <p className="px-3 py-12 text-center text-base text-text-muted">
            Nothing matches “{query.trim()}”.{" "}
            <button type="button" onClick={() => setQuery("")} className="cursor-pointer font-semibold text-accent-text hover:underline">Clear search</button>
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((note) => (
              <NoteRow key={note.id} note={note} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NoteRow({ note }: { note: LibraryNote }) {
  const preview = note.sectionTitles.slice(0, PREVIEW_SECTIONS);
  const more = note.sectionTitles.length - preview.length;

  return (
    <li className={cn("group relative grid grid-cols-[2rem_minmax(0,1fr)_2.25rem] items-center gap-x-4 gap-y-1 rounded-lg px-3 py-4 transition-colors duration-150 hover:bg-surface-2 lg:gap-x-5", ROW_GRID)}>
      {/* Plain icon in the note's colour — no tile behind it. */}
      <span aria-hidden="true" style={{ color: note.iconColor }} className="row-span-2 grid size-8 place-items-center self-start lg:row-span-1 lg:self-center">
        <NoteIcon
          icon={note.iconLibrary && note.iconName ? { library: note.iconLibrary, name: note.iconName } : null}
          className="size-7"
          fallback={<FileText className="size-7" />}
        />
      </span>

      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-text">
          {/* Stretched over the whole row; the star sits above it. */}
          <Link href={`/notes/${note.id}`} className="line-clamp-1 outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-primary group-hover:text-accent-text">
            {note.title}
          </Link>
        </h2>
        {note.description ? <p className="mt-0.5 line-clamp-1 text-sm text-text-muted">{note.description}</p> : null}
      </div>

      {/* Phones/tablets: one meta line under the title. Desktop: real columns. */}
      <p className="col-start-2 text-xs text-text-muted tabular-nums lg:hidden">
        {plural(note.sectionTitles.length, "section")} · {plural(note.pageCount, "page")} · Updated {note.updatedLabel}
      </p>

      <p className="hidden min-w-0 truncate text-sm text-text-muted lg:block">
        {preview.length ? preview.join(" · ") : <span className="text-text-subtle">No sections yet</span>}
        {more > 0 ? <span className="ml-1.5 font-semibold text-text">+{more}</span> : null}
      </p>
      <p className="hidden text-sm text-text tabular-nums lg:block">
        <span className="font-semibold">{plural(note.sectionTitles.length, "section")}</span>
        <span className="block text-xs text-text-muted">{plural(note.pageCount, "page")}</span>
      </p>
      <p className="hidden text-sm text-text-muted tabular-nums lg:block">{note.updatedLabel}</p>

      {/* A form, not a link: favouriting is a write. */}
      <form action={toggleNoteFavorite} className="relative z-10 col-start-3 row-span-2 row-start-1 self-start lg:col-start-auto lg:row-span-1 lg:row-start-auto lg:self-center">
        <input type="hidden" name="id" value={note.id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          iconOnly
          className="text-text"
          aria-label={note.favorite ? `Unstar ${note.title}` : `Star ${note.title}`}
          aria-pressed={note.favorite}
          title={note.favorite ? "Starred" : "Star"}
        >
          <Star aria-hidden="true" className={cn(note.favorite ? "fill-warning text-warning" : "text-text-subtle")} />
        </Button>
      </form>
    </li>
  );
}
