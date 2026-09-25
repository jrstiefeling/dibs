// A real-enough chrome API so the shipped modules can be imported and run
// unmodified. No reimplementation of app logic anywhere in here.

const store = {};
export const log = { notifications: [], fetches: [], tabMessages: [], tabUpdates: [] };
export let contentScriptReply = () => ({ ok: false, reason: "not_mocked" });
export function setContentScript(fn) { contentScriptReply = fn; }
export function resetStore() { for (const k of Object.keys(store)) delete store[k]; }
export function raw() { return JSON.parse(JSON.stringify(store)); }

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        if (keys == null) return clone(store);
        if (typeof keys === "string") return { [keys]: clone(store[keys]) };
        if (Array.isArray(keys)) {
          const out = {};
          for (const k of keys) out[k] = clone(store[k]);
          return out;
        }
        const out = {};
        for (const [k, dflt] of Object.entries(keys)) out[k] = k in store ? clone(store[k]) : dflt;
        return out;
      },
      async set(obj) { for (const [k, v] of Object.entries(obj)) store[k] = clone(v); },
      async remove(k) { delete store[k]; },
    },
  },
  tabs: {
    async query() { return [{ id: 7, url: "https://www.facebook.com/messages/t/111" }]; },
    async sendMessage(tabId, msg) {
      log.tabMessages.push({ tabId, msg });
      const res = await contentScriptReply(msg);
      if (res === undefined) throw new Error("Could not establish connection");
      return res;
    },
    async update(tabId, props) { log.tabUpdates.push({ tabId, props }); },
    async create() { return { id: 99 }; },
    async remove() {},
    onUpdated: { addListener() {}, removeListener() {} },
  },
  runtime: {
    onMessage: { addListener(fn) { globalThis.__bgListener = fn; } },
    async sendMessage() { return { ok: true }; },
    onInstalled: { addListener(fn) { globalThis.__onInstalled = fn; } },
  },
  notifications: { async create(o) { log.notifications.push(o); } },
  alarms: { create() {}, onAlarm: { addListener(fn) { globalThis.__alarm = fn; } } },
  action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
  sidePanel: { setPanelBehavior: async () => {} },
  identity: { async getAuthToken() { throw new Error("no oauth client configured"); } },
};

globalThis.fetch = async (url, init) => {
  log.fetches.push({ url: String(url), init });
  if (String(url).includes("api.anthropic.com")) {
    return {
      ok: true,
      async json() {
        return {
          content: [{ type: "text", text: JSON.stringify({ answerable: false, missing: "exact seat depth" }) }],
          usage: { input_tokens: 800, output_tokens: 40 },
        };
      },
    };
  }
  return { ok: true, async json() { return {}; }, async text() { return ""; } };
};
