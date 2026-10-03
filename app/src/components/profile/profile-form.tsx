"use client";

import { Building2, CalendarRange, LibraryBig, Mail, MessageSquare, Tag, Tags, Ticket, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addDays, format } from "date-fns";

import { updateProfile } from "@/actions/profile";
import { cn } from "@/components/cn";
import { AiSettingsCard, type AiSettingsView } from "@/components/profile/ai-settings";
import {
  ListCard,
  OrderedListEditor,
  ProjectListEditor,
  TagListEditor,
  type ProjectOption,
  type TagUsage,
} from "@/components/profile/list-editors";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { getSprint } from "@/lib/sprint";

type ProfileValues = {
  name: string;
  sprintStartDate: string;
  sprintLengthDays: number;
  ticketsEnabled: boolean;
};

type OrderedState = { values: string[]; customized: boolean };

export type ProfileLists = {
  channels: OrderedState;
  resourceTypes: OrderedState;
  /** type → picked icon ("library:Name") */
  resourceTypeIcons: Record<string, string>;
  meetings: OrderedState;
  projects: ProjectOption[];
  noteTags: TagUsage[];
  resourceTags: TagUsage[];
};

const LENGTHS = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 21, label: "3 weeks" },
  { days: 28, label: "4 weeks" },
];

const MENU = [
  {
    label: "Settings",
    items: [
      { id: "account", label: "Account", Icon: UserRound },
      { id: "sprint", label: "Sprint calendar", Icon: CalendarRange },
      { id: "work-logs", label: "Work logs", Icon: Ticket },
    ],
  },
  {
    label: "Dropdown lists",
    items: [
      { id: "channels", label: "Follow-up channels", Icon: MessageSquare },
      { id: "resource-types", label: "Resource types", Icon: LibraryBig },
      { id: "meetings", label: "Default meetings", Icon: Users },
      { id: "projects", label: "Projects / sites", Icon: Building2 },
    ],
  },
  {
    label: "Tags",
    items: [
      { id: "note-tags", label: "Note tags", Icon: Tags },
      { id: "resource-tags", label: "Resource tags", Icon: Tag },
    ],
  },
] as const;

type ProfileSection = (typeof MENU)[number]["items"][number]["id"];
type SettingsSection = "account" | "sprint" | "work-logs";
const SECTION_IDS: readonly string[] = MENU.flatMap((group) => group.items.map((item) => item.id));

/**
 * Profile. Two kinds of setting live here and save differently:
 *  - account / sprint / work-log settings → edited together, saved with the
 *    bar that appears at the bottom once something changes;
 *  - dropdown lists and tags → each change saves on its own, immediately.
 */
