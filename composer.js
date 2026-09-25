import { cloud, parseJson } from "./llm.js";

/* ---------------------------- comps gathering ---------------------------- */

export async function gatherComps(query) {
  const url =
    "https://www.facebook.com/marketplace/search/?query=" +
    encodeURIComponent(query) +
    "&sortBy=creation_time_descend";

  const tab = await chrome.tabs.create({ url, active: false });

  try {
    await waitForLoad(tab.id);
    const res = await chrome.tabs.sendMessage(tab.id, { type: "dibs:scrape-comps" });
    return res?.comps || [];
  } catch {
    return [];
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const done = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(done);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(done);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(done);
      resolve();
    }, 12000);
  });
}

/* ------------------------------ pricing math ----------------------------- */
// No model involved. Median of what's actually listed near you, adjusted for
// what you're optimising for, then anchored above target so there's room to
// haggle down to the number you actually wanted.

const GOAL_FACTOR = { price: 1.08, balanced: 1.0, speed: 0.85 };

export function priceIt(comps, goal, settings) {
  const prices = comps.map((c) => c.price).sort((a, b) => a - b);

  if (prices.length === 0) {
    return { confidence: "none", comps: [] };
  }

  // Trim the tails: the cheapest listing is usually broken and the dearest is
  // usually the one that's been sitting there for six weeks.
  const trimmed = prices.length >= 5 ? prices.slice(1, -1) : prices;
  const median = trimmed[Math.floor(trimmed.length / 2)];
  const spread = (prices[prices.length - 1] - prices[0]) / median;

  const target = Math.round((median * GOAL_FACTOR[goal]) / 5) * 5;
  const listPrice = psych(target * (1 + settings.anchorPct / 100));
  const floor = Math.round(target * (settings.floorPct / 100));

  const confidence =
    prices.length >= 6 && spread < 0.9 ? "high" : prices.length >= 3 ? "fair" : "low";

  return {
    target,
    listPrice,
    floor,
    median,
    low: prices[0],
    high: prices[prices.length - 1],
    count: prices.length,
    confidence,
    comps,
  };
}

// $89, not $90. Just below a round number reads as a better deal.
function psych(n) {
  const rounded = Math.round(n);
  if (rounded < 40) return rounded % 5 === 0 ? rounded - 1 : rounded;
  const base = Math.round(rounded / 10) * 10;
  return base - 1;
}

/* ------------------------------ copy writing ----------------------------- */
// The one place to spend tokens freely: this runs once per listing and it
// decides what the thing actually sells for.

const SYSTEM = `You write Facebook Marketplace listings for a private individual selling their own used things locally. Not a business, not a dropshipper.

Rules:
- Title: what a buyer would actually type into search. Brand, model, key spec, condition. No "moving sale", no exclamation marks, no emoji.
- Description structure, in this order: one line saying what it is with the specs that stop people messaging to ask; the retail anchor if a paid-new price was given ("Retail $250, asking $95"); condition stated honestly including every flaw mentioned; what's included; terms; one line on why it's being sold.
- Terms line is always local pickup and cash. Never offer shipping or delivery.
- Never invent a fact that wasn't given to you. If a spec is missing, leave it out rather than guessing.
- Disclose flaws plainly. It costs nothing and prevents a haggle ambush at the handoff.
- Sound like a normal person typing quickly but clearly. No marketing voice.

Return only JSON:
{"title": "...", "description": "...", "category": "...", "condition": "New|Used - Like New|Used - Good|Used - Fair",
 "facts": ["short factual statements Dibs may repeat to buyers"],
 "sweeteners": ["non-price things that could be thrown in instead of discounting"],
 "shotList": ["specific photo to take, one per line"],
 "firmNos": ["things to refuse regardless of offer"]}`;

export async function writeListing({ item, area, paidNew, pricing, goal }) {
  const brief = [
    `Item: ${item}`,
    area && `Area: ${area}`,
    paidNew && `Paid new: $${paidNew}`,
    pricing?.listPrice && `Listing at: $${pricing.listPrice}`,
    pricing?.count &&
      `Local comparables: ${pricing.count} listings, $${pricing.low}–$${pricing.high}, median $${pricing.median}`,
    `Priority: ${goal}`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await cloud({
    system: SYSTEM,
    messages: [{ role: "user", content: brief }],
    maxTokens: 1400,
  });

  const parsed = parseJson(raw);
  return { ...parsed, area };
}

/* --------------------------- timing suggestion --------------------------- */
// Evening posts beat daytime, and Thursday around 8:30pm gives buyers time to
// plan a weekend pickup.

export function timingNote(now = new Date()) {
  const day = now.getDay();
  const hour = now.getHours();
  if (hour >= 18 && hour <= 22) return null; // good enough, post it
  if (day === 4 || day === 5) {
    return "Hold this until about 8:30 tonight — evening posts get seen more.";
  }
  return "Thursday evening around 8:30 is the strongest slot. Worth waiting if you're not in a hurry.";
}
