// The Queue tab is the whole product in Simple Mode: a stack of cards you
// clear with the keyboard. The Tune tab is where you move the dials.

import { getQueue, removeFromQueue, patchQueueItem, recordOutcome, maybeDemote, setMode, getStats, saveVoiceExample } from "./queue.js";
import { PLAYBOOKS, DEFAULT_MODES } from "./agent.js";
import { getSettings, markPlaybookProven } from "./storage.js";
import { classify, floorToday, decideOffer, renderTemplate } from "./llm.js";
import { flagBuyer } from "./reputation.js";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let cards = [];
let cursor = 0;

/* ============================== the queue ============================== */

export async function renderQueue() {
  cards = await getQueue();
  const pane = $("pane-queue");
  const count = $("queue-count");
  const waiting = cards.filter((c) => c.status === "waiting").length;
  const settings = await getSettings();

  count.textContent = String(waiting);
  count.hidden = waiting === 0;

  // Reader trouble is more important than any individual card, so it sits
  // above everything and says plainly what's happening.
  const halted =
    settings.readerHealthy === false
      ? `<div class="halted">
          <p><strong>Dibs isn't sending on its own.</strong> It can't reliably tell your
          messages from the buyer's${settings.readerFailReason ? ` — ${esc(settings.readerFailReason)}` : ""}.
          Everything below is waiting for you to approve.</p>
          <p class="hint">Open a buyer thread and run the reading check on the Tune tab to clear this.</p>
        </div>`
      : "";

  if (!cards.length) {
    pane.innerHTML = halted + `
      <div class="empty">
        <h2>Nothing waiting on you</h2>
        <p>Buyer replies land here. Keep a Messenger tab open and Dibs will
        pick them up.</p>
      </div>`;
    return;
  }

  pane.innerHTML =
    halted +
    `<p class="shortcuts">Enter sends · E edits · S skips · X stops a held send</p>` +
    cards.map((c, i) => card(c, i)).join("");

  wire();
}

function card(c, i) {
  if (c.action === "escalate" && c.comparison) return comparisonCard(c, i);

  const cls = ["qcard", c.urgent ? "urgent" : "", c.status === "holding" ? "holding" : ""]
    .filter(Boolean)
    .join(" ");

  const hold =
    c.status === "holding" && c.sendAt
      ? `<div class="qhold">${
          c.mode === "auto" ? "Waiting a few minutes so it doesn't reply instantly" : "Sending"
        } — goes in ${mins(c.sendAt)} unless you stop it</div>`
      : "";

  const why = [
    c.note,
    c.heldBecause?.length ? `Waiting on you — ${c.heldBecause.join(", ")}.` : null,
    c.reason,
  ]
    .filter(Boolean)
    .join(" ");

  const body =
    c.action === "escalate"
      ? `<div class="qreply" contenteditable="true" data-i="${i}" data-placeholder="Type your reply"></div>`
      : `<div class="qreply" contenteditable="true" data-i="${i}">${esc(c.text || "")}</div>`;

  const buttons =
    c.status === "holding"
      ? `<button class="stop" data-act="cancel" data-i="${i}">Stop it<kbd>X</kbd></button>
         <button data-act="send" data-i="${i}">Send now<kbd>⏎</kbd></button>`
      : `<button class="go" data-act="send" data-i="${i}">Send<kbd>⏎</kbd></button>
         <button data-act="skip" data-i="${i}">Skip<kbd>S</kbd></button>
         <button data-act="mine" data-i="${i}">I'll take it</button>
         <button data-act="flag" data-i="${i}">Flag them</button>`;

  return `<div class="${cls}" data-card="${i}">
    <div class="qmeta">
      <span class="qbuyer">${esc(c.buyerName || "Buyer")}</span>
      <span class="qcontext">${esc(c.listingTitle || "")}${c.day != null ? ` · day ${c.day}` : ""}</span>
    </div>
    ${c.buyerMessage ? `<div class="qsaid">${esc(c.buyerMessage)}</div>` : ""}
    ${hold}
    ${body}
    ${why ? `<div class="qwhy">${esc(why)}</div>` : ""}
    <div class="qbtns">${buttons}</div>
  </div>`;
}

// Two serious buyers at once. The machine stops here by design — it lays the
// choice out and you make it.
function comparisonCard(c, i) {
  const cols = c.comparison
    .map(
      (b) => `<div>
        <div class="vname">${esc(b.name)}</div>
        <div class="voffer">${b.offer ? `$${b.offer}` : "—"}</div>
        <div class="vnote">${esc(b.note || "")}</div>
      </div>`
    )
    .join("");

  return `<div class="qcard urgent" data-card="${i}">
    <div class="qmeta">
      <span class="qbuyer">Two buyers, one item</span>
      <span class="qcontext">${esc(c.listingTitle || "")}</span>
    </div>
    <div class="qwhy">${esc(c.reason || "")}</div>
    <div class="versus">${cols}</div>
    <div class="qbtns">
      ${c.comparison.map((b, n) => `<button class="go" data-act="pick" data-i="${i}" data-pick="${n}">Go with ${esc(b.name.split(" ")[0])}</button>`).join("")}
      <button data-act="skip" data-i="${i}">Decide later</button>
    </div>
  </div>`;
}

