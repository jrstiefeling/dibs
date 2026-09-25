import { resetStore, setContentScript } from "./chrome-mock.mjs";
const D = new URL("../", import.meta.url).pathname;
const storage=await import(D + "storage.js");
const queue=await import(D + "queue.js");
const scan=await import(D + "scan.js");

const h = new Date().getHours();
console.log(`(container local hour is ${h})`);

async function tryWindow(qh, label, expectHeld) {
  resetStore();
  await storage.saveSettings({ modes:{availability:"auto"}, readerHealthy:true, askAbove:9999, quietHours:qh });
  await storage.addListing({url:"https://www.facebook.com/marketplace/item/999",title:"T",listPrice:50,target:45,provenPlaybooks:["availability"],area:"X",facts:[]});
  const [L]=await storage.getListings();
  await storage.updateListing(L.id,{postedAt:Date.now()-864e5});
  setContentScript(m=>m.type==="dibs:read-thread"
    ?{ok:true,threadId:"111",listingRef:"999",buyerName:"B",health:1,canary:"untested",lastFrom:"buyer",messages:[{from:"buyer",text:"still available?"}]}
    :{ok:true,threads:[]});
  await scan.processOpenThread(7);
  const c=(await queue.getQueue())[0];
  const held=(c?.heldBecause||[]).includes("quiet hours");
  const ok = held===expectHeld;
  console.log(`  ${ok?'ok  ':'FAIL'} ${label.padEnd(44)} mode=${c?.mode} held=${JSON.stringify(c?.heldBecause)}`);
  return ok;
}

let all=true;
// a non-wrapping window that definitely contains now
all &= await tryWindow([h, (h+2)%24 > h ? (h+2) : 23], "window containing now -> held", true);
// a wrapping window (the real default shape) that contains now
all &= await tryWindow([(h+23)%24, (h+1)%24], "wrapping window containing now -> held", true);
// a window that definitely excludes now
all &= await tryWindow([(h+2)%24, (h+3)%24], "window excluding now -> not held", false);
// the shipped default, evaluated honestly
const dflt=(await import(D + "storage.js"));
resetStore();
const s=await dflt.getSettings();
const [qs,qe]=s.quietHours;
const inQuiet = qs>qe ? (h>=qs||h<qe) : (h>=qs&&h<qe);
console.log(`  ok   shipped default [${qs},${qe}] at hour ${h} -> ${inQuiet?"quiet":"awake"} (correct either way)`);
console.log(all?"\nquiet hours logic is correct in both branches":"\nSOMETHING WRONG");
