// The missing link: reads the open thread, runs it through the decision
// engine, and puts the result in the queue.
//
// Dibs only ever reads the thread you currently have open. It does not go
// rummaging through your Messenger on its own — that's both invasive and
// exactly the kind of behaviour that gets an account flagged. The one
// exception is an off-by-default sweep that steps through unread Marketplace
// threads one at a time, which you have to switch on yourself.
//
// Buyer state is remembered per thread, so the two-buyer comparison can weigh
// people against each other without needing them all open at once.

import { getSettings, getListings, getThreadStates, saveThreadState, updateListing } from "./storage.js";
import { decide, scoreThread, extractOffers } from "./agent.js";
import { floorToday } from "./llm.js";
import { enqueue, getQueue } from "./queue.js";
import { push } from "./notify.js";

export async function messengerTabs() {
  return chrome.tabs.query({ url: "https://www.facebook.com/messages/*" });
}

/* --------------------------- process one thread -------------------------- */

export async function processOpenThread(tabId) {
  const settings = await getSettings();

  let thread;
  try {
    thread = await chrome.tabs.sendMessage(tabId, { type: "dibs:read-thread" });
  } catch {
    return { ok: false, reason: "no_content_script" };
  }
  if (!thread?.ok) return { ok: false, reason: thread?.reason || "unreadable" };

  const listings = await getListings();
  const listing = thread.listingRef
    ? listings.find((l) => l.url?.includes(thread.listingRef))
    : null;

  if (!listing) {
    return { ok: false, reason: "listing_not_tracked", listingRef: thread.listingRef };
  }

  // Remember this buyer's state whether or not we act on it.
  const offers = extractOffers(thread.messages);
  const score = scoreThread(thread, listing);
  await saveThreadState(thread.threadId, {
    listingRef: thread.listingRef,
    buyerName: thread.buyerName,
    score,
    bestOffer: offers.length ? Math.max(...offers) : null,
    lastFrom: thread.lastFrom,
    messageCount: thread.messages.length,
  });

  await refreshListingRollup(listing, thread.listingRef);

  // Nothing to answer if the last word was ours.
  if (thread.lastFrom !== "buyer") return { ok: true, reason: "nothing_to_answer" };

  // Don't re-decide something already sitting in the queue for this thread,
  // unless the buyer has said something new since.
  const queued = (await getQueue()).find((i) => i.threadId === thread.threadId);
  if (queued && queued.messageCount === thread.messages.length) {
    return { ok: true, reason: "already_queued" };
  }

  // Today's floor, so the guardrail in agent.js has a real number to test
  // against rather than silently passing everything.
  const floorNow = floorToday(listing.target, settings, listing.postedAt);
  const day = Math.floor((Date.now() - listing.postedAt) / 86400000);

  const siblings = (await getThreadStates(thread.listingRef))
    .filter((t) => t.threadId !== thread.threadId)
    .map((t) => ({ ...t, note: describeBuyer(t, listing) }));

  const allThreads = [
    ...siblings,
    { threadId: thread.threadId, buyerName: thread.buyerName, score, bestOffer: offers.length ? Math.max(...offers) : null, note: describeBuyer({ score, bestOffer: offers.at(-1) }, listing) },
  ];

  const decision = await decide({
    thread,
    listing: { ...listing, floorNow, area: listing.area || "" },
    allThreads,
  });

  if (!decision) return { ok: true, reason: "no_decision" };

  const entry = {
    ...decision,
    threadId: thread.threadId,
    listingId: listing.id,
    listingRef: thread.listingRef,
    listingTitle: listing.title,
    buyerName: thread.buyerName,
    buyerMessage: [...thread.messages].reverse().find((m) => m.from === "buyer")?.text || "",
    messageCount: thread.messages.length,
    day,
    floorNow,
  };

  // no_reply and park never need a card; they're recorded and left alone.
  if (decision.action === "no_reply") {
    await saveThreadState(thread.threadId, { coldOff: true, note: decision.note });
    return { ok: true, reason: "cold_off" };
  }

  await enqueue(entry);

  if (decision.action === "escalate") {
    await push(
      decision.playbook === "buyer_selection" ? "Dibs — two buyers, one item" : "Dibs needs you",
      `${thread.buyerName || "A buyer"} on ${listing.title}: ${decision.reason || "needs a decision"}`,
      { urgent: true }
    );
  }

  return { ok: true, reason: "queued", action: decision.action, playbook: decision.playbook };
}

function describeBuyer(t, listing) {
  const bits = [];
  if (t.bestOffer) bits.push(`offered $${t.bestOffer}`);
  if (t.score >= 0.8) bits.push("very keen");
  else if (t.score >= 0.6) bits.push("serious");
  else if (t.score > 0) bits.push("lukewarm");
  if (t.bestOffer && listing?.target && t.bestOffer >= listing.target) bits.push("at your number");
  return bits.join(", ");
}

/* ------------------------- listing-level rollup -------------------------- */
// Feeds the interest thermometer and the underpriced alert.

async function refreshListingRollup(listing, listingRef) {
  const states = await getThreadStates(listingRef);
  const live = states.filter((t) => !t.coldOff);
  const offers = live.map((t) => t.bestOffer).filter((n) => typeof n === "number");
  const dayAgo = Date.now() - 86400000;

  await updateListing(listing.id, {
    credibleBuyers: live.filter((t) => t.score >= 0.6).length,
    inquiries: states.length,
    inquiries24h: states.filter((t) => t.seenAt > dayAgo).length,
    offers: offers.length,
    bestOffer: offers.length ? Math.max(...offers) : null,
  });
}

/* -------------------------- optional thread sweep ------------------------ */
// Off by default. When on, steps through unread Marketplace threads one at a
// time with a gap between each, rather than hammering through them.

export async function sweep(tabId) {
  const settings = await getSettings();
  if (!settings.sweepThreads) return { ok: true, reason: "sweep_off" };

  let list;
  try {
    list = await chrome.tabs.sendMessage(tabId, { type: "dibs:list-threads" });
  } catch {
    return { ok: false, reason: "no_content_script" };
  }
  if (!list?.ok) return { ok: false, reason: "no_thread_list" };

  const { sweptToday = {} } = await chrome.storage.local.get("sweptToday");
  const today = new Date().toDateString();
  const done = sweptToday.day === today ? sweptToday.ids || [] : [];

  const next = list.threads.find((t) => t.unread && !done.includes(t.id));
  if (!next) return { ok: true, reason: "nothing_unread" };

  await chrome.tabs.update(tabId, { url: `https://www.facebook.com/messages/t/${next.id}` });
  await new Promise((r) => setTimeout(r, 3500)); // let it load like a person would

  const res = await processOpenThread(tabId);

  await chrome.storage.local.set({
    sweptToday: { day: today, ids: [...done, next.id] },
  });

  return { ok: true, reason: "swept", thread: next.id, result: res.reason };
}