// Send failures are design decisions, not errors, so say what the guard was.
function explainFailure(reason) {
  const map = {
    no_messenger_tab: "Open that buyer's thread in a tab and try again — Dibs only sends from a page you have open.",
    thread_not_open: "That thread isn't open. Open it in Messenger and try again.",
    wrong_thread: "The open thread isn't the one this reply was written for. Open the right one first.",
    wrong_buyer: "The name on the open thread doesn't match this buyer. Nothing was sent.",
    wrong_listing: "That thread is about a different listing. Nothing was sent.",
    already_replied: "The last message in that thread is already yours — the buyer hasn't replied yet.",
    duplicate_suppressed: "Dibs already sent that exact message recently, so it stopped itself.",
    canary_failed: "Dibs couldn't find its own last message in that thread, so it won't type anything. Run the reading check on Tune.",
    composer_not_empty: "There's already text in the message box. Clear it first.",
    composer_not_found: "Couldn't find the message box on that page. Reload the tab.",
    composer_outside_thread: "The message box doesn't belong to the thread it read. Nothing was sent.",
    text_did_not_land: "The text didn't type cleanly, so Dibs stopped rather than sending something mangled.",
    composer_did_not_clear: "Pressing enter didn't clear the box, so the send is unconfirmed. Check Messenger.",
    not_marketplace: "That doesn't look like a Marketplace thread. Dibs won't touch personal conversations.",
    daily_cap_reached: "Dibs has hit its daily send cap. That's well above normal volume, so check the log before raising it.",
  };
  if (reason?.startsWith("unreadable:")) {
    return `Dibs couldn't read that thread properly (${reason.split(":")[1]}), so it didn't send. Nothing was typed.`;
  }
  return map[reason] || `Didn't send: ${reason}`;
}

function mins(ts) {
  const m = Math.max(0, Math.round((ts - Date.now()) / 60000));
  return m <= 1 ? "under a minute" : `${m} min`;
}

function wire() {
  for (const b of document.querySelectorAll("#pane-queue [data-act]")) {
    b.addEventListener("click", () => act(b.dataset.act, Number(b.dataset.i), b.dataset.pick));
  }
}

async function act(action, i, pick) {
  const c = cards[i];
  if (!c) return;
  const el = document.querySelector(`.qreply[data-i="${i}"]`);
  const finalText = el ? el.innerText.trim() : c.text;

  switch (action) {
    case "send": {
      if (!finalText) return;
      const edited = finalText !== (c.text || "").trim();
      if (edited) await saveVoiceExample(c.playbook, c.text || "", finalText);
      const res = await chrome.runtime.sendMessage({
        type: "dibs:send-now",
        item: { ...c, text: finalText },
      });
      if (!res?.ok) {
        alert(explainFailure(res?.reason));
        return;
      }
      if (res.reason === "sent_unverified") {
        alert("Sent, but Dibs couldn't confirm it appeared in the thread. Worth a quick look at Messenger.");
      }
      await recordOutcome(c.playbook, edited ? "edited" : "approved");
      // Approving by hand is what earns a playbook the right to run unattended
      // on this listing next time.
      if (c.listingId && c.playbook) await markPlaybookProven(c.listingId, c.playbook);
      await removeFromQueue(c.id);
      break;
    }
    case "cancel":
      await recordOutcome(c.playbook, "cancelled");
      await patchQueueItem(c.id, { status: "waiting", mode: "manual" });
      const demoted = await maybeDemote(c.playbook);
      if (demoted) alert(`${PLAYBOOKS[demoted.playbook].label}: ${demoted.reason}`);
      break;
    case "skip":
      await patchQueueItem(c.id, { status: "waiting", snoozedUntil: Date.now() + 3600000 });
      break;
    case "mine":
      await removeFromQueue(c.id);
      break;
    case "flag": {
      const note = prompt(`Why are you flagging ${c.buyerName}?`) || "";
      await flagBuyer(c.buyerName, note);
      await removeFromQueue(c.id);
      break;
    }
    case "pick": {
      const chosen = c.comparison[Number(pick)];
      await patchQueueItem(c.id, {
        action: "reply",
        status: "waiting",
        mode: "manual",
        playbook: "scheduling",
        buyerName: chosen.name,
        text: `Sounds good — when can you come get it?`,
        reason: `You picked ${chosen.name}. The others stay warm until they turn up with cash.`,
      });
      break;
    }
  }

  await chrome.runtime.sendMessage({ type: "dibs:refresh-badge" });
  await renderQueue();
}

document.addEventListener("keydown", (e) => {
  if ($("pane-queue").hidden) return;
  if (e.target.isContentEditable && e.key !== "Enter") return;
  const map = { Enter: "send", e: "edit", E: "edit", s: "skip", S: "skip", x: "cancel", X: "cancel" };
  const action = map[e.key];
  if (!action) return;
  e.preventDefault();
  if (action === "edit") {
    document.querySelector(`.qreply[data-i="${cursor}"]`)?.focus();
    return;
  }
  act(action, cursor);
});

