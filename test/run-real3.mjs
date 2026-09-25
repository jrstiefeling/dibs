import { setContentScript, log, resetStore } from "./chrome-mock.mjs";
const D = new URL("../", import.meta.url).pathname;
const storage=await import(D + "storage.js");
const queue  =await import(D + "queue.js");
const agent  =await import(D + "agent.js");
const scan   =await import(D + "scan.js");
const sched  =await import(D + "scheduler.js");
const ledger =await import(D + "ledger.js");
const rep    =await import(D + "reputation.js");
const notify =await import(D + "notify.js");

let pass=0,fail=0;
const t=(n,c,e="")=>{c?(pass++,console.log(`  ok   ${n}`)):(fail++,console.log(`  FAIL ${n} ${e}`));};

console.log("\n=== F. The graduation ladder, driven by real stats ===");
resetStore();
await storage.saveSettings({ modes:{...agent.DEFAULT_MODES} });
t("everything starts manual", (await storage.getSettings()).modes.availability==="manual");
t("no promotion with no history", (await queue.suggestPromotion())===null);
for(let i=0;i<7;i++) await queue.recordOutcome("availability","approved");
t("still nothing at 7 (needs 8)", (await queue.suggestPromotion())===null);
await queue.recordOutcome("availability","approved");
let promo = await queue.suggestPromotion();
t("offers shadow at 8 clean approvals", promo?.playbook==="availability" && promo.to==="shadow", JSON.stringify(promo));
t("promotion line quotes real numbers", /8/.test(promo?.line||""), promo?.line);

await queue.recordOutcome("availability","rejected");
t("one rejection withdraws the offer", (await queue.suggestPromotion())===null);

// clean slate, walk to auto
resetStore();
await storage.saveSettings({ modes:{...agent.DEFAULT_MODES, availability:"shadow"} });
for(let i=0;i<15;i++) await queue.recordOutcome("availability","approved");
promo = await queue.suggestPromotion();
t("offers auto after 15 clean shadow sends", promo?.to==="auto", JSON.stringify(promo));
await queue.recordOutcome("availability","cancelled");
await queue.recordOutcome("availability","cancelled");
const dem = await queue.maybeDemote("availability");
t("two cancels demotes it automatically", dem?.to==="manual", JSON.stringify(dem));
t("demotion explains why", /correction/i.test(dem?.reason||""), dem?.reason);
t("mode actually changed in storage", (await storage.getSettings()).modes.availability==="manual");

console.log("\n=== G. Playbooks that must never graduate ===");
for (const [k,v] of Object.entries(agent.PLAYBOOKS)) {
  if (["red_flag","unknown","considered_reengage","buyer_selection"].includes(k))
    t(`${k} is locked`, v.graduatable===false);
}
// even if someone forces it in storage, finish() must ignore it
resetStore();
await storage.saveSettings({ modes:{ red_flag:"auto" }, readerHealthy:true, askAbove:9999 });
await storage.addListing({url:"https://www.facebook.com/marketplace/item/999",title:"T",listPrice:50,target:45,provenPlaybooks:["red_flag"],area:"X",facts:[]});
const [L]=await storage.getListings();
await storage.updateListing(L.id,{postedAt:Date.now()-864e5});
setContentScript(m=>m.type==="dibs:read-thread"?{ok:true,threadId:"111",listingRef:"999",buyerName:"B",health:1,canary:"untested",lastFrom:"buyer",messages:[{from:"buyer",text:"can you ship it"}]}:{ok:true,threads:[]});
await scan.processOpenThread(7);
t("forcing red_flag to auto is ignored", (await queue.getQueue())[0]?.mode==="manual", (await queue.getQueue())[0]?.mode);

