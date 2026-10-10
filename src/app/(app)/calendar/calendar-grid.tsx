"use client";

import { useRef, useState } from "react";
import { deletePtSession } from "@/server/calendar";
import { fmtTime, LOCALE } from "@/lib/format";
import { toLocalInputInTz } from "@/lib/tz";
import { SessionDialogForm } from "./session-form";
import { SessionStatusActions } from "./session-actions";
import { DeleteWithUndo } from "@/components/delete-with-undo";
import { btnPrimaryCls } from "@/components/controls";
import { Overlay, OverlayHeader } from "@/components/overlay";

export type GridSession = {
  id: string;
  startsAt: Date;
  durationMin: number;
  location: string | null;
  notes: string | null;
  status: string;
  memberUserId: string | null;
  trainerId: string;
};

export type GridDay = {
  key: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  sessions: GridSession[];
};

type Member = { id: string; name: string };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function statusChip(status: string): string {
  // Palette stays emerald + stone: red is reserved for destructive deletes.
  if (status === "cancelled") return "bg-stone-200 text-stone-600 line-through";
  if (status === "done") return "bg-stone-200 text-stone-600";
  return "bg-emerald-100/80 text-emerald-700";
}

function dayLabel(key: string): string {
  // parse parts locally — new Date("YYYY-MM-DD") is UTC and shifts on other timezones
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function DayDialog({
  day,
  initialEdit,
  names,
  trainerId,
  members,
  canManage,
  onClose,
}: {
  day: GridDay;
  initialEdit: "new" | string | null;
  names: Record<string, string>;
  trainerId: string;
  members: Member[];
  canManage: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<"new" | string | null>(
    initialEdit === "new" && day.sessions.length > 0 ? null : initialEdit,
  );
  const editSession =
    editing && editing !== "new" ? day.sessions.find((s) => s.id === editing) : undefined;

  return (
    <Overlay onClose={onClose} label={`Sessions on ${dayLabel(day.key)}`}>
      <OverlayHeader title={dayLabel(day.key)} onClose={onClose} />

      {canManage && editing === "new" ? (
        <SessionDialogForm
          mode="create"
          trainerId={trainerId}
          members={members}
          initial={{ startsAt: `${day.key}T17:00` }}
          onDone={() => setEditing(null)}
        />
      ) : canManage && editSession ? (
        <DeleteWithUndo
          action={() => deletePtSession(editSession.id)}
          onCommitted={onClose}
          className="space-y-4"
        >
          <SessionDialogForm
            mode="edit"
            sessionId={editSession.id}
            trainerId={trainerId}
            members={members}
            initial={{
              startsAt: toLocalInputInTz(editSession.startsAt),
              durationMin: editSession.durationMin,
              memberUserId: editSession.memberUserId,
              location: editSession.location,
              notes: editSession.notes,
            }}
            onDone={() => setEditing(null)}
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3">
            <SessionStatusActions id={editSession.id} status={editSession.status} />
          </div>
        </DeleteWithUndo>
      ) : (
        <div className="space-y-3">
          {day.sessions.length === 0 && (
            <p className="text-sm text-stone-600">No sessions this day.</p>
          )}
          {day.sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 p-3 text-left text-sm"
            >
              <span>
                <span className={`rounded px-1.5 py-0.5 text-xs ${statusChip(s.status)}`}>
                  {fmtTime(s.startsAt)}
                </span>
                <span className="ml-2 font-medium">
                  {s.memberUserId ? (names[s.memberUserId] ?? "Member") : "Both"}
                </span>
                <span className="text-stone-600">
                  {s.location ? ` · ${s.location}` : ""} · {s.durationMin} min
                </span>
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setEditing(s.id)}
                  className="inline-flex min-h-11 items-center rounded-lg text-xs text-emerald-700 transition hover:text-emerald-800"
                >
                  Edit
                </button>
              )}
            </div>
          ))}
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing("new")}
                className={btnPrimaryCls}
              >
                Add session
              </button>
            </div>
          )}
        </div>
      )}
    </Overlay>
  );
}

export function CalendarGrid({
  days,
  names,
  canManage,
  trainerId,
  members,
}: {
  days: GridDay[];
  names: Record<string, string>;
  canManage: boolean;
  trainerId: string;
  members: Member[];
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** Roving tabindex: one cell is tabbable, arrows move between the rest. */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const selectedDay = selectedKey ? days.find((d) => d.key === selectedKey) : undefined;

  const openDay = (key: string) => {
    setSelectedKey(key);
  };

  const firstFocusable = days.find((d) => d.isToday)?.key ?? days[0]?.key ?? null;
  const rovingKey = focusKey ?? firstFocusable;

  const moveFocus = (next: number) => {
    const target = days[next];
    if (!target) return;
    setFocusKey(target.key);
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${target.key}"]`)?.focus();
  };

  return (
    <>
      {/* The month grid is a desktop enhancement — phones use the agenda list
          below it, which always fits and always includes today. */}
      <section className="hidden overflow-x-auto rounded-2xl border border-stone-200 bg-white/70 p-3 sm:block">
        <div className="min-w-[640px]">
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs uppercase tracking-wide text-stone-600">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div ref={gridRef} className="grid grid-cols-7 gap-1">
            {days.map((day, i) => (
              <div
                key={day.key}
                data-day={day.key}
                role="button"
                tabIndex={day.key === rovingKey ? 0 : -1}
                aria-label={`View sessions on ${dayLabel(day.key)}${
                  day.sessions.length
                    ? `, ${day.sessions.length} session${day.sessions.length === 1 ? "" : "s"}`
                    : ""
                }`}
                onFocus={() => setFocusKey(day.key)}
                onClick={() => openDay(day.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDay(day.key);
                    return;
                  }
                  const moves: Record<string, number> = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -7,
                    ArrowDown: 7,
                    Home: -(i % 7),
                    End: 6 - (i % 7),
                  };
                  const delta = moves[e.key];
                  if (delta === undefined) return;
                  e.preventDefault();
                  moveFocus(i + delta);
                }}
                className={`min-h-20 rounded-lg border p-1.5 cursor-pointer transition hover:border-stone-400 ${
                  day.inMonth ? "border-stone-200 bg-stone-50" : "border-stone-200 bg-stone-200/40 opacity-40"
                } ${day.isToday ? "ring-1 ring-emerald-500" : ""}`}
              >
                <div className={`mb-1 text-right text-xs ${day.isToday ? "font-bold text-emerald-700" : "text-stone-600"}`}>
                  {day.dayNumber}
                </div>
                {day.sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`mb-1 truncate rounded px-1.5 py-0.5 text-xs leading-tight ${statusChip(s.status)}`}
                    title={`${s.memberUserId ? (names[s.memberUserId] ?? "Member") : "Both"}${s.location ? ` @ ${s.location}` : ""}`}
                  >
                    {fmtTime(s.startsAt)}{" "}
                    {s.memberUserId ? (names[s.memberUserId] ?? "Member")?.split(" ")[0] : "Both"}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {selectedDay && (
        <DayDialog
          key={selectedKey}
          day={selectedDay}
          initialEdit={canManage ? "new" : null}
          names={names}
          trainerId={trainerId}
          members={members}
          canManage={canManage}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </>
  );
}
