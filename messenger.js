// Reads Marketplace threads and types approved replies.
//
// The hard problem here isn't typing — it's being certain which messages are
// yours and which are the buyer's. Getting that backwards means countering
// your own offer, or replying to something you already answered. So this file
// never trusts a single signal, and never infers what it can simply know.
//
// Five defences, strongest first:
//
//   1. SELF-AUTHORSHIP LEDGER. Dibs records every message it sends. Anything
//      in the DOM matching the ledger is definitively ours — no inference.
//   2. MULTI-SIGNAL VOTING. Five independent signals per row, weighted. They
//      must agree by a margin. Contradiction means unreadable, not a coin flip.
//   3. CANARY TEST. Before any autonomous send, Dibs looks for its own last
//      message in the page. If it can't find and correctly attribute a message
//      it knows it sent, the reader has drifted and auto mode halts.
//   4. SEND PRECONDITIONS. Thread id, buyer name and listing must all match
//      what the queue item expects, the last message must be the buyer's, the
//      composer must be empty and belong to this thread, and no near-duplicate
//      may exist in the ledger.
//   5. POST-SEND VERIFICATION. The text must reappear in the DOM attributed
//      back to us. Anything short of that is reported as unconfirmed, never
//      as success.
//
// Everything fails closed. Silence always beats a wrong message.

/* ========================== selector candidates ========================== */

const SEL = {
  messageList: [
    'div[role="main"] div[data-scope="messages_table"]',
    'div[role="main"] div[role="grid"]',
    'div[role="main"] [aria-label*="Messages"]',
    'div[role="main"]',
  ],
  messageRow: ['div[role="row"]', '[data-scope="messages_table"] > div', 'div[role="listitem"]'],
  composer: [
    'div[role="textbox"][contenteditable="true"]',
    'div[aria-label*="Message"][contenteditable="true"]',
    'div[contenteditable="true"][data-lexical-editor="true"]',
  ],
  header: [
    'div[role="main"] h1',
    'div[role="main"] [role="heading"][aria-level="1"]',
    'div[role="main"] [role="heading"]',
  ],
  threadRow: ['div[role="row"]', '[role="listitem"]', 'a[href*="/messages/t/"]'],
};

function first(cands, root = document) {
  for (const s of cands) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
}

function all(cands, root = document) {
  for (const s of cands) {
    const els = root.querySelectorAll(s);
    if (els.length) return [...els];
  }
  return [];
}

/* ================================ identity =============================== */

function accountId() {
  const c = document.cookie.match(/(?:^|;\s*)c_user=(\d+)/);
  if (c) return c[1];
  const link = document.querySelector('a[href*="/profile.php?id="]');
  return link?.href.match(/id=(\d+)/)?.[1] || null;
}

function threadId() {
  return location.pathname.match(/\/messages\/t\/(\d+)/)?.[1] || null;
}

function listingRef() {
  const a = document.querySelector('div[role="main"] a[href*="/marketplace/item/"]');
  return a?.href.match(/item\/(\d+)/)?.[1] || null;
}

function buyerName() {
  const h = first(SEL.header);
  const name = h?.innerText?.trim().split("\n")[0] || "";
  return name.slice(0, 60) || null;
}

// Only threads visibly tied to a listing are ever touched. Personal
// conversations are out of scope entirely.
function isMarketplaceThread() {
  const main = document.querySelector('div[role="main"]');
  if (!main) return false;
  if (main.querySelector('a[href*="/marketplace/item/"]')) return true;
  return /marketplace|is this still available/i.test(main.innerText.slice(0, 500));
}

/* ========================= self-authorship ledger ======================== */

const LEDGER = "sentLedger";

async function ledger() {
  const { [LEDGER]: rows = [] } = await chrome.storage.local.get(LEDGER);
  const cutoff = Date.now() - 30 * 86400000;
  return rows.filter((r) => r.at > cutoff);
}

async function appendLedger(entry) {
  const rows = await ledger();
  rows.push(entry);
  await chrome.storage.local.set({ [LEDGER]: rows.slice(-500) });
}

// Normalised so punctuation, whitespace and emoji stripping don't break a
// match between what we sent and what the page renders.
function fingerprint(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s$]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/* =============================== attribution ============================= */
// Each signal returns "me", "buyer", or null. Weights reflect how much the
// signal actually proves, not how convenient it is.

