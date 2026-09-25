// Everything Dibs remembers. Settings and usage are shared; listings and
// buyer threads are scoped per Facebook account.

const DEFAULTS = {
  apiKey: "",
  anchorPct: 18, // list price sits this % above target
  floorPct: 85, // day-0 floor as % of target
  askAbove: 300, // above this dollar amount, always queue for the human
  floorDecay: { early: 1.0, mid: 0.94, late: 0.88 }, // day 0-3 / 4-9 / 10+
  quietHours: [23, 7],
  replyDelay: [120, 900], // seconds, randomised
  dailySendCap: 40,
  shadowMinutes: 10, // how long a shadow send waits before it goes
  sweepThreads: false, // navigate the Messenger tab through unread threads
  readerHealthy: null, // null = never checked, false = autonomy locked off
  calendarOn: false,
};

export async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...(stored.settings || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getListings() {
  const { listings } = await chrome.storage.local.get("listings");
  return listings || [];
}

export async function addListing(listing) {
  const listings = await getListings();
  listings.push({ ...listing, id: crypto.randomUUID(), postedAt: Date.now() });
  await chrome.storage.local.set({ listings });
  return listings;
}

export async function updateListing(id, patch) {
  const listings = await getListings();
  const next = listings.map((l) => (l.id === id ? { ...l, ...patch } : l));
  await chrome.storage.local.set({ listings: next });
  return next.find((l) => l.id === id);
}

// Records that a playbook has run once on this listing under supervision, so
// the "first time on this listing" guardrail stops forcing shadow mode.
export async function markPlaybookProven(listingId, playbook) {
  const listings = await getListings();
  const target = listings.find((l) => l.id === listingId);
  if (!target) return null;
  const proven = new Set(target.provenPlaybooks || []);
  proven.add(playbook);
  return updateListing(listingId, { provenPlaybooks: [...proven] });
}

/* ------------------------- per-thread buyer state ------------------------ */
// Kept so the two-buyer check can compare buyers without navigating around
// someone's Messenger tab.

export async function getThreadStates(listingRef) {
  const { threadStates = {} } = await chrome.storage.local.get("threadStates");
  const rows = Object.values(threadStates);
  return listingRef ? rows.filter((t) => t.listingRef === listingRef) : rows;
}

export async function saveThreadState(threadId, patch) {
  const { threadStates = {} } = await chrome.storage.local.get("threadStates");
  threadStates[threadId] = { ...(threadStates[threadId] || {}), threadId, ...patch, seenAt: Date.now() };
  await chrome.storage.local.set({ threadStates });
  return threadStates[threadId];
}

export async function saveDraft(draft) {
  await chrome.storage.local.set({ draft });
}

export async function getDraft() {
  const { draft } = await chrome.storage.local.get("draft");
  return draft || null;
}

// --- usage metering -------------------------------------------------------
// The point of the meter is to make it obvious when something is misrouted:
// tier 2 should stay small and boring.

const PRICE_PER_MTOK = { in: 3, out: 15 };

export async function recordUsage(tier, tokensIn = 0, tokensOut = 0) {
  const month = new Date().toISOString().slice(0, 7);
  const { usage = {} } = await chrome.storage.local.get("usage");
  const m = usage[month] || { tier0: 0, tier1: 0, tier2: 0, cost: 0 };
  m[`tier${tier}`] += 1;
  if (tier === 2) {
    m.cost +=
      (tokensIn / 1e6) * PRICE_PER_MTOK.in +
      (tokensOut / 1e6) * PRICE_PER_MTOK.out;
  }
  usage[month] = m;
  await chrome.storage.local.set({ usage });
  return m;
}

export async function getUsage() {
  const month = new Date().toISOString().slice(0, 7);
  const { usage = {} } = await chrome.storage.local.get("usage");
  return usage[month] || { tier0: 0, tier1: 0, tier2: 0, cost: 0 };
}
