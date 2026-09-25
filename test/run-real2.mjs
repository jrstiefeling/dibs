import { setContentScript, log, resetStore } from "./chrome-mock.mjs";
const D = new URL("../", import.meta.url).pathname;
const storage = await import(D + "storage.js");
const llm     = await import(D + "llm.js");
const queue   = await import(D + "queue.js");
const agent   = await import(D + "agent.js");
const scan    = await import(D + "scan.js");
const rep     = await import(D + "reputation.js");
const sched   = await import(D + "scheduler.js");
const ledger  = await import(D + "ledger.js");
const notify  = await import(D + "notify.js");

let pass=0, fail=0;
const t=(n,c,e="")=>{c?(pass++,console.log(`  ok   ${n}`)):(fail++,console.log(`  FAIL ${n} ${e}`));};

async function seed({ listPrice=79, target=70, askAbove=300, days=4, modes={}, proven=[] }={}) {
  resetStore();
  await storage.saveSettings({ askAbove, modes, readerHealthy: true });
  await storage.addListing({
    url:"https://www.facebook.com/marketplace/item/999", title:"Dining table",
    listPrice, target, area:"Austin",
    facts:["Seats six","Solid oak","Small scratch on one leg"],
    sweeteners:["I'll throw in the chairs"], firmNos:["no shipping"],
    provenPlaybooks: proven,
  });
  const [l] = await storage.getListings();
  await storage.updateListing(l.id, { postedAt: Date.now() - days*864e5 });
  return (await storage.getListings())[0];
}

function thread(messages, { id="111", buyer="Dana R." }={}) {
  setContentScript((m) => {
    if (m.type==="dibs:read-thread") return { ok:true, account:"5551", threadId:id, listingRef:"999",
      buyerName:buyer, health:1, canary:"untested", lastFrom:messages.at(-1).from, messages };
    if (m.type==="dibs:list-threads") return { ok:true, threads:[] };
    return { ok:false, reason:"unhandled" };
  });
}

console.log("\n=== A. Full negotiation arc through the real engine ===");
await seed({ modes:{offer_first:"auto",offer_followup:"auto"}, proven:["offer_first","offer_followup"] });
let l = (await storage.getListings())[0];
const floor = llm.floorToday(l.target, await storage.getSettings(), l.postedAt);
console.log(`     (list $${l.listPrice}, target $${l.target}, floor today $${floor})`);

thread([{from:"buyer",text:"would you take 25?"}]);
await scan.processOpenThread(7);
let q = await queue.getQueue();
t(`first lowball countered not dropped (${q[0]?.text})`, q[0]?.action==="reply" && /\$/.test(q[0].text||""), JSON.stringify(q[0]?.action));

// buyer stalls -> cold off
resetStore(); l = await seed({ modes:{offer_followup:"auto"}, proven:["offer_followup"] });
thread([{from:"buyer",text:"would you take 25?"},{from:"me",text:"I could do $73"},{from:"buyer",text:"30 final"}]);
let r = await scan.processOpenThread(7);
t("stalled buyer is cold-offed", r.reason==="cold_off", r.reason);
t("cold-off creates no card", (await queue.getQueue()).length===0);

// buyer climbs but under floor -> parked
resetStore(); l = await seed({ modes:{offer_followup:"auto"}, proven:["offer_followup"] });
thread([{from:"buyer",text:"would you take 25?"},{from:"me",text:"I could do $73"},{from:"buyer",text:"how about 52"}]);
r = await scan.processOpenThread(7);
q = await queue.getQueue();
t("climbing buyer under floor is parked", q[0]?.action==="park", `${r.reason} / ${q[0]?.action}`);
t("park has a revisit date", q[0]?.revisitAt > Date.now(), String(q[0]?.revisitAt));
t("park explains itself", /floor/i.test(q[0]?.note||""), q[0]?.note);

// buyer clears floor -> accept
resetStore(); l = await seed({ modes:{offer_followup:"auto"}, proven:["offer_followup"] });
thread([{from:"buyer",text:"would you take 25?"},{from:"me",text:"I could do $73"},{from:"buyer",text:"65 cash"}]);
await scan.processOpenThread(7);
q = await queue.getQueue();
t(`offer over floor accepted (${q[0]?.text})`, /when can you/i.test(q[0]?.text||""), q[0]?.text);
t("accept mentions the meeting area", /Austin/.test(q[0]?.text||""), q[0]?.text);

