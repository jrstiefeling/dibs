import { resetStore } from "./chrome-mock.mjs";
import { buildPage } from "./dom-shim.mjs";
import { readFileSync } from "fs";

let pass=0,fail=0;
const t=(n,c,e="")=>{c?(pass++,console.log(`  ok   ${n}`)):(fail++,console.log(`  FAIL ${n} ${e}`));};

const SRC = readFileSync(new URL("../messenger.js", import.meta.url).pathname,"utf8");

// Load the real content script and capture its message handler.
function loadMessenger() {
  let handler=null;
  globalThis.chrome.runtime.onMessage = { addListener: (fn)=>{ handler=fn; } };
  globalThis.chrome.runtime.sendMessage = async ()=>({});
  new Function(SRC)();
  return (msg)=>new Promise(res=>{ handler(msg,{},res); });
}

async function ask(page, msg, { keepState = false } = {}) {
  if (!keepState) resetStore(); // a stale ledger would fail the next canary
  buildPage(page);
  const send = loadMessenger();
  return send(msg);
}

console.log("\n=== N. Real messenger.js against a real DOM ===");

// Current-style markup: aria labels present
let res = await ask({
  messages:[
    {text:"is this still available?", aria:"Dana R. sent is this still available?"},
    {text:"Yep, still available — when could you pick it up?", mine:true, aria:"You sent Yep, still available — when could you pick it up?"},
    {text:"how about 60", aria:"Dana R. sent how about 60"},
  ],
}, { type:"dibs:read-thread" });
t("reads the thread", res.ok, JSON.stringify(res).slice(0,200));
t("health is perfect with aria present", res.health===1, String(res.health));
t("attributes all three correctly", JSON.stringify(res.messages.map(m=>m.from))==='["buyer","me","buyer"]', JSON.stringify(res.messages.map(m=>m.from)));
t("lastFrom is the buyer", res.lastFrom==="buyer");
t("picks up the listing ref", res.listingRef==="999", res.listingRef);
t("picks up the account id from the cookie", res.account==="5551", res.account);
t("picks up the buyer name", res.buyerName==="Dana R.", res.buyerName);

// Aria stripped entirely — the realistic future failure
res = await ask({
  messages:[
    {text:"is this still available?"},
    {text:"Yep, still available", mine:true},
    {text:"how about 60"},
  ],
}, { type:"dibs:read-thread" });
t("survives aria being stripped", res.ok, JSON.stringify(res).slice(0,220));
t("all three still attributed", res.ok && JSON.stringify(res.messages.map(m=>m.from))==='["buyer","me","buyer"]', JSON.stringify(res?.messages?.map(m=>m.from)));
t("health is acceptable", (res.health??0)>=0.7, String(res.health));

// Total collapse: no aria, no avatars, centred bubbles
res = await ask({
  messages:[
    {text:"hello", avatar:false, aria:null},
    {text:"hi", mine:true},
  ],
  listRect:{left:0,right:300,width:300},
}, { type:"dibs:read-thread" });
t("rejects an unreadable thread rather than guessing", !res.ok, JSON.stringify(res).slice(0,160));
t("reports low_confidence", res.reason==="low_confidence", res.reason);

// Not a marketplace thread
res = await ask({ messages:[{text:"hey mum", aria:"Mum sent hey mum"}], marketplace:false }, { type:"dibs:read-thread" });
t("refuses non-marketplace threads", !res.ok && res.reason==="not_marketplace", JSON.stringify(res));

console.log("\n=== O. Sending, with every precondition ===");
const good = { messages:[
  {text:"how about 60", aria:"Dana R. sent how about 60"},
]};

res = await ask(good, { type:"dibs:send", text:"I could do $73", expect:{ threadId:"999999" } });
t("wrong thread blocked", !res.ok && res.reason==="wrong_thread", JSON.stringify(res));

res = await ask(good, { type:"dibs:send", text:"I could do $73", expect:{ threadId:"111", buyerName:"Someone Else" } });
t("wrong buyer blocked", !res.ok && res.reason==="wrong_buyer", JSON.stringify(res));