const WEIGHTS = { ledger: 100, ariaSelf: 40, ariaSender: 40, testid: 30, avatar: 20, noAvatar: 20, geometry: 15 };
const NEEDED = 40; // a lone geometry or avatar hint is never enough on its own
const MARGIN = 20; // and the winner must clearly beat the loser

function signalAriaSelf(row) {
  const label = row.getAttribute("aria-label") || "";
  if (/^\s*you sent\b/i.test(label)) return "me";
  if (/\byou sent\b/i.test((row.innerText || "").slice(0, 30))) return "me";
  return null;
}

function signalAriaSender(row, buyer) {
  const label = row.getAttribute("aria-label") || "";
  const m = label.match(/^(.{2,50}?)\s+sent\b/i);
  if (!m) return null;
  const who = m[1].trim().toLowerCase();
  if (/^you$/.test(who)) return "me";
  if (buyer && who.includes(buyer.toLowerCase().split(" ")[0])) return "buyer";
  return "buyer"; // a named sender who isn't you is the other party
}

function signalTestId(row) {
  if (row.querySelector('[data-testid="incoming_message"]')) return "buyer";
  if (row.querySelector('[data-testid="outgoing_message"]')) return "me";
  return null;
}

function hasAvatar(row) {
  return !!(
    row.querySelector('image, img[src*="fbcdn"], svg image') ||
    row.querySelector('a[href*="/user/"], a[href*="profile.php"]')
  );
}

function signalAvatar(row) {
  // Incoming messages carry the sender's avatar; your own don't.
  return hasAvatar(row) ? "buyer" : null;
}

// The mirror image, and the reason a reply you typed by hand is still
// readable: in a thread that clearly uses avatars, a message without one is
// outgoing. Only voted when avatars are in use somewhere in the thread —
// otherwise their absence proves nothing.
function signalNoAvatar(row, avatarsInUse) {
  if (!avatarsInUse) return null;
  return hasAvatar(row) ? null : "me";
}

// Measured from the bubble's real position inside the list rather than
// computed flex styles — layout properties move between Facebook builds,
// pixels don't lie.
function signalGeometry(row, listRect) {
  const bubble = row.querySelector('[dir="auto"]')?.closest("div") || row.firstElementChild || row;
  const r = bubble.getBoundingClientRect();
  if (!r.width || !listRect.width) return null;

  const leftGap = r.left - listRect.left;
  const rightGap = listRect.right - r.right;
  const total = leftGap + rightGap;
  if (total < 40) return null; // full-width row: a system notice, not a message

  const bias = (rightGap - leftGap) / total;
  if (bias < -0.35) return "me"; // hugging the right edge
  if (bias > 0.35) return "buyer"; // hugging the left edge
  return null; // centred or ambiguous: no vote
}

function attribute(row, ctx) {
  const text = (row.innerText || "").replace(/^you sent\s*/i, "").trim();
  const votes = { me: 0, buyer: 0 };
  const fired = [];

  const cast = (name, who) => {
    if (!who) return;
    votes[who] += WEIGHTS[name];
    fired.push(`${name}:${who}`);
  };

  // The definitive one first.
  if (text && ctx.sentPrints.has(fingerprint(text))) cast("ledger", "me");

  cast("ariaSelf", signalAriaSelf(row));
  cast("ariaSender", signalAriaSender(row, ctx.buyer));
  cast("testid", signalTestId(row));
  cast("avatar", signalAvatar(row));
  cast("noAvatar", signalNoAvatar(row, ctx.avatarsInUse));
  cast("geometry", signalGeometry(row, ctx.listRect));

  const winner = votes.me >= votes.buyer ? "me" : "buyer";
  const loser = winner === "me" ? "buyer" : "me";

  // Normally one strong signal, or several weak ones, must clear the bar and
  // beat the other side by a margin.
  const byWeight = votes[winner] >= NEEDED && votes[winner] - votes[loser] >= MARGIN;

  // But unanimity among independent signals also counts, even when they're
  // individually weak. Two unrelated signals agreeing with nothing at all
  // dissenting is real evidence — it's how the reader survives Facebook
  // stripping its aria labels without falling back to guessing.
  const agreeing = fired.filter((f) => f.endsWith(`:${winner}`)).length;
  const unanimous = agreeing >= 2 && votes[loser] === 0 && votes[winner] >= 30;

  const strong = byWeight || unanimous;

  return {
    from: strong ? winner : "unknown",
    text,
    confidence: strong ? Math.min(1, votes[winner] / 100) : 0,
    signals: fired,
    basis: byWeight ? "weight" : unanimous ? "unanimous" : "none",
  };
}

