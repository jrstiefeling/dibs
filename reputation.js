// Buyer memory, shared across both accounts. Someone who no-showed on her
// listing gets flagged the moment they message you. Nothing else in this
// category does that, and it's the main reason two accounts share one tool.

const KEY = "buyers";

function normalise(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getBuyer(name) {
  const { [KEY]: all = {} } = await chrome.storage.local.get(KEY);
  return (
    all[normalise(name)] || {
      name,
      deals: 0,
      noShows: 0,
      lowballs: 0,
      flagged: false,
      flagNote: "",
      firstSeen: Date.now(),
    }
  );
}

export async function updateBuyer(name, patch) {
  const { [KEY]: all = {} } = await chrome.storage.local.get(KEY);
  const key = normalise(name);
  const next = { ...(await getBuyer(name)), ...patch, name, lastSeen: Date.now() };
  all[key] = next;
  await chrome.storage.local.set({ [KEY]: all });
  return next;
}

export async function flagBuyer(name, note) {
  return updateBuyer(name, { flagged: true, flagNote: note });
}

export async function recordNoShow(name) {
  const b = await getBuyer(name);
  return updateBuyer(name, {
    noShows: b.noShows + 1,
    flagged: b.noShows + 1 >= 2,
    flagNote: b.noShows + 1 >= 2 ? "No-showed twice" : b.flagNote,
  });
}

export async function recordDeal(name) {
  const b = await getBuyer(name);
  return updateBuyer(name, { deals: b.deals + 1 });
}

// A known-good repeat buyer is worth a little something. Small, deliberate,
// and capped — this is goodwill, not a discount policy.
export function goodwill(buyer) {
  if (buyer.flagged) return 0;
  if (buyer.deals >= 2) return 0.05;
  if (buyer.deals === 1) return 0.03;
  return 0;
}

export async function allBuyers() {
  const { [KEY]: all = {} } = await chrome.storage.local.get(KEY);
  return Object.values(all).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}