res = await ask(good, { type:"dibs:send", text:"I could do $73", expect:{ threadId:"111", listingRef:"888" } });
t("wrong listing blocked", !res.ok && res.reason==="wrong_listing", JSON.stringify(res));

res = await ask({ messages:[{text:"I could do $73", mine:true, aria:"You sent I could do $73"}] },
  { type:"dibs:send", text:"I could do $70", expect:{ threadId:"111" } });
t("won't reply to itself", !res.ok && res.reason==="already_replied", JSON.stringify(res));

res = await ask({ ...good, composerText:"half a sentence I was typing" },
  { type:"dibs:send", text:"I could do $73", expect:{ threadId:"111" } });
t("won't overwrite what you were typing", !res.ok && res.reason==="composer_not_empty", JSON.stringify(res));

res = await ask({ messages:[{text:"hello", avatar:false}], listRect:{left:0,right:300,width:300} },
  { type:"dibs:send", text:"hi", expect:{ threadId:"111" } });
t("won't send into an unreadable thread", !res.ok && /unreadable/.test(res.reason), JSON.stringify(res));

console.log("\n=== P. A successful send, verified end to end ===");
resetStore();
buildPage(good);
const send = loadMessenger();
res = await send({ type:"dibs:send", text:"I could do $73", expect:{ threadId:"111", buyerName:"Dana R.", listingRef:"999" } });
t("send reports ok", res.ok, JSON.stringify(res));
t("text landed in the composer then cleared", res.reason!=="text_did_not_land" && res.reason!=="composer_did_not_clear", res.reason);
const led = (await chrome.storage.local.get("sentLedger")).sentLedger || [];
t("recorded in the self-authorship ledger", led.length===1 && led[0].text==="I could do $73", JSON.stringify(led));
t("ledger keyed to the right thread", led[0].threadId==="111");

console.log("\n=== Q. Ledger rescues attribution, and dedupes ===");
// Same text now appears in the DOM with NO aria and NO avatar. Only the
// ledger can know it was ours.
res = await ask({ messages:[
  {text:"how about 60", aria:"Dana R. sent how about 60"},
  {text:"I could do $73", avatar:false, aria:null, mine:false, }, // deliberately looks incoming
]}, { type:"dibs:read-thread" }, { keepState:true });
const ours = res.ok && res.messages.find(m=>m.text==="I could do $73");
t("ledger overrides misleading markup", ours?.from==="me", JSON.stringify(res.messages?.map(m=>[m.text.slice(0,14),m.from])));

// duplicate suppression
buildPage({ messages:[
  {text:"how about 60", aria:"Dana R. sent how about 60"},
  {text:"I could do $73", mine:true, aria:"You sent I could do $73"},
  {text:"hmm", aria:"Dana R. sent hmm"},
]});
const send2 = loadMessenger();
res = await send2({ type:"dibs:send", text:"I could do $73", expect:{ threadId:"111" } });
t("duplicate within 30 min suppressed", !res.ok && res.reason==="duplicate_suppressed", JSON.stringify(res));

console.log("\n=== R. Calibration probe ===");
res = await ask({ messages:[
  {text:"how about 60", aria:"Dana R. sent how about 60"},
]}, { type:"dibs:calibrate-probe" });
t("probe returns a guess", res.ok && res.guess==="buyer", JSON.stringify(res));
t("probe quotes the message", /60/.test(res.lastText||""), res.lastText);
t("probe lists which signals fired", (res.signals||[]).length>0, JSON.stringify(res.signals));

buildPage({ messages:[{text:"how about 60", aria:"Dana R. sent how about 60"}] });
const send3 = loadMessenger();
res = await send3({ type:"dibs:calibrate-confirm", truth:"buyer" });
t("confirming correct marks it verified", res.ok && res.correct===true, JSON.stringify(res));
const cal = (await chrome.storage.local.get("domCalibration")).domCalibration;
t("calibration persisted", cal?.verified===true, JSON.stringify(cal).slice(0,140));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exitCode=1;