/* ================================= reading =============================== */

async function readThread() {
  if (!isMarketplaceThread()) return { ok: false, reason: "not_marketplace" };

  const list = first(SEL.messageList);
  if (!list) return { ok: false, reason: "no_message_list" };

  const rows = all(SEL.messageRow, list);
  if (!rows.length) return { ok: false, reason: "no_rows" };

  const tid = threadId();
  const sent = await ledger();
  const ctx = {
    buyer: buyerName(),
    listRect: list.getBoundingClientRect(),
    avatarsInUse: rows.some((r) => hasAvatar(r)),
    sentPrints: new Set(sent.filter((r) => r.threadId === tid).map((r) => r.print)),
  };

  const attributed = rows
    .map((r) => attribute(r, ctx))
    .filter((m) => m.text && m.text.length <= 2000);

  if (!attributed.length) return { ok: false, reason: "no_readable_rows" };

  // A reader that can't place a third of the conversation is a broken reader.
  const unknowns = attributed.filter((m) => m.from === "unknown").length;
  const health = Number((1 - unknowns / attributed.length).toFixed(2));

  if (health < 0.7) {
    return { ok: false, reason: "low_confidence", health, sample: attributed.slice(-4) };
  }

  const messages = attributed.filter((m) => m.from !== "unknown");

  // Canary: if we've sent in this thread before, at least one of those
  // messages must be findable and attributed to us.
  const expectSelf = ctx.sentPrints.size > 0;
  const foundSelf = messages.some((m) => m.from === "me" && ctx.sentPrints.has(fingerprint(m.text)));
  const canary = expectSelf ? (foundSelf ? "pass" : "fail") : "untested";

  return {
    ok: true,
    account: accountId(),
    threadId: tid,
    listingRef: listingRef(),
    buyerName: ctx.buyer,
    messages,
    health,
    canary,
    lastFrom: messages.at(-1)?.from || null,
  };
}

/* ================================= sending =============================== */

async function send({ text, expect }) {
  if (!isMarketplaceThread()) return { ok: false, reason: "not_marketplace" };

  const tid = threadId();
  if (expect?.threadId && tid !== expect.threadId) return { ok: false, reason: "wrong_thread" };

  const name = buyerName();
  if (expect?.buyerName && name && !sameish(name, expect.buyerName)) {
    return { ok: false, reason: "wrong_buyer", saw: name };
  }

  const ref = listingRef();
  if (expect?.listingRef && ref && ref !== expect.listingRef) {
    return { ok: false, reason: "wrong_listing", saw: ref };
  }

  const state = await readThread();
  if (!state.ok) return { ok: false, reason: `unreadable:${state.reason}` };
  if (state.canary === "fail") return { ok: false, reason: "canary_failed" };

  // Never reply to ourselves — either the buyer hasn't answered yet or this
  // was already handled.
  if (state.lastFrom === "me") return { ok: false, reason: "already_replied" };

  // Idempotency: a retry, a double click, or two tabs racing must not send the
  // same thing twice.
  const print = fingerprint(text);
  const dupe = (await ledger()).some(
    (r) => r.threadId === tid && r.print === print && Date.now() - r.at < 30 * 60000
  );
  if (dupe) return { ok: false, reason: "duplicate_suppressed" };

  const box = first(SEL.composer);
  if (!box) return { ok: false, reason: "composer_not_found" };

  const list = first(SEL.messageList);
  if (list && box.closest('div[role="main"]') !== list.closest('div[role="main"]')) {
    return { ok: false, reason: "composer_outside_thread" };
  }

  box.focus();
  await wait(120 + Math.random() * 200);

  if ((box.innerText || "").trim()) return { ok: false, reason: "composer_not_empty" };

  document.execCommand("insertText", false, text);
  await wait(200 + Math.random() * 300);

  const typed = (first(SEL.composer)?.innerText || "").trim();
  if (fingerprint(typed) !== print) {
    return { ok: false, reason: "text_did_not_land", typed: typed.slice(0, 60) };
  }

  // Recorded before pressing enter: if the tab dies mid-send, the worst
  // outcome is a suppressed duplicate rather than a doubled message.
  await appendLedger({ threadId: tid, print, text, at: Date.now() });

  first(SEL.composer).dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
    })
  );

  await wait(700);
  if ((first(SEL.composer)?.innerText || "").trim() !== "") {
    return { ok: false, reason: "composer_did_not_clear" };
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    await wait(500);
    const after = await readThread();
    if (after.ok && after.messages.some((m) => m.from === "me" && fingerprint(m.text) === print)) {
      return { ok: true, reason: "sent_and_verified", health: after.health };
    }
  }

  // It very likely went; we just couldn't prove it. Say so rather than
  // claiming success.
  return { ok: true, reason: "sent_unverified" };
}

