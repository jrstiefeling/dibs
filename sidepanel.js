import { getSettings, saveSettings, saveDraft, getDraft, addListing, getListings, getUsage } from "./storage.js";
import { gatherComps, priceIt, writeListing, timingNote } from "./composer.js";
import { renderQueue, renderDials, wireBench } from "./queue-ui.js";
import { connectCalendar, disconnectCalendar, proposeSlots, parseWindows, formatWindows, parseLocations, formatLocations, DEFAULT_WINDOWS } from "./scheduler.js";
import { push } from "./notify.js";
import { performance as ledgerPerf, diagnose } from "./ledger.js";

const $ = (id) => document.getElementById(id);
const TABS = ["compose", "queue", "listings", "tune"];

let pricing = null;
let draft = null;

/* -------------------------------- tabs ---------------------------------- */

for (const name of TABS) {
  $(`tab-${name}`).addEventListener("click", () => show(name));
}

function show(active) {
  for (const name of TABS) {
    $(`tab-${name}`).setAttribute("aria-selected", String(name === active));
    $(`pane-${name}`).hidden = name !== active;
  }
  if (active === "queue") renderQueue();
  if (active === "listings") renderListings();
  if (active === "tune") renderDials();
}

/* ------------------------------ compose --------------------------------- */

$("run-comps").addEventListener("click", async () => {
  const item = $("item").value.trim();
  if (!item) return fail("Describe the item first — even a rough line is enough.");

  const btn = $("run-comps");
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">Reading local listings…</span>';
  clearFail();

  try {
    const settings = await getSettings();
    const query = item.split(/[.,\n]/)[0].split(/\s+/).slice(0, 6).join(" ");
    const comps = await gatherComps(query);
    pricing = priceIt(comps, $("goal").value, settings);
    renderPricing(query);
    $("draft-btn").disabled = false;
  } catch (err) {
    fail(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Check local prices";
  }
});

function renderPricing(query) {
  const p = pricing;

  if (p.confidence === "none") {
    $("pricing").innerHTML = `
      <div class="status error">
        No comparable listings came back for “${esc(query)}”. Either nobody
        nearby is selling one, or the search terms are too specific. Try a
        broader description, or set your own price below and carry on.
      </div>
      <div class="field">
        <label class="field-label" for="manual-target">Your target price</label>
        <input type="number" id="manual-target" placeholder="75" />
      </div>`;
    $("manual-target").addEventListener("change", async (e) => {
      const settings = await getSettings();
      const target = parseInt(e.target.value, 10);
      if (!target) return;
      pricing = {
        target,
        listPrice: Math.round(target * (1 + settings.anchorPct / 100)),
        floor: Math.round(target * (settings.floorPct / 100)),
        confidence: "manual",
        comps: [],
        count: 0,
      };
      renderPricing(query);
    });
    return;
  }

  const confLabel = {
    high: `${p.count} close comps, tight spread — this number is solid.`,
    fair: `${p.count} comps and a wide spread. Treat it as a starting point.`,
    low: `Only ${p.count} comparable${p.count === 1 ? "" : "s"}. This is a guess, not a valuation.`,
    manual: "Your own number.",
  }[p.confidence];

  const confClass = p.confidence === "high" ? "high" : p.confidence === "low" ? "low" : "";

  $("pricing").innerHTML = `
    <div class="tag">
      <div class="tag-role">List it at</div>
      <div class="money">$${p.listPrice}</div>
      <div class="money-rule"></div>
      <div class="tag-line"><span>What you're actually after</span><span>$${p.target}</span></div>
      <div class="tag-line"><span>Floor today</span><span>$${p.floor}</span></div>
      ${p.count ? `<div class="tag-line"><span>Nearby asking prices</span><span>$${p.low}–$${p.high}</span></div>` : ""}
      <p class="tag-note">
        Listing above your target is the whole trick: someone who talks you
        down to $${p.target} feels like they won, and you got your number.
        The floor loosens on its own as the listing ages.
      </p>
      <div class="confidence ${confClass}">${confLabel}</div>
    </div>
    ${p.comps.length ? renderComps(p.comps) : ""}
    <p class="hint">
      These are asking prices, not sold prices — the overpriced ones are
      exactly the listings still sitting there, so the median leans high.
    </p>`;
}

function renderComps(comps) {
  const rows = comps
    .slice(0, 8)
    .map(
      (c) => `<div class="comp">
        <span class="comp-title">${esc(c.title)}</span>
        <span class="comp-price">$${c.price}</span>
      </div>`
    )
    .join("");
  return `<div class="comps">${rows}</div>`;
}

$("draft-btn").addEventListener("click", async () => {
  const btn = $("draft-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">Writing…</span>';
  clearFail();

  try {
    draft = await writeListing({
      item: $("item").value.trim(),
      area: $("zip").value.trim(),
      paidNew: $("paid").value,
      pricing,
      goal: $("goal").value,
    });
    draft.pricing = pricing;
    await saveDraft(draft);
    renderDraft();
  } catch (err) {
    fail(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Write the listing";
  }
});

function renderDraft() {
  const timing = timingNote();
  const shots = draft.shotList
    .map(
      (s, i) =>
        `<li><input type="checkbox" id="shot${i}" /><label for="shot${i}">${esc(s)}</label></li>`
    )
    .join("");

  $("draft").innerHTML = `
    ${timing ? `<div class="status">${esc(timing)}</div>` : ""}

    ${block("Title", draft.title)}
    ${block("Price", `$${pricing.listPrice}`)}
    ${block("Description", draft.description)}

    <p class="hint">
      Category: ${esc(draft.category)} · Condition: ${esc(draft.condition)}.
      Pick the most specific subcategory Facebook offers — miscategorised
      things don't show up in filtered searches at all.
    </p>

    <h3 style="font-size:14px;margin:24px 0 4px">Photos to take</h3>
    <p class="hint">
      Well-lit listings with six or more photos sell dramatically faster than
      single-photo ones. This is worth more than the wording.
    </p>
    <ul class="shots">${shots}</ul>

    <button class="primary" id="to-listings" style="margin-top:18px">
      Posted it — start watching
    </button>`;

  for (const b of document.querySelectorAll(".copy-btn")) {
    b.addEventListener("click", () => copyBlock(b));
  }
  $("to-listings").addEventListener("click", () => show("listings"));
}

function block(name, body) {
  return `<div class="block">
    <div class="block-head">
      <span class="block-name">${name}</span>
      <button class="copy-btn" data-copy="${esc(body)}">Copy</button>
    </div>
    <div class="block-body" contenteditable="true">${esc(body)}</div>
  </div>`;
}

async function copyBlock(btn) {
  const body = btn.closest(".block").querySelector(".block-body").innerText;
  await navigator.clipboard.writeText(body);
  btn.textContent = "Copied";
  btn.classList.add("done");
  setTimeout(() => {
    btn.textContent = "Copy";
    btn.classList.remove("done");
  }, 1600);
}

/* ------------------------------ listings -------------------------------- */

$("link-listing").addEventListener("click", async () => {
  const url = $("live-url").value.trim();
  if (!/facebook\.com\/marketplace\/item\/\d+/.test(url)) {
    return fail("That doesn't look like a Marketplace item link.", "compose");
  }
  const stored = await getDraft();
  if (!stored?.pricing?.target) {
    return fail(
      "Draft a listing on the Compose tab first — Dibs needs the target and floor before it can answer anyone.",
      "compose"
    );
  }
  await addListing({
    url,
    title: stored?.title || "Untitled listing",
    area: $("zip").value.trim() || stored?.area || "",
    category: stored?.category || "",
    listPrice: stored?.pricing?.listPrice,
    target: stored?.pricing?.target,
    floor: stored?.pricing?.floor,
    facts: stored?.facts || [],
    sweeteners: stored?.sweeteners || [],
    firmNos: stored?.firmNos || [],
  });
  await saveDraft(null);
  $("live-url").value = "";
  $("draft").innerHTML = "";
  $("pricing").innerHTML = "";
  $("item").value = "";
  renderListings();
  show("queue");
});

async function renderListings() {
  const listings = await getListings();
  if (!listings.length) {
    $("listing-rows").innerHTML = "";
    return;
  }
  const settings = await getSettings();
  $("listing-rows").innerHTML = listings
    .map((l) => {
      const days = Math.floor((Date.now() - l.postedAt) / 86400000);
      const band = days <= 3 ? "early" : days <= 9 ? "mid" : "late";
      const floor = Math.round(l.target * (settings.floorPct / 100) * settings.floorDecay[band]);
      const interest = l.credibleBuyers || 0;
      const thermo = Array.from({ length: 5 }, (_, n) => `<i class="${n < interest ? "on" : ""}"></i>`).join("");
      const d = diagnose({ days, views: l.views || 0, inquiries: l.inquiries || 0, offers: l.offers || 0 });
      return `<div class="block">
        <div class="block-head">
          <span class="block-name">${esc(l.title)}</span>
          <span class="comp-price">$${l.listPrice}</span>
        </div>
        <div class="block-body">Day ${days} · floor today $${floor} · ${interest ? `${interest} serious` : "no buyers yet"}${l.bestOffer ? ` · best $${l.bestOffer}` : ""}</div>
        <div class="thermo">${thermo}</div>
        ${d ? `<div class="qwhy" style="margin-top:8px">${esc(d.line)}</div>` : ""}
      </div>`;
    })
    .join("");
}

for (const b of document.querySelectorAll("#sweep-seg button")) {
  b.addEventListener("click", async () => {
    await saveSettings({ sweepThreads: b.dataset.sweep === "on" });
    await paintSweepState();
  });
}

async function paintSweepState() {
  const s = await getSettings();
  const on = !!s.sweepThreads;
  for (const b of document.querySelectorAll("#sweep-seg button")) {
    b.setAttribute("aria-pressed", String((b.dataset.sweep === "on") === on));
  }
  $("sweep-state").textContent = on
    ? "On — it'll work through unread threads one at a time."
    : "Off — Dibs only reads the thread you have open.";
}

/* -------------------------------- tune ---------------------------------- */

$("save-settings").addEventListener("click", async () => {
  await saveSettings({
    apiKey: $("api-key").value.trim(),
    anchorPct: parseInt($("anchor-pct").value, 10) || 18,
    floorPct: parseInt($("floor-pct").value, 10) || 85,
    askAbove: parseInt($("ask-above").value, 10) || 300,
    locations: parseLocations($("locations").value),
    windows: parseWindows($("windows").value),
    ntfyTopic: $("ntfy-topic").value.trim(),
    telegramToken: $("tg-token").value.trim(),
    telegramChatId: $("tg-chat").value.trim(),
    discordWebhook: $("discord-hook").value.trim(),
  });
  await showWindowPreview();
  const btn = $("save-settings");
  btn.textContent = "Saved";
  setTimeout(() => (btn.textContent = "Save settings"), 1500);
});

/* ------------------------- calendar toggle (optional) ------------------- */

for (const b of document.querySelectorAll("#cal-seg button")) {
  b.addEventListener("click", async () => {
    if (b.dataset.cal === "on") {
      const res = await connectCalendar();
      if (!res.ok) {
        $("cal-state").textContent = res.reason;
        return;
      }
    } else {
      await disconnectCalendar();
    }
    await paintCalendarState();
    await showWindowPreview();
  });
}

async function paintCalendarState() {
  const s = await getSettings();
  const on = !!s.calendarOn;
  for (const b of document.querySelectorAll("#cal-seg button")) {
    b.setAttribute("aria-pressed", String((b.dataset.cal === "on") === on));
  }
  $("cal-state").textContent = on
    ? "On — clashes with real events are skipped."
    : "Off — Dibs uses your windows as written.";
}

async function showWindowPreview() {
  const s = await getSettings();
  const slots = await proposeSlots(s, 3);
  if (!slots.length) {
    $("windows-preview").textContent =
      "No slots from that. Try something like: sat 10:00-14:00, wed 6pm-8pm";
    return;
  }
  const checked = slots[0].checkedAgainstCalendar;
  $("windows-preview").textContent = `Would offer: ${slots.map((x) => x.label).join(", ")}${
    checked ? " — checked against your calendar." : " — not checked against a calendar."
  }`;
}

$("windows").addEventListener("change", async () => {
  await saveSettings({ windows: parseWindows($("windows").value) });
  await showWindowPreview();
});

/* ---------------------------- notification test ------------------------- */

$("test-push").addEventListener("click", async () => {
  await saveSettings({
    ntfyTopic: $("ntfy-topic").value.trim(),
    telegramToken: $("tg-token").value.trim(),
    telegramChatId: $("tg-chat").value.trim(),
    discordWebhook: $("discord-hook").value.trim(),
  });
  const hit = await push("Dibs test", "If you can read this on your phone, escalations will reach you.");
  $("channel-note").textContent = hit.length
    ? `Delivered to: ${hit.join(", ")}.`
    : "Nothing delivered. Check the topic or token above.";
});

/* ------------------------------ reader check ---------------------------- */

$("reader-probe").addEventListener("click", runReaderProbe);

async function messengerTab() {
  const tabs = await chrome.tabs.query({ url: "https://www.facebook.com/messages/*" });
  return tabs[0] || null;
}

async function runReaderProbe() {
  const box = $("reader-check");
  const out = $("reader-state");
  box.className = "readercheck";

  const tab = await messengerTab();
  if (!tab) {
    out.textContent = "Open a buyer thread in Messenger first, then check again.";
    return;
  }

  let res;
  try {
    res = await chrome.tabs.sendMessage(tab.id, { type: "dibs:calibrate-probe" });
  } catch {
    out.textContent = "Couldn't reach the page. Reload the Messenger tab and check again.";
    return;
  }

  if (!res?.ok) {
    box.className = "readercheck bad";
    out.innerHTML = `Can't read that thread — <strong>${esc(res?.reason || "unknown")}</strong>.
      Nothing will send on its own while this is the case.`;
    await saveSettings({ readerHealthy: false });
    return;
  }

  out.innerHTML = `
    <div>Dibs thinks the last message in that thread is <strong>${res.guess === "me" ? "yours" : "the buyer's"}</strong>.</div>
    <div class="reader-quote">${esc(res.lastText || "")}</div>
    <div>Is that right?</div>
    <div class="reader-signals">${Math.round((res.health || 0) * 100)}% of the thread readable · ${esc((res.signals || []).join(" ") || "no signals")}</div>
    <div class="qbtns" style="margin-top:10px">
      <button class="go" id="reader-yes">Right</button>
      <button class="stop" id="reader-no">Wrong</button>
    </div>`;

  $("reader-yes").addEventListener("click", () => confirmReader(res.guess, tab.id));
  $("reader-no").addEventListener("click", () => confirmReader(res.guess === "me" ? "buyer" : "me", tab.id));
}

async function confirmReader(truth, tabId) {
  const res = await chrome.tabs.sendMessage(tabId, { type: "dibs:calibrate-confirm", truth });
  const box = $("reader-check");
  const out = $("reader-state");

  if (res?.correct) {
    box.className = "readercheck good";
    out.innerHTML = `<strong>Reading confirmed.</strong> Dibs can tell your messages from the buyer's,
      so the dials above will work as set. It re-checks itself in the background and
      stops sending if that ever changes.`;
    await saveSettings({ readerHealthy: true, readerFailReason: "" });
  } else {
    box.className = "readercheck bad";
    out.innerHTML = `<strong>Reading is wrong, so autonomy is off.</strong> Everything will queue for
      you to approve by hand. Facebook has probably changed its markup — the selectors in
      messenger.js need a look.`;
    await saveSettings({ readerHealthy: false, readerFailReason: "failed a manual check" });
  }
  await renderDials();
}

/* -------------------------------- utils --------------------------------- */

function fail(msg, pane = "compose") {
  const el = $(`${pane}-status`);
  el.textContent = msg;
  el.hidden = false;
}

function clearFail() {
  $("compose-status").hidden = true;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* -------------------------------- boot ---------------------------------- */

(async function boot() {
  const s = await getSettings();
  $("api-key").value = s.apiKey;
  $("anchor-pct").value = s.anchorPct;
  $("floor-pct").value = s.floorPct;
  $("ask-above").value = s.askAbove;

  const u = await getUsage();
  $("m-tier0").textContent = u.tier0;
  $("m-tier1").textContent = u.tier1;
  $("m-tier2").textContent = u.tier2;
  $("m-spend").textContent = `$${u.cost.toFixed(2)}`;

  $("locations").value = formatLocations(s.locations);
  $("windows").value = formatWindows(s.windows?.length ? s.windows : DEFAULT_WINDOWS);
  $("ntfy-topic").value = s.ntfyTopic || "";
  $("tg-token").value = s.telegramToken || "";
  $("tg-chat").value = s.telegramChatId || "";
  $("discord-hook").value = s.discordWebhook || "";

  await paintCalendarState();
  await paintSweepState();
  await showWindowPreview();

  if (s.readerHealthy === true) {
    $("reader-check").className = "readercheck good";
    $("reader-state").textContent = "Reading confirmed. Dibs re-checks itself in the background.";
  } else if (s.readerHealthy === false) {
    $("reader-check").className = "readercheck bad";
    $("reader-state").innerHTML = `<strong>Autonomy is off</strong> — ${esc(s.readerFailReason || "the reading check hasn't passed")}. Everything queues for you.`;
  }

  const perf = await ledgerPerf();
  if (perf) {
    $("standfirst").textContent = `${perf.sales} sold · ${Math.round(perf.avgRealised * 100)}% of target · ${perf.avgDays} days avg`;
  }

  wireBench();
  renderQueue();
  renderListings();
  setInterval(() => { if (!$("pane-queue").hidden) renderQueue(); }, 30000);
})();
