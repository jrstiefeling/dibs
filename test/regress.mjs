import { resetStore } from "./chrome-mock.mjs";
import { buildPage } from "./dom-shim.mjs";
import { readFileSync } from "fs";
const SRC = readFileSync(new URL("../messenger.js", import.meta.url).pathname,"utf8");
let pass=0,fail=0;
const t=(n,c,e="")=>{c?(pass++,console.log(`  ok   ${n}`)):(fail++,console.log(`  FAIL ${n} ${e}`));};

function load(){let h=null;globalThis.chrome.runtime.onMessage={addListener:f=>{h=f;}};globalThis.chrome.runtime.sendMessage=async()=>({});new Function(SRC)();return m=>new Promise(r=>h(m,{},r));}
async function read(page){resetStore();buildPage(page);return load()({type:"dibs:read-thread"});}

console.log("\n=== S. Does the new noAvatar signal ever attribute WRONGLY? ===");
// Messenger groups consecutive messages and omits the avatar on grouped ones.
// A buyer's second message in a row therefore has no avatar.
let r = await read({ messages:[
  {text:"is this still available?"},                 // buyer, has avatar
  {text:"hello? still there?", avatar:false},        // buyer, GROUPED - no avatar
]});
const wrong = (r.messages||[]).find(m=>m.text.includes("still there") && m.from==="me");
t("grouped buyer message is never called 'me'", !wrong, JSON.stringify(r.messages?.map(m=>[m.text.slice(0,18),m.from])));
t("it goes unknown instead, lowering health", !r.ok || r.messages.every(m=>m.from!=="me"), JSON.stringify(r).slice(0,180));

// same, but with aria present: aria must win over noAvatar
r = await read({ messages:[
  {text:"is this still available?", aria:"Dana R. sent is this still available?"},
  {text:"hello? still there?", avatar:false, aria:"Dana R. sent hello? still there?"},
]});
t("aria overrules noAvatar", JSON.stringify(r.messages.map(m=>m.from))==='["buyer","buyer"]', JSON.stringify(r.messages?.map(m=>m.from)));

// a thread with NO avatars anywhere: absence proves nothing, must not vote
r = await read({ messages:[
  {text:"hi", avatar:false},
  {text:"hello", mine:true},
], listRect:{left:0,right:300,width:300} });
t("no-avatar thread does not fabricate 'me' votes", !r.ok, JSON.stringify(r).slice(0,140));

// ledger still beats everything
resetStore();
await chrome.storage.local.set({ sentLedger:[{ threadId:"111", print:"i could do $73", text:"I could do $73", at:Date.now() }] });
buildPage({ messages:[
  {text:"how about 60"},
  {text:"I could do $73"},   // has avatar => looks incoming
]});
r = await load()({ type:"dibs:read-thread" });
t("ledger still overrides a misleading avatar", r.ok && r.messages.find(m=>m.text==="I could do $73")?.from==="me", JSON.stringify(r.messages?.map(m=>[m.text.slice(0,14),m.from])));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exitCode=1;