function sameish(a, b) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z ]/g, "").trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(y.split(" ")[0]) || y.startsWith(x.split(" ")[0]);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* =========================== calibration (one-off) ======================= */
// Facebook changes its markup. Rather than guess whether the reader still
// works, Dibs asks you once: "is the last message yours or theirs?" Your
// answer is ground truth. If the markup shifts later the canary catches it
// and asks again.

async function calibrationProbe() {
  const state = await readThread();
  if (!state.ok) return { ok: false, reason: state.reason, health: state.health };
  const last = state.messages.at(-1);
  return {
    ok: true,
    lastText: last?.text?.slice(0, 160),
    guess: last?.from,
    confidence: last?.confidence,
    signals: last?.signals,
    health: state.health,
  };
}

async function calibrationConfirm(truth) {
  const probe = await calibrationProbe();
  if (!probe.ok) return probe;

  const record = {
    at: Date.now(),
    correct: probe.guess === truth,
    guess: probe.guess,
    truth,
    signals: probe.signals,
    chrome: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || "?",
  };

  const { domCalibration = { history: [] } } = await chrome.storage.local.get("domCalibration");
  domCalibration.history = [...domCalibration.history, record].slice(-20);
  domCalibration.verified = record.correct;
  domCalibration.verifiedAt = Date.now();
  await chrome.storage.local.set({ domCalibration });

  return { ok: true, correct: record.correct, record };
}

/* ================================ messaging ============================== */

const HANDLERS = {
  "dibs:read-thread": () => readThread(),
  "dibs:send": (msg) => send(msg),
  "dibs:health": async () => {
    const s = await readThread();
    return { ok: s.ok, health: s.health ?? 0, canary: s.canary, reason: s.reason };
  },
  "dibs:calibrate-probe": () => calibrationProbe(),
  "dibs:calibrate-confirm": (msg) => calibrationConfirm(msg.truth),
  "dibs:list-threads": async () => {
    const threads = all(SEL.threadRow)
      .map((r) => {
        const href =
          r.querySelector('a[href*="/messages/t/"]')?.getAttribute("href") ||
          r.getAttribute("href") ||
          "";
        const id = href.match(/\/t\/(\d+)/)?.[1];
        if (!id) return null;
        const label = r.getAttribute("aria-label") || "";
        return {
          id,
          unread: /unread/i.test(label) || !!r.querySelector('[aria-label*="Unread"]'),
          preview: (r.innerText || "").slice(0, 120),
        };
      })
      .filter(Boolean);
    return { ok: true, account: accountId(), threads };
  },
};

chrome.runtime.onMessage.addListener((msg, _s, respond) => {
  const fn = HANDLERS[msg?.type];
  if (!fn) return;
  fn(msg)
    .then(respond)
    .catch((err) => respond({ ok: false, reason: `threw:${err.message}` }));
  return true;
});

let lastSeen = threadId();
setInterval(() => {
  const now = threadId();
  if (now !== lastSeen) {
    lastSeen = now;
    chrome.runtime.sendMessage({ type: "dibs:thread-changed", threadId: now }).catch(() => {});
  }
}, 1500);
