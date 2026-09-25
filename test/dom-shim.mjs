// A DOM small enough to hand-roll, real enough to run messenger.js unmodified.
// No jsdom available offline, so this implements exactly the surface the
// content script touches.

class El {
  constructor(spec = {}) {
    Object.assign(this, { tag:"div", attrs:{}, children:[], text:"", rect:null, editable:false, ...spec });
    for (const c of this.children) c.parent = this;
  }
  get innerText() {
    if (this.text) return this.text;
    return this.children.map(c => c.innerText).filter(Boolean).join("\n");
  }
  set innerText(v) { this.text = v; }
  getAttribute(n) { return this.attrs[n] ?? null; }
  // Real anchors and images expose these as properties, not just attributes.
  get href() { return this.attrs.href; }
  get src() { return this.attrs.src; }
  setAttribute(n,v) { this.attrs[n]=v; }
  getBoundingClientRect() {
    return this.rect || { left:0, right:0, width:0, height:0, top:0, bottom:0 };
  }
  get firstElementChild() { return this.children[0] || null; }
  closest(sel) {
    let n = this;
    while (n) { if (n.matches(sel)) return n; n = n.parent; }
    return null;
  }
  matches(sel) {
    // supports: tag, [attr], [attr="v"], [attr*="v"], combinations
    const tagM = sel.match(/^([a-z][a-z0-9]*)/i);
    if (tagM && this.tag !== tagM[1]) return false;
    for (const [,name,op,val] of sel.matchAll(/\[([\w-]+)(?:(\*?=)"([^"]*)")?\]/g)) {
      const have = this.attrs[name];
      if (have == null) return false;
      if (op === "=" && have !== val) return false;
      if (op === '*=' && !String(have).includes(val)) return false;
    }
    return true;
  }
  descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
  // Proper selector engine: comma-separated lists and descendant combinators.
  // The first version filtered the same pool repeatedly, which silently broke
  // every multi-part selector — and made the app look broken when it wasn't.
  querySelectorAll(sel) {
    const out = [];
    for (const alt of sel.split(",").map(x => x.trim()).filter(Boolean)) {
      const parts = alt.split(/\s+/).filter(Boolean);
      let pool = [this];
      for (const part of parts) {
        pool = pool.flatMap(n => n.descendants().filter(e => e.matches(part)));
      }
      for (const e of pool) if (!out.includes(e)) out.push(e);
    }
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  dispatchEvent(ev) {
    if (ev.key === "Enter" && this._onEnter) this._onEnter(this.text);
    return true;
  }
  focus() { globalThis.document._focused = this; }
}

export function buildPage({ messages, listRect = { left:0, right:800, width:800 }, marketplace = true, composerText = "", buyerName = "Dana R." }) {
  const rows = messages.map(m => {
    const bubbleRect = m.mine
      ? { left:520, right:780, width:260 }
      : { left:20, right:280, width:260 };
    const bubble = new El({ tag:"div", attrs:{ dir:"auto" }, text:m.text, rect:bubbleRect });
    const kids = [bubble];
    if (!m.mine && m.avatar !== false) kids.push(new El({ tag:"img", attrs:{ src:"https://scontent.fbcdn.net/x.jpg" } }));
    return new El({ tag:"div", attrs:{ role:"row", ...(m.aria ? { "aria-label":m.aria } : {}) }, children:kids, rect:bubbleRect });
  });

  const list = new El({ tag:"div", attrs:{ role:"grid" }, children:rows, rect:listRect });
  const composer = new El({ tag:"div", attrs:{ role:"textbox", contenteditable:"true", "aria-label":"Message" }, text:composerText, editable:true });
  // Simulate what Messenger does on Enter: clear the box and add the sent
  // message to the thread as an outgoing row.
  composer._onEnter = (text) => {
    if (!text) return;
    composer.text = "";
    const bubble = new El({ tag:"div", attrs:{ dir:"auto" }, text, rect:{ left:520, right:780, width:260 } });
    const row = new El({ tag:"div", attrs:{ role:"row", "aria-label":`You sent ${text}` }, children:[bubble], rect:{ left:520, right:780, width:260 } });
    row.parent = list; list.children.push(row);
  };
  const header = new El({ tag:"h1", text:buyerName });
  const mpLink = marketplace ? [new El({ tag:"a", attrs:{ href:"https://www.facebook.com/marketplace/item/999" } })] : [];
  const main = new El({ tag:"div", attrs:{ role:"main" }, children:[header, ...mpLink, list, composer] });
  const body = new El({ tag:"body", children:[main] });

  globalThis.document = {
    _root: body, _focused: null,
    cookie: "c_user=5551; xs=abc",
    querySelector: (s) => body.querySelector(s),
    querySelectorAll: (s) => body.querySelectorAll(s),
    execCommand: (cmd, _x, text) => {
      if (cmd === "insertText" && globalThis.document._focused) globalThis.document._focused.text += text;
      return true;
    },
    addEventListener(){},
  };
  globalThis.location = { pathname:"/messages/t/111", href:"https://www.facebook.com/messages/t/111" };
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "Mozilla/5.0 Chrome/141.0.0.0" },
    configurable: true, writable: true,
  });
  globalThis.KeyboardEvent = class { constructor(type, init){ Object.assign(this, { type }, init); } };
  globalThis.setInterval = () => 0;

  return { body, list, composer, rows, main };
}