export function ProfileForm({ email, initial, lists, ai, initialSection }: { email: string; initial: ProfileValues; lists: ProfileLists; ai: AiSettingsView; /** `?section=` from the URL — validated here. */ initialSection?: string }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [section, setSection] = useState<ProfileSection>(
    SECTION_IDS.includes(initialSection ?? "") ? (initialSection as ProfileSection) : "account",
  );
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  // Which settings sections hold unsaved edits — marked with a dot in the menu.
  const dirtyBySection: Record<SettingsSection, boolean> = {
    account: values.name !== initial.name,
    sprint: values.sprintStartDate !== initial.sprintStartDate || values.sprintLengthDays !== initial.sprintLengthDays,
    "work-logs": values.ticketsEnabled !== initial.ticketsEnabled,
  };

  // On phones the menu is a sideways-scrolling row: keep the open section's chip in view.
  useEffect(() => {
    document.querySelector('nav[aria-label="Profile sections"] [aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [section]);

  function open(next: ProfileSection) {
    setSection(next);
    // Shallow URL update so refresh / back lands on the same section.
    window.history.replaceState(null, "", next === "account" ? "/profile" : `/profile?section=${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  // Live preview of what the sprint settings mean today.
  const anchor = values.sprintStartDate ? new Date(`${values.sprintStartDate}T00:00:00`) : null;
  const current = anchor ? getSprint(new Date(), { anchor, days: values.sprintLengthDays }) : null;
  const displayName = initial.name || email;
  const initials = (values.name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  function save() {
    setError(undefined);
    startTransition(async () => {
      const result = await updateProfile({
        name: values.name,
        sprintStartDate: values.sprintStartDate || null,
        sprintLengthDays: values.sprintLengthDays,
        ticketsEnabled: values.ticketsEnabled,
      });
      if (!result.ok) { setError(result.error.message); return; }
      toast.success("Profile saved");
      router.refresh();
    });
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      {/* One header: the page title with who you are inline — no second competing card. */}
      <PageHeader
        title="Profile"
        className="mb-0"
        description={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar text-xs font-bold text-sidebar-fg" aria-hidden="true">{initials || "?"}</span>
              <span className="font-semibold text-text">{displayName}</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5"><Mail className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{email}</span></span>
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm font-semibold text-text">{LENGTHS.find((item) => item.days === initial.sprintLengthDays)?.label ?? `${initial.sprintLengthDays} days`} sprints</span>
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm font-semibold text-text">Tickets {initial.ticketsEnabled ? "on" : "off"}</span>
          </div>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        {/* Section menu: one section open at a time. A rail on desktop, a scrolling chip row on phones. */}
        <nav aria-label="Profile sections" className="min-w-0 lg:sticky lg:top-20">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0">
            {MENU.map((group) => (
              <div key={group.label} className="contents lg:flex lg:flex-col lg:gap-1">
                <p className="hidden px-3 text-2xs font-bold tracking-[0.08em] text-text-muted uppercase lg:block">{group.label}</p>
                {group.items.map(({ id, label, Icon }) => {
                  const active = section === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => open(id)}
                      className={cn(
                        "inline-flex shrink-0 cursor-pointer items-center gap-2.5 rounded-full border px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors duration-150 lg:rounded-lg lg:border-transparent",
                        active ? "border-sidebar bg-sidebar text-sidebar-fg shadow-sm" : "border-border bg-surface text-text hover:bg-surface-2 lg:bg-transparent",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-sidebar-fg" : "text-accent-text")} aria-hidden="true" />
                      {label}
                      {id in dirtyBySection && dirtyBySection[id as SettingsSection] ? <span className="size-2 rounded-full bg-warning" aria-label="unsaved" /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
          {section === "account" ? (
            <div className="flex flex-col gap-6">
              <ListCard title="Account" description="Your name as it appears in the app. Email is used to sign in.">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Name" htmlFor="profile-name">
                    <Input id="profile-name" value={values.name} maxLength={80} onChange={(event) => set("name", event.target.value)} />
                  </Field>
                  <Field label="Email" htmlFor="profile-email" hint="Used to sign in — can't be changed here.">
                    <Input id="profile-email" value={email} readOnly disabled />
                  </Field>
                </div>
              </ListCard>
              {/* Saves on its own — not part of the save bar below. */}
              <AiSettingsCard initial={ai} />
            </div>
          ) : null}

          {section === "sprint" ? (
            <ListCard title="Sprint calendar" description="Work Logs group your days into sprints counted from this date.">
              <div className="grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
                <Field label="A sprint starts on" htmlFor="profile-sprint-start">
                  <Input id="profile-sprint-start" type="date" value={values.sprintStartDate} onChange={(event) => set("sprintStartDate", event.target.value)} />
                </Field>
                <div className="flex flex-col gap-2">
                  <span id="profile-sprint-length" className="text-sm font-semibold text-text">Sprint length</span>
                  <div role="radiogroup" aria-labelledby="profile-sprint-length" className="grid grid-cols-4 gap-1 rounded-full border border-border-strong bg-surface-2 p-1">
                    {LENGTHS.map(({ days, label }) => {
                      const active = values.sprintLengthDays === days;
                      return (
                        <button
                          key={days}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => set("sprintLengthDays", days)}
                          className={cn("h-8 cursor-pointer rounded-full px-2 text-sm font-semibold whitespace-nowrap transition-colors duration-150", active ? "bg-sidebar text-sidebar-fg shadow-sm" : "text-text hover:bg-surface-3")}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {current ? (
                <dl className="grid gap-3 rounded-xl border border-border-strong bg-surface-2 p-4 md:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-text-muted">Current sprint</dt>
                    <dd className="mt-0.5 text-base font-semibold text-text">{format(current.start, "EEE d MMM")} – {format(current.end, "EEE d MMM")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-text-muted">Next sprint starts</dt>
                    <dd className="mt-0.5 text-base font-semibold text-text">{format(addDays(current.end, 1), "EEEE d MMM")}</dd>
                  </div>
                </dl>
              ) : null}
            </ListCard>
          ) : null}

          {section === "work-logs" ? (
            <ListCard title="Work logs" description="What each work log tracks.">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p id="profile-tickets-label" className="text-sm font-semibold text-text">Track tickets in work logs</p>
                  <p className="mt-0.5 text-sm text-text-muted">Shows the Tickets page and the ticket sections in each work log. Turning it off hides them — nothing is deleted.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={values.ticketsEnabled}
                  aria-labelledby="profile-tickets-label"
                  onClick={() => set("ticketsEnabled", !values.ticketsEnabled)}
                  className={cn("relative mt-0.5 h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-150", values.ticketsEnabled ? "bg-sidebar" : "bg-border-strong")}
                >
                  <span className={cn("absolute top-1 size-5 rounded-full bg-surface shadow-sm transition-[left] duration-150", values.ticketsEnabled ? "left-6" : "left-1")} aria-hidden="true" />
                </button>
              </div>
            </ListCard>
          ) : null}

          {section === "channels" ? <OrderedListEditor kind="FollowUpChannel" title="Follow-up channels" description="Tracker → Follow-ups → “Where”. Drag ⋮⋮ to reorder; removing one never changes old follow-ups." initial={lists.channels.values} customized={lists.channels.customized} addPlaceholder="e.g. WhatsApp" /> : null}
          {section === "resource-types" ? <OrderedListEditor kind="ResourceType" title="Resource types" description="Resources → “Resource type”, and the order of sections on that page. Click an icon to change it." initial={lists.resourceTypes.values} icons={lists.resourceTypeIcons} customized={lists.resourceTypes.customized} addPlaceholder="e.g. Video" /> : null}
          {section === "meetings" ? <OrderedListEditor kind="DefaultMeeting" title="Default meetings" description="The meeting cards every new work log starts with. Existing logs are not changed." initial={lists.meetings.values} customized={lists.meetings.customized} addPlaceholder="e.g. Daily stand-up" /> : null}
          {section === "projects" ? <ProjectListEditor initial={lists.projects} /> : null}
          {section === "note-tags" ? (
            <ListCard title="Note tags" description="Add tags ahead of time, rename them on every note, or delete them.">
              <TagListEditor kind="NoteTag" noun={{ one: "note", many: "notes" }} initial={lists.noteTags} />
            </ListCard>
          ) : null}
          {section === "resource-tags" ? (
            <ListCard title="Resource tags" description="Add tags ahead of time, rename them on every resource, or delete them.">
              <TagListEditor kind="ResourceTag" noun={{ one: "resource", many: "resources" }} initial={lists.resourceTags} />
            </ListCard>
          ) : null}
        </div>
      </div>

      {/* Save bar for the account / sprint / work-log settings — only once something changed. */}
      {dirty ? (
        <div className="sticky bottom-4 z-30 mx-auto flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-lg">
          <p className="mr-auto text-sm font-semibold text-text">{error ? <span className="text-danger" role="alert">{error}</span> : "You have unsaved changes"}</p>
          <Button variant="secondary" disabled={pending} onClick={() => { setValues(initial); setError(undefined); }}>Reset</Button>
          <Button onClick={save} loading={pending}>Save changes</Button>
        </div>
      ) : null}
    </div>
  );
}
