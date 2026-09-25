// Reads local asking prices straight off a Marketplace search results page.
// Parsed structurally from the DOM — raw HTML never goes to a model, which is
// the one place a naive build would burn real money.
//
// Facebook's markup changes. This is written to degrade rather than break:
// if the selectors stop matching, it returns what it found and says so, and
// the panel treats low confidence honestly instead of inventing precision.

function parseResults() {
  const seen = new Set();
  const comps = [];

  for (const link of document.querySelectorAll('a[href*="/marketplace/item/"]')) {
    const href = link.getAttribute("href") || "";
    const id = href.match(/item\/(\d+)/)?.[1];
    if (!id || seen.has(id)) continue;

    const text = link.innerText || "";
    const priceMatch = text.match(/\$\s?([\d,]+)/);
    if (!priceMatch) continue;

    const price = parseInt(priceMatch[1].replace(/,/g, ""), 10);
    if (!price || price > 100000) continue;

    // The link's own text block is title + price + location, one per line.
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = lines.find((l) => !/^\$/.test(l) && l.length > 3) || "Listing";
    const location = lines[lines.length - 1] || "";

    seen.add(id);
    comps.push({ id, price, title: title.slice(0, 90), location });
  }

  return comps;
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.type !== "dibs:scrape-comps") return;
  // Give the feed a beat to hydrate, then read once. No polling — a single
  // read per drafting session, the same lookup you'd do by hand.
  setTimeout(() => {
    const comps = parseResults();
    respond({ comps, ok: comps.length > 0, url: location.href });
  }, 1800);
  return true;
});
