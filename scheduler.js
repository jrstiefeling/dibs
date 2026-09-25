// Meeting times. Works entirely from the day-and-time windows you type in —
// Google Calendar is an optional upgrade you can switch on later, and nothing
// depends on it.
//
// Windows off:  proposes slots from your windows alone, and labels them
//               "not checked against your calendar" so you know.
// Windows + cal: same slots, minus anything that clashes with a real event.

import { getSettings, saveSettings } from "./storage.js";

const CAL = "https://www.googleapis.com/calendar/v3";

export const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const DEFAULT_WINDOWS = [
  { day: 6, from: "10:00", to: "14:00" },
  { day: 0, from: "12:00", to: "16:00" },
  { day: 3, from: "18:00", to: "20:00" },
];

/* ------------------------- optional calendar link ------------------------ */

export async function calendarEnabled() {
  const s = await getSettings();
  return !!s.calendarOn;
}

async function token(interactive = false) {
  try {
    const res = await chrome.identity.getAuthToken({ interactive });
    return res?.token || res || null;
  } catch {
    return null;
  }
}

export async function connectCalendar() {
  const t = await token(true);
  if (!t) {
    return {
      ok: false,
      reason:
        "Couldn't get permission. Add your own OAuth client ID to manifest.json first — the README has the steps.",
    };
  }
  await saveSettings({ calendarOn: true });
  return { ok: true };
}

export async function disconnectCalendar() {
  await saveSettings({ calendarOn: false });
  return { ok: true };
}

async function busyBlocks(fromISO, toISO) {
  if (!(await calendarEnabled())) return null;
  const t = await token(false);
  if (!t) return null;
  try {
    const res = await fetch(`${CAL}/freeBusy`, {
      method: "POST",
      headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: JSON.stringify({ timeMin: fromISO, timeMax: toISO, items: [{ id: "primary" }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.calendars?.primary?.busy || [];
  } catch {
    return null; // a calendar failure must never block a reply
  }
}

/* ----------------------------- slot proposal ---------------------------- */

export async function proposeSlots(settings, count = 3) {
  const s = settings || (await getSettings());
  const windows = s.windows?.length ? s.windows : DEFAULT_WINDOWS;
  const slotMinutes = s.slotMinutes || 30;

  const candidates = [];
  const now = new Date();

  // Walk the next fortnight, emitting every slot that falls inside a window.
  for (let offset = 1; offset <= 14 && candidates.length < count * 6; offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);

    for (const w of windows) {
      if (day.getDay() !== w.day) continue;
      const [fh, fm] = w.from.split(":").map(Number);
      const [th, tm] = w.to.split(":").map(Number);

      const windowStart = new Date(day);
      windowStart.setHours(fh, fm, 0, 0);
      const windowEnd = new Date(day);
      windowEnd.setHours(th, tm, 0, 0);

      // Offer the top of the window and the hour after it, not a wall of
      // half-hour options nobody wants to read.
      for (let t = windowStart.getTime(); t + slotMinutes * 60000 <= windowEnd.getTime(); t += 3600000) {
        candidates.push({ start: new Date(t), end: new Date(t + slotMinutes * 60000) });
        if (candidates.length >= count * 6) break;
      }
    }
  }

  if (!candidates.length) return [];

  const busy = await busyBlocks(
    candidates[0].start.toISOString(),
    candidates.at(-1).end.toISOString()
  );

  const free = candidates.filter((c) => {
    if (!busy) return true; // no calendar: trust the windows
    return !busy.some((b) => new Date(b.start) < c.end && new Date(b.end) > c.start);
  });

  // Spread the offers across different days rather than three in a row.
  const spread = [];
  const usedDays = new Set();
  for (const c of free) {
    const key = c.start.toDateString();
    if (usedDays.has(key) && spread.length < count) continue;
    usedDays.add(key);
    spread.push(c);
    if (spread.length >= count) break;
  }
  const chosen = spread.length ? spread : free.slice(0, count);

  return chosen.map((c) => ({
    start: c.start.toISOString(),
    end: c.end.toISOString(),
    label: c.start.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
    checkedAgainstCalendar: !!busy,
  }));
}

/* ------------------------------- booking -------------------------------- */

export async function bookSlot({ slot, buyerName, listingTitle, location, threadUrl }) {
  if (!(await calendarEnabled())) {
    return { ok: false, reason: "calendar_off", note: "Slot agreed — add it to your calendar yourself." };
  }
  const t = await token(false);
  if (!t) return { ok: false, reason: "calendar_not_authorised" };

  const res = await fetch(`${CAL}/calendars/primary/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: `${listingTitle} — ${buyerName}`,
      location: location?.name || location || "",
      description: `Marketplace handoff.\nBuyer: ${buyerName}\nThread: ${threadUrl || "—"}`,
      start: { dateTime: slot.start },
      end: { dateTime: slot.end },
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }] },
    }),
  });

  if (!res.ok) return { ok: false, reason: `calendar_${res.status}` };
  return { ok: true, event: await res.json() };
}

/* ------------------------- approved locations only ---------------------- */

export function locationFor(settings, listing, buyer) {
  const approved = settings.locations || [];
  if (!approved.length) return null;
  // Anything valuable, or any buyer you've never dealt with, goes public.
  const needsPublic = (listing?.listPrice || 0) > 150 || (buyer?.deals || 0) === 0;
  const publicSpot = approved.find((l) => l.public);
  return needsPublic ? publicSpot || approved[0] : approved[0];
}

/* ------------------------------ text parsing ---------------------------- */

export function parseWindows(raw) {
  return String(raw || "")
    .split(/[,;\n]/)
    .map((chunk) => {
      const m = chunk
        .trim()
        .match(/^([a-z]{3})[a-z]*\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
      if (!m) return null;
      const day = DAY_NAMES.indexOf(m[1].toLowerCase());
      if (day < 0) return null;
      return {
        day,
        from: hhmm(m[2], m[3], m[4]),
        to: hhmm(m[5], m[6], m[7]),
      };
    })
    .filter(Boolean);
}

function hhmm(h, m, ampm) {
  let hour = parseInt(h, 10);
  if (ampm) {
    const pm = /pm/i.test(ampm);
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  return `${String(hour).padStart(2, "0")}:${m || "00"}`;
}

export function formatWindows(windows) {
  return (windows || []).map((w) => `${DAY_NAMES[w.day]} ${w.from}-${w.to}`).join(", ");
}

export function parseLocations(raw) {
  return String(raw || "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({
      name: s.replace(/\s*\((public|private)\)\s*/i, "").trim(),
      public: /\(public\)/i.test(s),
    }));
}

export function formatLocations(locations) {
  return (locations || []).map((l) => (l.public ? `${l.name} (public)` : l.name)).join(", ");
}
