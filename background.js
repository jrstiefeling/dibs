// The clock. Nothing here touches Facebook on its own — the alarms do
// arithmetic on stored numbers and surface results. Any actual sending
// requires a Messenger tab to be open and an instruction from the panel.

import { getSettings, getListings, markPlaybookProven } from "./storage.js";
import { processOpenThread, sweep, messengerTabs } from "./scan.js";
import { getQueue, patchQueueItem, removeFromQueue, recordOutcome, suggestPromotion } from "./queue.js";
import { floorToday } from "./llm.js";
import { push, dailyDigest, pushReaderAlarm } from "./notify.js";
import { diagnose } from "./ledger.js";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create("dibs:tick", { periodInMinutes: 2 });
  chrome.alarms.create("dibs:daily", { periodInMinutes: 60 });
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) await chrome.storage.local.set({ settings: {} });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "dibs:tick") await tick();
  if (alarm.name === "dibs:daily") await maybeDaily();
});

/* ------------------------------- the tick ------------------------------- */

async function tick() {
  await checkReader();
  await scanThreads();
  await releaseShadowHolds();
  await reviewParked();
  await badge();
}

// Reads whatever thread is open and runs it through the decision engine.
// This is the loop that actually makes Dibs do anything.
async function scanThreads() {
  const tabs = await messengerTabs();
  if (!tabs.length) return;

  for (const tab of tabs) {
    const res = await processOpenThread(tab.id);
    if (res.reason === "listing_not_tracked" && res.listingRef) {
      // Worth telling them once — a buyer is messaging about something Dibs
      // doesn't know the prices for.
      const { untracked = [] } = await chrome.storage.local.get("untracked");
      if (!untracked.includes(res.listingRef)) {
        await chrome.storage.local.set({ untracked: [...untracked, res.listingRef].slice(-20) });
        await push(
          "Dibs doesn't know this listing",
          "Someone's messaging about an item you haven't added. Paste its link on the Listings tab and Dibs can take over."
        );
      }
    }
  }

  const [first] = tabs;
  if (first) await sweep(first.id);
}

// Runs before anything else in the tick. If the canary fails or confidence
// drops, autonomy is switched off globally until a human re-checks it.
async function checkReader() {
  const tabs = await chrome.tabs.query({ url: "https://www.facebook.com/messages/*" });
  if (!tabs.length) return; // nothing to check against; leave the flag alone

  for (const tab of tabs) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "dibs:health" });
      if (!res) continue;

      const bad = res.canary === "fail" || (res.ok && res.health < 0.7) || res.reason === "low_confidence";
      const { settings = {} } = await chrome.storage.local.get("settings");

      if (bad && settings.readerHealthy !== false) {
        await chrome.storage.local.set({
          settings: { ...settings, readerHealthy: false, readerFailedAt: Date.now(), readerFailReason: res.canary === "fail" ? "canary failed" : `confidence ${res.health}` },
        });
        await pushReaderAlarm(res.canary === "fail" ? "its own last message went missing" : `only ${Math.round((res.health || 0) * 100)}% of the thread was readable`);
      } else if (!bad && res.ok && settings.readerHealthy === false) {
        // Recovered on its own — but a human still confirms before autonomy
        // comes back, so this only clears the alarm, not the lock.
        await chrome.storage.local.set({ settings: { ...settings, readerRecoveredAt: Date.now() } });
      }
      return;
    } catch {
      /* content script not injected in that tab; try the next */
    }
  }
}

// Shadow mode: the message was going to send, you had a window to stop it.
async function releaseShadowHolds() {
  const q = await getQueue();
  const due = q.filter((i) => i.status === "holding" && i.sendAt && i.sendAt <= Date.now());
  for (const item of due) {
    const sent = await trySend(item);
    if (sent.ok) {
      await recordOutcome(item.playbook, "approved");
      if (item.listingId && item.playbook) await markPlaybookProven(item.listingId, item.playbook);
      await removeFromQueue(item.id);
    } else {
      // Couldn't send — fall back to waiting on the human rather than retrying
      // blindly into a page that may have changed underneath us.
      await patchQueueItem(item.id, {
        status: "waiting",
        mode: "manual",
        heldBecause: [...(item.heldBecause || []), `couldn't send (${sent.reason})`],
      });
    }
  }
}

