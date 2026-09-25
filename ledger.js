// Your own comps, built from your own sales. After twenty of these it beats
// anybody's general pricing advice, because it's your market and your items.

const KEY = "ledger";

export async function recordSale({ listing, finalPrice, buyerName, days, inquiries }) {
  const { [KEY]: rows = [] } = await chrome.storage.local.get(KEY);
  rows.push({
    id: crypto.randomUUID(),
    title: listing.title,
    category: listing.category || "",
    listPrice: listing.listPrice,
    target: listing.target,
    finalPrice,
    realised: Number((finalPrice / listing.target).toFixed(3)),
    days,
    inquiries,
    buyerName,
    soldAt: Date.now(),
  });
  await chrome.storage.local.set({ [KEY]: rows });
  return rows;
}

export async function getLedger() {
  const { [KEY]: rows = [] } = await chrome.storage.local.get(KEY);
  return rows.sort((a, b) => b.soldAt - a.soldAt);
}

export async function performance() {
  const rows = await getLedger();
  if (!rows.length) return null;

  const avg = (f) => rows.reduce((n, r) => n + f(r), 0) / rows.length;
  const gross = rows.reduce((n, r) => n + r.finalPrice, 0);

  return {
    sales: rows.length,
    gross,
    avgRealised: Number(avg((r) => r.realised).toFixed(2)), // 1.0 means you hit target
    avgDays: Math.round(avg((r) => r.days)),
    avgInquiries: Math.round(avg((r) => r.inquiries || 0)),
  };
}

// If you've sold similar things before, that history outranks scraped comps.
export async function priorFor(title) {
  const rows = await getLedger();
  const words = title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const hits = rows.filter((r) => {
    const t = r.title.toLowerCase();
    return words.filter((w) => t.includes(w)).length >= 2;
  });
  if (!hits.length) return null;
  const median = hits.map((h) => h.finalPrice).sort((a, b) => a - b)[Math.floor(hits.length / 2)];
  return { count: hits.length, median, avgDays: Math.round(hits.reduce((n, h) => n + h.days, 0) / hits.length) };
}

/* --------------------------- live diagnostics --------------------------- */

// Low views is a photo and title problem. Plenty of views but no offers is a
// price problem. Different diagnoses, different fixes.
export function diagnose({ days, views, inquiries, offers }) {
  // Underpricing shows up in the first 48 hours, so this has to be checked
  // before the general "too early to tell" guard below.
  if (inquiries >= 5 && days <= 2) {
    return {
      verdict: "underpriced",
      line: "Five or more messages in the first couple of days means you're under the market. Hold at target, or put the price up.",
    };
  }

  if (days < 3) return null;
  if (views < 30 && days >= 5) {
    return {
      verdict: "presentation",
      line: "Barely anyone is looking. That's the photos and the title, not the price. Reshoot the lead image and relist.",
    };
  }
  if (views >= 80 && inquiries <= 1 && days >= 5) {
    return {
      verdict: "price",
      line: "People are looking and not messaging. That's the price. Drop it and relist to retrigger the feed.",
    };
  }
  if (days >= 10) {
    return {
      verdict: "stale",
      line: "Day ten. Relist with a fresh title and a lower number — the floor has already eased, so the maths works.",
    };
  }
  return null;
}

// Two buyers interested in two different things you're selling is a bundle.
export function bundleHint(listings, threads) {
  const byBuyer = {};
  for (const t of threads) {
    byBuyer[t.buyerName] ??= new Set();
    byBuyer[t.buyerName].add(t.listingRef);
  }
  for (const [name, refs] of Object.entries(byBuyer)) {
    if (refs.size >= 2) {
      const titles = [...refs]
        .map((r) => listings.find((l) => l.url?.includes(r))?.title)
        .filter(Boolean);
      if (titles.length >= 2) {
        return { buyerName: name, titles, line: `${name} is asking about ${titles.join(" and ")}. Offer them both together.` };
      }
    }
  }
  return null;
}