console.log("\n=== B. Red flags are never auto-answered ===");
for (const bad of ["Can you ship it to Ohio?","I'll send you extra via Zelle","my mover will pick it up","text me at 555-0100"]) {
  resetStore(); await seed({ modes:{red_flag:"auto", unknown:"auto"}, proven:["red_flag"] });
  thread([{from:"buyer",text:bad}]);
  await scan.processOpenThread(7);
  const c = (await queue.getQueue())[0];
  t(`"${bad.slice(0,28)}" -> escalate+manual`, c?.action==="escalate" && c?.mode==="manual", `${c?.action}/${c?.mode}`);
}

console.log("\n=== C. Flagged buyer is escalated even on a normal message ===");
resetStore(); await seed({ modes:{availability:"auto"}, proven:["availability"] });
await rep.flagBuyer("Dana R.", "no-showed twice");
thread([{from:"buyer",text:"is this still available?"}]);
await scan.processOpenThread(7);
let c = (await queue.getQueue())[0];
t("flagged buyer escalates", c?.action==="escalate", c?.action);
t("reason names them", /Dana/.test(c?.reason||""), c?.reason);

console.log("\n=== D. Two serious buyers stops the machine ===");
resetStore(); await seed({ modes:{offer_followup:"auto"}, proven:["offer_followup"] });
// buyer 1 becomes serious
thread([{from:"buyer",text:"Does the scratch on the leg show much? Photos look fine"},{from:"buyer",text:"I can do 68 cash and pick up today"}], {id:"111",buyer:"Marcus T."});
await scan.processOpenThread(7);
// buyer 2 becomes serious on the same listing
thread([{from:"buyer",text:"Is the table solid oak all the way through or veneer?"},{from:"buyer",text:"70 cash, can come tomorrow"}], {id:"222",buyer:"Priya N."});
await scan.processOpenThread(7);
q = await queue.getQueue();
const cmp = q.find(i=>i.playbook==="buyer_selection");
t("two-buyer escalation fired", !!cmp, `playbooks: ${q.map(i=>i.playbook).join(",")}`);
t("comparison lists both", cmp?.comparison?.length>=2, JSON.stringify(cmp?.comparison));
t("comparison carries offers", cmp?.comparison?.some(b=>b.offer), JSON.stringify(cmp?.comparison));
t("it is manual", cmp?.mode==="manual", cmp?.mode);
t("urgent flag set", cmp?.urgent===true);
t("a push notification went out", log.notifications.some(n=>/two buyers/i.test(n.title||"")), JSON.stringify(log.notifications.map(n=>n.title)));

console.log("\n=== E. Factual questions only answer from stated facts ===");
resetStore(); await seed({ modes:{factual:"auto"}, proven:["factual"], askAbove:9999 });
await storage.saveSettings({ apiKey:"sk-test" });
thread([{from:"buyer",text:"What is the exact seat depth in centimetres?"}]);
await scan.processOpenThread(7);
c = (await queue.getQueue())[0];
t("unanswerable question escalates", c?.action==="escalate", `${c?.action} ${c?.reason||""}`);
t("tells you what's missing", /seat depth/i.test(c?.reason||""), c?.reason);
t("the cloud call was actually made", log.fetches.some(f=>f.url.includes("anthropic")), String(log.fetches.length));
const body = JSON.parse(log.fetches.find(f=>f.url.includes("anthropic")).init.body);
t("prompt caching is switched on", body.system?.[0]?.cache_control?.type==="ephemeral", JSON.stringify(body.system?.[0]).slice(0,120));
t("item facts are in the system prompt", /Solid oak/.test(body.system[0].text));
t("no raw transcript sent", body.messages.length===1 && body.messages[0].content==="What is the exact seat depth in centimetres?");
t("usage was metered", (await storage.getUsage()).tier2===1, JSON.stringify(await storage.getUsage()));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode=1;
