// The queue is the whole interface in Simple Mode. Items land here, you
// approve them, and the stats those approvals generate are what drive
// graduation from manual to shadow to auto.

import { getSettings, saveSettings } from "./storage.js";
import { PLAYBOOKS, DEFAULT_MODES } from "./agent.js";

const KEY = "queue";
const STATS = "playbookStats";

export async function getQueue() {
  const { [KEY]: q = [] } = await chrome.storage.local.get(KEY);
  return q.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || a.createdAt - b.createdAt);
}

export async function enqueue(item) {
  const q = await getQueue();
  const settings = await getSettings();
  // One pending item per thread. A newer decision supersedes an older one.
  const filtered = q.filter((i) => i.threadId !== item.threadId);
  // Both shadow and auto hold before sending — shadow for ten minutes so you
  // can veto, auto for the randomised reply delay so it isn't answering
  // buyers in under a second like a robot. Manual waits indefinitely.
  const holdMs =
    item.mode === "shadow"
      ? (item.shadowMinutes ?? settings.shadowMinutes ?? 10) * 60000
      : item.mode === "auto"
      ? (item.delaySeconds ?? 180) * 1000
      : null;

  const entry = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: holdMs ? "holding" : "waiting",
    sendAt: holdMs ? Date.now() + holdMs : null,
    urgent: item.action === "escalate",
    ...item,
  };
  filtered.push(entry);
  await chrome.storage.local.set({ [KEY]: filtered });
  return entry;
}

export async function removeFromQueue(id) {
  const q = await getQueue();
  await chrome.storage.local.set({ [KEY]: q.filter((i) => i.id !== id) });
}

export async function patchQueueItem(id, patch) {
  const q = await getQueue();
  const next = q.map((i) => (i.id === id ? { ...i, ...patch } : i));
  await chrome.storage.local.set({ [KEY]: next });
  return next.find((i) => i.id === id);
}

/* ------------------------- stats & graduation --------------------------- */

export async function recordOutcome(playbook, outcome) {
  const { [STATS]: stats = {} } = await chrome.storage.local.get(STATS);
  const s = stats[playbook] || { approved: 0, edited: 0, rejected: 0, cancelled: 0, regret: 0 };
  s[outcome] = (s[outcome] || 0) + 1;
  stats[playbook] = s;
  await chrome.storage.local.set({ [STATS]: stats });
  return s;
}

export async function getStats() {
  const { [STATS]: stats = {} } = await chrome.storage.local.get(STATS);
  return stats;
}

// Watches your own approval behaviour and offers the promotion, so you never
// have to remember to go and adjust anything.
export async function suggestPromotion() {
  const settings = await getSettings();
  const modes = settings.modes || DEFAULT_MODES;
  const stats = await getStats();

  for (const [name, meta] of Object.entries(PLAYBOOKS)) {
    if (!meta.graduatable) continue;
    const s = stats[name];
    if (!s) continue;
    const total = s.approved + s.edited + s.rejected;
    if (total < 8) continue;
    const cleanRate = s.approved / total;

    if (modes[name] === "manual" && cleanRate >= 0.85 && s.rejected === 0) {
      return {
        playbook: name,
        label: meta.label,
        to: "shadow",
        line: `${s.approved} sent as written, ${s.edited} edited, none rejected. You've barely touched these.`,
      };
    }
    if (modes[name] === "shadow" && s.cancelled === 0 && s.regret === 0 && total >= 15) {
      return {
        playbook: name,
        label: meta.label,
        to: "auto",
        line: `${total} through shadow mode and you've never hit cancel.`,
      };
    }
  }
  return null;
}

// Trust moves in both directions. Two cancels or two regrets and it steps back
// on its own, and tells you why.
export async function maybeDemote(playbook) {
  const stats = await getStats();
  const s = stats[playbook];
  if (!s) return null;
  const bad = (s.cancelled || 0) + (s.regret || 0);
  if (bad < 2) return null;

  const settings = await getSettings();
  const modes = { ...(settings.modes || DEFAULT_MODES) };
  const order = ["manual", "shadow", "auto"];
  const idx = order.indexOf(modes[playbook] || "manual");
  if (idx <= 0) return null;

  modes[playbook] = order[idx - 1];
  await saveSettings({ modes });
  await chrome.storage.local.set({
    [STATS]: { ...stats, [playbook]: { ...s, cancelled: 0, regret: 0 } },
  });
  return { playbook, to: modes[playbook], reason: `${bad} corrections, so it stepped back to ${modes[playbook]}.` };
}

export async function setMode(playbook, mode) {
  const settings = await getSettings();
  const modes = { ...(settings.modes || DEFAULT_MODES), [playbook]: mode };
  await saveSettings({ modes });
  return modes;
}

/* ---------------------------- voice examples ---------------------------- */
// Every edit you make becomes an example. After enough of them it sounds like
// you, with no retraining — just accumulated examples.

export async function saveVoiceExample(playbook, draft, yours) {
  if (draft.trim() === yours.trim()) return;
  const { voice = {} } = await chrome.storage.local.get("voice");
  const list = voice[playbook] || [];
  list.unshift({ draft, yours, at: Date.now() });
  voice[playbook] = list.slice(0, 25); // keep the prompt small on purpose
  await chrome.storage.local.set({ voice });
}

export async function getVoiceExamples(playbook) {
  const { voice = {} } = await chrome.storage.local.get("voice");
  return voice[playbook] || [];
}
