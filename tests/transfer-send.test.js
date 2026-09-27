const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness({ existing = false, pending = null } = {}) {
  const listeners = {};
  let dialogs = 0;
  let clicks = 0;
  let prevented = 0;
  class Element {}
  class HTMLFormElement extends Element {
    contains(node) { return node === input || node === button; }
  }
  const form = new HTMLFormElement();
  class HTMLTextAreaElement extends Element {
    constructor() { super(); this.current = "What should I do next?"; }
    get value() { return this.current; }
    set value(value) { this.current = value; }
    getClientRects() { return [1]; }
    getBoundingClientRect() { return { bottom: 100, right: 100 }; }
    closest() { return form; }
    contains(node) { return node === this; }
    focus() {}
    dispatchEvent() {}
  }
  class HTMLInputElement extends Element {}
  const input = new HTMLTextAreaElement();
  const button = new class extends Element {
    disabled = false;
    type = "submit";
    getClientRects() { return [1]; }
    getAttribute(name) { return name === "aria-label" ? "Send" : ""; }
    closest() { return this; }
    click() { clicks++; }
  }();
  const document = {
    body: { append() {} },
    addEventListener(name, callback) { listeners[name] = callback; },
    querySelectorAll(selector) {
      if (selector === "#prompt-textarea") return [input];
      if (selector === "button") return [button];
      if (existing && selector === "[data-message-author-role]") return [{ textContent: "Earlier message" }];
      return [];
    },
    createElement() { dialogs++; throw new Error("Unexpected popup"); }
  };
  const chrome = {
    runtime: { async sendMessage(message) {
      if (message.type === "GET_CORE_MEMORIES") return [{ id: "m1", text: "I prefer concise answers." }];
      if (message.type === "GET_PENDING_TRANSFER") return pending;
      if (message.type === "RAG_STATUS") return { enabled: false };
      if (message.type === "RAG_RETRIEVE") return { ragUsed: false };
      if (message.type === "COMPLETE_PENDING_TRANSFER") return { ok: true };
      return {};
    } },
    storage: { onChanged: { addListener() {} } }
  };
  const context = vm.createContext({ document, chrome, location: { hostname: "chatgpt.com" },
    Element, HTMLFormElement, HTMLTextAreaElement, HTMLInputElement,
    Event: class {}, setTimeout(callback, delay) { if (delay <= 500) queueMicrotask(callback); },
    window: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "memory-policy.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "transfer-core.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "transfer-context.js"), "utf8"), context);
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const send = () => listeners.click({ type: "click", target: button,
    preventDefault() { prevented++; }, stopImmediatePropagation() {} });
  return { input, send, settle, getClicks: () => clicks, getPrevented: () => prevented,
    getDialogs: () => dialogs };
}

test("first send adds context and replays without a review popup", async () => {
  const app = harness({ pending: { id: "t1", prompt: "Earlier conversation" } });
  await app.settle();
  app.send();
  await app.settle();
  assert.equal(app.getPrevented(), 1);
  assert.equal(app.getClicks(), 1);
  assert.match(app.input.value, /I prefer concise answers/);
  assert.match(app.input.value, /Earlier conversation/);
  assert.equal(app.getDialogs(), 0);
});

test("later messages send normally without interception", async () => {
  const app = harness({ existing: true });
  await app.settle();
  app.send();
  assert.equal(app.getPrevented(), 0);
  assert.equal(app.getDialogs(), 0);
});