/* ============================== trust dials ============================= */

export async function renderDials() {
  const settings = await getSettings();
  const modes = settings.modes || DEFAULT_MODES;
  const stats = await getStats();
  const { pendingPromotion } = await chrome.storage.local.get("pendingPromotion");

  const promo = pendingPromotion
    ? `<div class="promo">
        <p><strong>${esc(PLAYBOOKS[pendingPromotion.playbook].label)}</strong> — ${esc(pendingPromotion.line)}</p>
        <div class="qbtns">
          <button class="go" id="promo-yes">Move to ${pendingPromotion.to}</button>
          <button id="promo-no">Leave it</button>
        </div>
      </div>`
    : "";

  const rows = Object.entries(PLAYBOOKS)
    .map(([key, meta]) => {
      const s = stats[key] || {};
      const total = (s.approved || 0) + (s.edited || 0) + (s.rejected || 0);
      const detail = total
        ? `${s.approved || 0} as written · ${s.edited || 0} edited${s.cancelled ? ` · ${s.cancelled} stopped` : ""}`
        : "nothing yet";

      const control = meta.graduatable
        ? `<div class="seg" data-pb="${key}">
            ${["manual", "shadow", "auto"]
              .map(
                (m) =>
                  `<button data-mode="${m}" aria-pressed="${modes[key] === m}">${m}</button>`
              )
              .join("")}
          </div>`
        : `<span class="locked">always asks you</span>`;

      return `<div class="dial">
        <div>
          <div class="dial-name">${esc(meta.label)}</div>
          <div class="dial-stats">${detail}</div>
        </div>
        ${control}
      </div>`;
    })
    .join("");

  $("dials").innerHTML =
    promo +
    rows +
    `<p class="hint" style="margin-top:12px">
      Shadow sends on its own but holds for ten minutes with a stop button.
      It's the rung worth living on for a while. Four of these never graduate —
      scam patterns, messages it can't place, going back to a parked buyer, and
      choosing between two buyers.
    </p>`;

  for (const seg of document.querySelectorAll("#dials .seg")) {
    for (const b of seg.querySelectorAll("button")) {
      b.addEventListener("click", async () => {
        await setMode(seg.dataset.pb, b.dataset.mode);
        renderDials();
      });
    }
  }

  if (pendingPromotion) {
    $("promo-yes").addEventListener("click", async () => {
      await setMode(pendingPromotion.playbook, pendingPromotion.to);
      await chrome.storage.local.remove("pendingPromotion");
      renderDials();
    });
    $("promo-no").addEventListener("click", async () => {
      await chrome.storage.local.remove("pendingPromotion");
      renderDials();
    });
  }
}

/* ============================== test bench ============================== */
// Paste a real buyer message, see what Dibs would do, before you save
// anything. This is how you build the confidence to move a dial.

export function wireBench() {
  $("bench-run").addEventListener("click", async () => {
    const text = $("bench-in").value.trim();
    if (!text) return;

    const settings = await getSettings();
    const target = parseInt($("bench-target").value, 10) || 70;
    const listPrice = Math.round(target * (1 + settings.anchorPct / 100));
    const day = parseInt($("bench-day").value, 10) || 0;
    const postedAt = Date.now() - day * 86400000;
    const history = ($("bench-history").value.match(/\d+/g) || []).map(Number);

    const c = classify(text);
    const floor = floorToday(target, settings, postedAt);
    let verdict, reply;

    if (c.intent === "red_flag") {
      verdict = "Stops and asks you";
      reply = "Matches a scam pattern, so it never answers this on its own.";
    } else if (c.intent === "offer") {
      const d = decideOffer({ amount: c.amount, listPrice, target, floor, offerHistory: history });
      verdict =
        { accept: "Accepts", counter: "Counters", cold_off: "Drops the thread", consider: "Parks them" }[d.move];
      reply =
        d.move === "counter"
          ? renderTemplate("counter", { counter: d.counter })
          : d.move === "accept"
          ? renderTemplate("accept", { area: "your usual spot" })
          : d.move === "cold_off"
          ? `They went $${history.at(-1)} → $${c.amount}. Not moving, so no reply.`
          : `$${c.amount} is under today's floor of $${floor} but they're climbing. Parked three days.`;
    } else if (c.intent === "availability") {
      verdict = "Replies";
      reply = renderTemplate("availability", {});
    } else if (c.intent === "scheduling") {
      verdict = "Offers times";
      reply = renderTemplate("scheduling", { windows: "Sat morning, Sun afternoon" });
    } else {
      verdict = "Sends it to a model";
      reply = "Doesn't match a pattern, so it checks your item facts — and asks you if they don't cover it.";
    }

    $("bench-out").innerHTML = `<span class="verdict">${esc(verdict)}.</span> ${esc(reply)}
      <div class="dial-stats" style="margin-top:6px">day ${day} · floor $${floor} · list $${listPrice} · tier ${c.tier ?? 2}</div>`;
  });
}