// Parked buyers get re-checked against today's floor on a schedule, not just
// when they message. A listing can quietly resolve itself on day twelve.
async function reviewParked() {
  const settings = await getSettings();
  const listings = await getListings();
  const q = await getQueue();

  for (const item of q) {
    if (item.action !== "park" || item.revisitAt > Date.now()) continue;
    const listing = listings.find((l) => l.url?.includes(item.listingRef));
    if (!listing) continue;

    const floor = floorToday(listing.target, settings, listing.postedAt);
    if (item.amount >= floor) {
      // First time this fires on any listing it comes to you for approval,
      // regardless of what the dials say.
      await patchQueueItem(item.id, {
        action: "escalate",
        status: "waiting",
        mode: "manual",
        urgent: true,
        playbook: "considered_reengage",
        reason: `${item.buyerName}'s $${item.amount} now clears the floor ($${floor}, day ${dayOf(listing)}). Go back to them?`,
      });
      await push("Dibs — a parked offer just cleared", `${item.buyerName}: $${item.amount} on ${listing.title}`, { urgent: true });
    } else {
      await patchQueueItem(item.id, { revisitAt: Date.now() + 2 * 86400000 });
    }
  }
}

function dayOf(listing) {
  return Math.floor((Date.now() - listing.postedAt) / 86400000);
}

async function sendsToday() {
  const { sendCount } = await chrome.storage.local.get("sendCount");
  const today = new Date().toDateString();
  return sendCount?.day === today ? sendCount.n : 0;
}

async function countSend() {
  const today = new Date().toDateString();
  const n = (await sendsToday()) + 1;
  await chrome.storage.local.set({ sendCount: { day: today, n } });
  return n;
}

async function trySend(item) {
  // Hard ceiling, well above real volume. It exists so that a bug or a loop
  // can't fire two hundred messages before anyone notices.
  const settings = await getSettings();
  const cap = settings.dailySendCap ?? 40;
  if ((await sendsToday()) >= cap) {
    await push(
      "Dibs stopped sending",
      `It hit the daily cap of ${cap} messages. That's far above normal, so something is probably wrong. Everything is queued.`,
      { urgent: true }
    );
    return { ok: false, reason: "daily_cap_reached" };
  }

  const tabs = await chrome.tabs.query({ url: "https://www.facebook.com/messages/*" });
  if (!tabs.length) return { ok: false, reason: "no_messenger_tab" };
  for (const tab of tabs) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, {
        type: "dibs:send",
        text: item.text,
        // Every precondition the content script will verify before typing.
        expect: {
          threadId: item.threadId,
          buyerName: item.buyerName,
          listingRef: item.listingRef,
        },
      });
      if (res?.ok) {
        await countSend();
        return res;
      }
    } catch {
      /* try the next tab */
    }
  }
  return { ok: false, reason: "thread_not_open" };
}

async function badge() {
  const q = await getQueue();
  const waiting = q.filter((i) => i.status === "waiting").length;
  chrome.action.setBadgeText({ text: waiting ? String(waiting) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#d6202f" });
}

/* ------------------------------ daily jobs ------------------------------ */

async function maybeDaily() {
  const hour = new Date().getHours();
  const { lastDigest } = await chrome.storage.local.get("lastDigest");
  const today = new Date().toDateString();
  if (hour < 18 || lastDigest === today) return;

  const listings = await getListings();
  const q = await getQueue();

  const enriched = listings.map((l) => ({
    ...l,
    days: dayOf(l),
    inquiries24h: l.inquiries24h || 0,
  }));

  for (const l of enriched) {
    const d = diagnose({ days: l.days, views: l.views || 0, inquiries: l.inquiries || 0, offers: l.offers || 0 });
    if (d) l.diagnosis = d;
  }

  await dailyDigest({
    listings: enriched,
    queue: q.filter((i) => i.status === "waiting"),
    sent: [],
    parked: q.filter((i) => i.action === "park"),
  });

  const promo = await suggestPromotion();
  if (promo) {
    await chrome.storage.local.set({ pendingPromotion: promo });
    await push("Dibs — ready to hand something over?", `${promo.label}: ${promo.line}`);
  }

  await chrome.storage.local.set({ lastDigest: today });
}

/* ------------------------------- messages ------------------------------- */

chrome.runtime.onMessage.addListener((msg, _s, respond) => {
  if (msg?.type === "dibs:send-now") {
    trySend(msg.item).then(respond);
    return true;
  }
  if (msg?.type === "dibs:refresh-badge") {
    badge().then(() => respond({ ok: true }));
    return true;
  }
});