console.log("\n=== H. Reader health gate kills autonomy globally ===");
resetStore();
await storage.saveSettings({ modes:{availability:"auto"}, readerHealthy:false, askAbove:9999 });
await storage.addListing({url:"https://www.facebook.com/marketplace/item/999",title:"T",listPrice:50,target:45,provenPlaybooks:["availability"],area:"X",facts:[]});
const [L2]=await storage.getListings();
await storage.updateListing(L2.id,{postedAt:Date.now()-864e5});
setContentScript(m=>m.type==="dibs:read-thread"?{ok:true,threadId:"111",listingRef:"999",buyerName:"B",health:1,canary:"untested",lastFrom:"buyer",messages:[{from:"buyer",text:"still available?"}]}:{ok:true,threads:[]});
await scan.processOpenThread(7);
let c=(await queue.getQueue())[0];
t("auto forced to manual when reader unhealthy", c?.mode==="manual", c?.mode);
t("says it can't read the thread", (c?.heldBecause||[]).some(h=>/read/.test(h)), JSON.stringify(c?.heldBecause));

console.log("\n=== I. Quiet hours (verified separately in quiet.mjs across timezones) ===");
{
  const h = new Date().getHours();
  // Build a window that genuinely contains the current hour, wrapping if need be.
  const qh = h === 23 ? [23, 1] : [h, h + 1];
  resetStore();
  await storage.saveSettings({ modes:{availability:"auto"}, readerHealthy:true, askAbove:9999, quietHours:qh });
  await storage.addListing({url:"https://www.facebook.com/marketplace/item/999",title:"T",listPrice:50,target:45,provenPlaybooks:["availability"],area:"X",facts:[]});
  const [LQ]=await storage.getListings();
  await storage.updateListing(LQ.id,{postedAt:Date.now()-864e5});
  setContentScript(m=>m.type==="dibs:read-thread"?{ok:true,threadId:"111",listingRef:"999",buyerName:"B",health:1,canary:"untested",lastFrom:"buyer",messages:[{from:"buyer",text:"still available?"}]}:{ok:true,threads:[]});
  await scan.processOpenThread(7);
  const cq=(await queue.getQueue())[0];
  t(`quiet window [${qh}] at hour ${h} forces manual`, cq?.mode==="manual" && (cq?.heldBecause||[]).includes("quiet hours"), JSON.stringify(cq?.heldBecause));

  resetStore();
  await storage.saveSettings({ modes:{availability:"auto"}, readerHealthy:true, askAbove:9999, quietHours:[(h+3)%24,(h+4)%24] });
  await storage.addListing({url:"https://www.facebook.com/marketplace/item/999",title:"T",listPrice:50,target:45,provenPlaybooks:["availability"],area:"X",facts:[]});
  const [LW]=await storage.getListings();
  await storage.updateListing(LW.id,{postedAt:Date.now()-864e5});
  await scan.processOpenThread(7);
  const cw=(await queue.getQueue())[0];
  t("outside quiet hours autonomy is allowed", cw?.mode!=="manual" || !(cw?.heldBecause||[]).includes("quiet hours"), `${cw?.mode} ${JSON.stringify(cw?.heldBecause)}`);
}

console.log("\n=== J. Scheduler works with no calendar at all ===");
resetStore();
const windows = sched.parseWindows("sat 10:00-14:00, sun 12-4pm, wed 6pm-8pm");
t("parses 24h and am/pm mixed", windows.length===3, JSON.stringify(windows));
t("sat parsed", windows.find(w=>w.day===6)?.from==="10:00");
t("12-4pm -> 12:00-16:00", windows.find(w=>w.day===0)?.to==="16:00", JSON.stringify(windows.find(w=>w.day===0)));
t("6pm-8pm -> 18:00-20:00", windows.find(w=>w.day===3)?.from==="18:00", JSON.stringify(windows.find(w=>w.day===3)));
t("round-trips to text", /sat 10:00-14:00/.test(sched.formatWindows(windows)), sched.formatWindows(windows));
t("garbage input yields nothing, not a crash", sched.parseWindows("whenever lol").length===0);

