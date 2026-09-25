// Dibs selector diagnostic
//
// Paste this into DevTools (F12 -> Console) with a Marketplace buyer thread
// open in Messenger. It reports whether Dibs can find what it needs and how
// Facebook's markup is actually shaped right now.
//
// It prints STRUCTURE ONLY — attribute names, counts, geometry, and whether
// patterns matched. No message text and no names: aria labels are reported as
// a pattern shape ("<name> sent <text>") rather than their contents. Read the
// output before you paste it anywhere, but there should be nothing in it you'd
// mind sharing.

(() => {
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
  };

  const report = { chrome: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1], url: location.pathname };

  // --- which candidate selector wins for each thing Dibs needs -----------
  report.selectors = {};
  for (const [name, cands] of Object.entries(SEL)) {
    const hits = cands.map((s) => ({ sel: s, n: document.querySelectorAll(s).length }));
    const winner = hits.find((h) => h.n > 0);
    report.selectors[name] = {
      matched: winner ? winner.sel : null,
      count: winner ? winner.n : 0,
      fallbackDepth: winner ? cands.indexOf(winner.sel) : -1,
      allCounts: hits.map((h) => h.n),
    };
  }

  // --- is this recognised as a Marketplace thread at all? ----------------
  const main = document.querySelector('div[role="main"]');
  report.marketplace = {
    hasItemLink: !!main?.querySelector('a[href*="/marketplace/item/"]'),
    itemIdFound: !!main?.querySelector('a[href*="/marketplace/item/"]')?.href.match(/item\/(\d+)/),
    textFallbackWouldMatch: /marketplace|is this still available/i.test(main?.innerText.slice(0, 500) || ""),
  };

  report.identity = {
    cUserCookiePresent: /(?:^|;\s*)c_user=\d+/.test(document.cookie),
    threadIdInUrl: !!location.pathname.match(/\/messages\/t\/(\d+)/),
  };

  // --- the part that actually matters: can rows be attributed? -----------
  const list = document.querySelector(report.selectors.messageList.matched || 'div[role="main"]');
  const rows = list ? [...list.querySelectorAll(report.selectors.messageRow.matched || 'div[role="row"]')] : [];
  const listRect = list?.getBoundingClientRect();

  const hasAvatar = (r) =>
    !!(r.querySelector('image, img[src*="fbcdn"], svg image') ||
       r.querySelector('a[href*="/user/"], a[href*="profile.php"]'));

  const avatarsInUse = rows.some(hasAvatar);
  let readable = 0;

  report.rows = rows.slice(-12).map((row) => {
    const label = row.getAttribute("aria-label") || "";
    const sigs = [];

    if (/^\s*you sent\b/i.test(label)) sigs.push("ariaSelf:me");
    const m = label.match(/^(.{2,50}?)\s+sent\b/i);
    if (m) sigs.push(/^you$/i.test(m[1].trim()) ? "ariaSender:me" : "ariaSender:buyer");
    if (row.querySelector('[data-testid="incoming_message"]')) sigs.push("testid:buyer");
    if (row.querySelector('[data-testid="outgoing_message"]')) sigs.push("testid:me");
    if (hasAvatar(row)) sigs.push("avatar:buyer");
    else if (avatarsInUse) sigs.push("noAvatar:me");

    // geometry
    let geo = null;
    const bubble = row.querySelector('[dir="auto"]')?.closest("div") || row.firstElementChild || row;
    const r = bubble?.getBoundingClientRect();
    if (r?.width && listRect?.width) {
      const leftGap = r.left - listRect.left;
      const rightGap = listRect.right - r.right;
      const total = leftGap + rightGap;
      if (total >= 40) {
        const bias = (rightGap - leftGap) / total;
        geo = bias < -0.35 ? "me" : bias > 0.35 ? "buyer" : "centred";
        if (geo !== "centred") sigs.push(`geometry:${geo}`);
      } else {
        geo = "fullWidth";
      }
    }

    const W = { ariaSelf: 40, ariaSender: 40, testid: 30, avatar: 20, noAvatar: 20, geometry: 15 };
    const votes = { me: 0, buyer: 0 };
    for (const s of sigs) {
      const [k, who] = s.split(":");
      votes[who] += W[k] || 0;
    }
    const winner = votes.me >= votes.buyer ? "me" : "buyer";
    const loser = winner === "me" ? "buyer" : "me";
    const agreeing = sigs.filter((s) => s.endsWith(`:${winner}`)).length;
    const strong =
      (votes[winner] >= 40 && votes[winner] - votes[loser] >= 20) ||
      (agreeing >= 2 && votes[loser] === 0 && votes[winner] >= 30);
    if (strong) readable++;

    return {
      // Pattern shape only — the sender's name is replaced, not truncated,
      // so nothing identifying leaves the page.
      ariaShape: !label
        ? null
        : /^\s*you sent\b/i.test(label)
        ? "You sent <text>"
        : /^.{2,50}?\s+sent\b/i.test(label)
        ? "<name> sent <text>"
        : `<unrecognised pattern, ${label.split(/\s+/).length} words>`,
      signals: sigs,
      geometry: geo,
      verdict: strong ? winner : "UNKNOWN",
    };
  });

  report.health = rows.length ? +(readable / report.rows.length).toFixed(2) : 0;
  report.verdict =
    report.health >= 0.7
      ? "OK — Dibs should be able to read this thread"
      : "TOO LOW — Dibs will refuse to send and queue everything for you";

  console.log("%c=== Dibs selector diagnostic ===", "font-weight:bold");
  console.log(JSON.stringify(report, null, 2));
  console.log(
    "%cCopy the JSON above. Check it for anything you'd rather not share before pasting it back.",
    "color:#d6202f;font-weight:bold"
  );
  return report;
})();
