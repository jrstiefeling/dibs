import { setContentScript, log, resetStore, raw } from "./chrome-mock.mjs";

// Import the ACTUAL shipped files. Nothing reimplemented.
const D = new URL("../", import.meta.url).pathname;
const storage   = await import(D + "storage.js");
const llm       = await import(D + "llm.js");
const queue     = await import(D + "queue.js");
const agent     = await import(D + "agent.js");
const scan      = await import(D + "scan.js");
const ledger    = await import(D + "ledger.js");
const rep       = await import(D + "reputation.js");
const sched     = await import(D + "scheduler.js");

let pass = 0, fail = 0;
const t = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

console.log("\n=== 1. Real modules import and expose what background.js needs ===");
for (const [mod, names] of [
  [storage, ["getSettings","saveSettings","getListings","addListing","updateListing","markPlaybookProven","getThreadStates","saveThreadState","recordUsage","getUsage","saveDraft","getDraft"]],
  [llm, ["classify","floorToday","decideOffer","renderTemplate","vary","cloud","parseJson","readAmount"]],
  [queue, ["getQueue","enqueue","removeFromQueue","patchQueueItem","recordOutcome","getStats","suggestPromotion","maybeDemote","setMode","saveVoiceExample"]],
  [agent, ["decide","scoreThread","extractOffers","PLAYBOOKS","DEFAULT_MODES"]],
  [scan, ["processOpenThread","sweep","messengerTabs"]],
]) {
  for (const n of names) t(`export ${n}`, typeof mod[n] !== "undefined");
}

console.log("\n=== 2. Settings round-trip through real storage ===");
resetStore();
let s = await storage.getSettings();
t("defaults present", s.anchorPct === 18 && s.floorPct === 85 && s.askAbove === 300, JSON.stringify(s).slice(0,120));
t("readerHealthy starts null (never checked)", s.readerHealthy === null);
t("calendar off by default", s.calendarOn === false);
t("sweep off by default", s.sweepThreads === false);
await storage.saveSettings({ anchorPct: 20 });
s = await storage.getSettings();
t("save merges without wiping", s.anchorPct === 20 && s.floorPct === 85);

console.log("\n=== 3. A listing goes in and can be updated ===");
await storage.saveDraft({ title: "Aeron chair", pricing: { listPrice: 449, target: 380, floor: 323 }, facts: ["Size B","One worn armrest pad"], sweeteners: ["I'll include the lumbar support"], firmNos: ["no shipping"], area: "Austin" });
const draft = await storage.getDraft();
t("draft persisted", draft?.pricing?.target === 380);
await storage.addListing({
  url: "https://www.facebook.com/marketplace/item/999", title: draft.title,
  listPrice: 449, target: 380, floor: 323, area: "Austin",
  facts: draft.facts, sweeteners: draft.sweeteners, firmNos: draft.firmNos,
});
let [listing] = await storage.getListings();
t("listing stored with an id", !!listing.id);
t("postedAt set", typeof listing.postedAt === "number");
// backdate to day 4 so the floor curve is exercised
await storage.updateListing(listing.id, { postedAt: Date.now() - 4 * 864e5 });
[listing] = await storage.getListings();
t("updateListing actually writes", Date.now() - listing.postedAt > 3 * 864e5);
const fl = llm.floorToday(listing.target, await storage.getSettings(), listing.postedAt);
t(`floorToday gives a day-4 number (${fl})`, fl > 0 && fl < listing.target, `got ${fl}`);

console.log("\n=== 4. processOpenThread: the loop that was missing entirely ===");
// Mock the content script returning a real-shaped thread.
setContentScript((msg) => {
  if (msg.type === "dibs:read-thread") return {
    ok: true, account: "5551", threadId: "111", listingRef: "999",
    buyerName: "Dana R.", health: 1, canary: "untested", lastFrom: "buyer",
    messages: [
      { from: "buyer", text: "is this still available?" },
      { from: "me",    text: "Yep, still available — when were you thinking you could pick it up?" },
      { from: "buyer", text: "how about 300" },
    ],
  };
  if (msg.type === "dibs:list-threads") return { ok: true, account: "5551", threads: [] };
  return { ok: false, reason: "unhandled" };
});

const r1 = await scan.processOpenThread(7);
t("processOpenThread succeeds", r1.ok, JSON.stringify(r1));
t("it queued something", r1.reason === "queued", `reason=${r1.reason}`);
let q = await queue.getQueue();
t("queue has exactly one item", q.length === 1, `len=${q.length}`);
const item = q[0];
t("item knows its listing title", item.listingTitle === "Aeron chair", item.listingTitle);
t("item knows the buyer", item.buyerName === "Dana R.");
t("item carries floorNow", typeof item.floorNow === "number", String(item.floorNow));
t("item carries the day count", item.day === 4, String(item.day));
t("item quotes what the buyer said", /300/.test(item.buyerMessage), item.buyerMessage);
t("first offer gets countered", item.action === "reply" && /\$/.test(item.text || ""), `${item.action} / ${item.text}`);
t("expensive item held for human", item.mode === "manual", `mode=${item.mode} held=${JSON.stringify(item.heldBecause)}`);
t("reason given for holding", (item.heldBecause||[]).length > 0, JSON.stringify(item.heldBecause));

console.log("\n=== 5. Thread state + rollup actually persisted ===");
const states = await storage.getThreadStates("999");
t("thread state saved", states.length === 1, `len=${states.length}`);
t("best offer recorded", states[0].bestOffer === 300, String(states[0].bestOffer));
t("score computed (non-zero)", states[0].score > 0, String(states[0].score));
[listing] = await storage.getListings();
t("listing rollup written (inquiries)", listing.inquiries === 1, String(listing.inquiries));
t("listing rollup written (bestOffer)", listing.bestOffer === 300, String(listing.bestOffer));
t("credibleBuyers is a number", typeof listing.credibleBuyers === "number", String(listing.credibleBuyers));

console.log("\n=== 6. Idempotency: same thread, no new buyer message ===");
const r2 = await scan.processOpenThread(7);
t("does not double-queue", (await queue.getQueue()).length === 1, `len=${(await queue.getQueue()).length}`);
t("says why", r2.reason === "already_queued", r2.reason);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