await storage.saveSettings({ windows, calendarOn:false });
const slots = await sched.proposeSlots(await storage.getSettings(), 3);
t("proposes slots with calendar off", slots.length===3, String(slots.length));
t("flags that it did not check a calendar", slots.every(s=>s.checkedAgainstCalendar===false));
t("spread across different days", new Set(slots.map(s=>s.start.slice(0,10))).size===3, JSON.stringify(slots.map(s=>s.label)));
t("all in the future", slots.every(s=>new Date(s.start)>new Date()));
const book = await sched.bookSlot({slot:slots[0],buyerName:"B",listingTitle:"T"});
t("booking degrades gracefully with no calendar", book.ok===false && book.reason==="calendar_off", JSON.stringify(book));
const conn = await sched.connectCalendar();
t("connect fails cleanly without an oauth id", conn.ok===false && /OAuth/i.test(conn.reason), JSON.stringify(conn));

const locs = sched.parseLocations("Police exchange lot on 5th (public), my driveway");
t("locations parse with public flag", locs.length===2 && locs[0].public===true && locs[1].public===false, JSON.stringify(locs));
const pick = sched.locationFor({locations:locs},{listPrice:400},{deals:0});
t("expensive + new buyer -> public spot", pick?.public===true, JSON.stringify(pick));
const pick2 = sched.locationFor({locations:locs},{listPrice:40},{deals:3});
t("cheap + repeat buyer -> either is fine", !!pick2, JSON.stringify(pick2));

console.log("\n=== K. Ledger and diagnosis ===");
resetStore();
await ledger.recordSale({listing:{title:"Dining table",listPrice:79,target:70},finalPrice:65,buyerName:"D",days:5,inquiries:6});
await ledger.recordSale({listing:{title:"Oak dining chairs",listPrice:120,target:100},finalPrice:100,buyerName:"P",days:2,inquiries:9});
const perf = await ledger.performance();
t("performance computes", perf.sales===2, JSON.stringify(perf));
t("realised % is sane", perf.avgRealised>0.8 && perf.avgRealised<=1.1, String(perf.avgRealised));
const prior = await ledger.priorFor("Dining table oak");
t("finds your own prior sale as a comp", prior?.count>=1, JSON.stringify(prior));
t("underpriced fires on day 1", ledger.diagnose({days:1,views:20,inquiries:6})?.verdict==="underpriced");
t("presentation problem on low views", ledger.diagnose({days:6,views:12,inquiries:0})?.verdict==="presentation");
t("price problem on high views/no msgs", ledger.diagnose({days:7,views:140,inquiries:1})?.verdict==="price");
t("stale at day 12", ledger.diagnose({days:12,views:60,inquiries:3})?.verdict==="stale");
t("healthy listing -> no verdict", ledger.diagnose({days:4,views:50,inquiries:2})===null);

console.log("\n=== L. Reputation across accounts ===");
resetStore();
await rep.recordNoShow("Chris P.");
let b = await rep.getBuyer("chris p.");   // different casing
t("lookup is case-insensitive", b.noShows===1, JSON.stringify(b));
await rep.recordNoShow("Chris P.");
b = await rep.getBuyer("Chris P.");
t("two no-shows auto-flags", b.flagged===true, JSON.stringify(b));
await rep.recordDeal("Sam W.");
t("goodwill for a repeat buyer", rep.goodwill(await rep.getBuyer("Sam W."))>0);
t("no goodwill for a flagged one", rep.goodwill(b)===0);

console.log("\n=== M. Notifications: channels off by default, no crash ===");
resetStore();
log.notifications.length=0; log.fetches.length=0;
let hit = await notify.push("Test","body");
t("desktop always fires", hit.includes("desktop"), JSON.stringify(hit));
t("no network calls with nothing configured", log.fetches.length===0, JSON.stringify(log.fetches.map(f=>f.url)));
await storage.saveSettings({ ntfyTopic:"dibs-abc123", discordWebhook:"https://discord.com/api/webhooks/x" });
hit = await notify.push("Test2","body2");
t("ntfy used when set", hit.includes("ntfy"), JSON.stringify(hit));
t("discord used when set", hit.includes("discord"), JSON.stringify(hit));
t("ntfy posts to the topic url", log.fetches.some(f=>f.url.includes("ntfy.sh/dibs-abc123")), JSON.stringify(log.fetches.map(f=>f.url)));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exitCode=1;
