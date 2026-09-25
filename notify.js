// Getting escalations to your phone. Every channel here is free.
//
// A note on email-to-SMS, since it's the obvious first idea: the free carrier
// gateways are gone. T-Mobile's tmomail.net stopped delivering in late 2024,
// AT&T shut down txt.att.net in June 2025, and Verizon's vtext.com is winding
// down with a hard cutoff of 31 March 2027 and messages already being dropped
// by spam filtering. Worse, they fail silently — no bounce, no error, the
// alert just never arrives. So Dibs doesn't offer it. Nothing that can
// silently stop working should be carrying "two buyers are competing".
//
// Channels are read-only by design. You still act in the side panel, because
// a stray tap on a phone notification shouldn't send a message about money.

import { getSettings } from "./storage.js";

export const CHANNELS = {
  desktop: {
    label: "Desktop notification",
    cost: "free, nothing to set up",
    note: "Already on. Only reaches you at the computer.",
  },
  ntfy: {
    label: "ntfy",
    cost: "free, no account",
    note: "Install the ntfy app, pick any topic name nobody would guess, type it below. Simplest way to get these on your phone.",
  },
  telegram: {
    label: "Telegram",
    cost: "free",
    note: "Message @BotFather, send /newbot, paste the token. Bots and the Bot API cost nothing.",
  },
  discord: {
    label: "Discord webhook",
    cost: "free",
    note: "Server settings, Integrations, New Webhook, copy the URL. Good if you're on Discord anyway.",
  },
  webhook: {
    label: "Your own webhook",
    cost: "depends on you",
    note: "Posts JSON. For wiring into anything else you run.",
  },
};

export async function push(title, body, { urgent = false } = {}) {
  const s = await getSettings();
  const results = [];

  // Always fire the local one — free, instant, no config.
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/128.png",
      title,
      message: body.slice(0, 400),
      priority: urgent ? 2 : 0,
      requireInteraction: urgent,
    });
    results.push("desktop");
  } catch {
    /* notifications may be blocked; not fatal */
  }

  const jobs = [];
  if (s.ntfyTopic) jobs.push(["ntfy", ntfy(s, title, body, urgent)]);
  if (s.telegramToken && s.telegramChatId) jobs.push(["telegram", telegram(s, title, body)]);
  if (s.discordWebhook) jobs.push(["discord", discord(s, title, body)]);
  if (s.customWebhook) jobs.push(["webhook", custom(s, title, body, urgent)]);

  for (const [name, job] of jobs) {
    if (await job) results.push(name);
  }

  return results;
}

// ntfy.sh — publish by HTTP POST to a topic, no account, no key. Pick an
// unguessable topic name, because anyone who knows it can read it.
async function ntfy(s, title, body, urgent) {
  const server = s.ntfyServer || "https://ntfy.sh";
  return post(`${server}/${encodeURIComponent(s.ntfyTopic)}`, {
    method: "POST",
    headers: {
      Title: title,
      Priority: urgent ? "high" : "default",
      Tags: urgent ? "warning" : "label",
    },
    body,
  });
}

async function telegram(s, title, body) {
  return post(`https://api.telegram.org/bot${s.telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: s.telegramChatId,
      text: `*${escapeMd(title)}*\n${escapeMd(body)}`,
      parse_mode: "Markdown",
    }),
  });
}

async function discord(s, title, body) {
  return post(s.discordWebhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: `**${title}**\n${body}`.slice(0, 1900) }),
  });
}

async function custom(s, title, body, urgent) {
  return post(s.customWebhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, body, urgent, at: new Date().toISOString(), source: "dibs" }),
  });
}

async function post(url, init) {
  try {
    const res = await fetch(url, init);
    return res.ok;
  } catch {
    return false; // a failed notification must never break the decision loop
  }
}

function escapeMd(s) {
  return String(s).replace(/([_*`\[\]])/g, "\\$1");
}

/* ------------------------------- the digest ------------------------------ */

export async function dailyDigest({ listings, queue, sent, parked }) {
  const lines = [];

  if (sent?.length) {
    lines.push(`Replied to ${sent.length}:`);
    for (const s of sent.slice(0, 6)) lines.push(`  ${s.buyerName} — ${s.summary}`);
  }
  if (parked?.length) lines.push(`Parked ${parked.length} to see who else turns up.`);
  if (queue?.length) lines.push(`${queue.length} waiting on you.`);

  for (const l of listings || []) {
    if (l.diagnosis) lines.push(`${l.title}: ${l.diagnosis.line}`);
  }

  if (!lines.length) lines.push("Quiet day. Nothing needed you.");

  await push("Dibs — today", lines.join("\n"));
  return lines;
}

// Sent when the reader itself is in trouble, which matters more than any
// individual message.
export async function pushReaderAlarm(detail) {
  await push(
    "Dibs has stopped sending",
    `It can't reliably tell your messages from the buyer's (${detail}). Everything is queued for you until you re-check the reading on the Tune tab.`,
    { urgent: true }
  );
}
