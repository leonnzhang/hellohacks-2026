const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness({ existing = false, pending = null, sendSucceeds = false, initial = "What should I do next?" } = {}) {
  const listeners = {};
  let dialogs = 0;
  let clicks = 0;
  let prevented = 0;
  let completed = 0;
  let sent = false;
  let indicatorVisible = false;
  class Element {}
  class HTMLFormElement extends Element {
    contains(node) { return node === input || node === button; }
  }
  const form = new HTMLFormElement();
  class HTMLTextAreaElement extends Element {
    constructor() { super(); this.current = initial; }
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
    click() { clicks++; if (sendSucceeds) { sent = true; input.value = ""; } }
  }();
  const document = {
    body: { append(node) { if (node.id === "relay-pending-transfer") indicatorVisible = true; } },
    addEventListener(name, callback) { listeners[name] = callback; },
    querySelectorAll(selector) {
      if (selector === "#prompt-textarea") return [input];
      if (selector === "button") return [button];
      if ((existing || sent) && selector === "[data-message-author-role]") return [{ textContent: "Earlier message" }];
      return [];
    },
    createElement(tag) {
      if (["div", "span", "button"].includes(tag)) return {
        style: {}, setAttribute() {}, append() {}, addEventListener() {},
        remove() { indicatorVisible = false; }
      };
      dialogs++;
      throw new Error("Unexpected popup");
    }
  };
  const chrome = {
    runtime: { async sendMessage(message) {
      if (message.type === "GET_CORE_MEMORIES") return [{ id: "m1", text: "I prefer concise answers.", scope: "global", origin: "manual" }];
      if (message.type === "GET_PENDING_TRANSFER") return pending;
      if (message.type === "RAG_STATUS") return { enabled: false };
      if (message.type === "RAG_RETRIEVE") return { ragUsed: false };
      if (message.type === "COMPLETE_PENDING_TRANSFER") { completed++; return { ok: true }; }
      return {};
    } },
    storage: { onChanged: { addListener() {} } }
  };
  const context = vm.createContext({ document, chrome, location: { hostname: "chatgpt.com", href: "https://chatgpt.com/" },
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
    getDialogs: () => dialogs, getCompleted: () => completed,
    getIndicator: () => indicatorVisible };
}

test("Send adds pending context and replays without a review popup", async () => {
  const app = harness({ pending: { id: "t1", prompt: "Earlier conversation" } });
  await app.settle();
  app.send();
  await app.settle();
  assert.equal(app.getPrevented(), 1);
  assert.equal(app.getClicks(), 1);
  assert.match(app.input.value, /I prefer concise answers/);
  assert.match(app.input.value, /Earlier conversation/);
  assert.equal(app.getCompleted(), 0);
  assert.equal(app.getIndicator(), true);
  assert.equal(app.getDialogs(), 0);
});

test("pending transfer is cleared only after the destination sends", async () => {
  const app = harness({ pending: { id: "t1", prompt: "Earlier conversation" }, sendSucceeds: true });
  await app.settle();
  app.send();
  await app.settle();
  assert.equal(app.getClicks(), 1);
  assert.equal(app.getCompleted(), 1);
  assert.equal(app.getIndicator(), false);
});

test("a restored legacy Relay placeholder is cleared before it can be transferred again", async () => {
  const app = harness({
    pending: { id: "t1", prompt: "Earlier conversation" },
    initial: "I am continuing work from another AI chat.\nPREVIOUS CONVERSATION\nUSER:\nold context\nMY NEXT REQUEST\n[Add your next request here before sending]"
  });
  await app.settle();
  assert.match(app.input.value, /^\[Relay transfer context — start\]/);
  assert.match(app.input.value, /CURRENT REQUEST\n$/);
  assert.doesNotMatch(app.input.value, /Add your next request here/);
  assert.equal(app.getClicks(), 0);
  assert.equal(app.getCompleted(), 0);
  assert.equal(app.getIndicator(), true);
});

test("transfer context appears before Send and memories are inserted when Send is clicked", async () => {
  const app = harness({ pending: { id: "t1", prompt: "Earlier conversation" }, initial: "" });
  await app.settle();
  assert.match(app.input.value, /Earlier conversation/);
  assert.doesNotMatch(app.input.value, /I prefer concise answers/);
  app.send();
  assert.equal(app.getPrevented(), 1);
  assert.equal(app.getClicks(), 0);
  app.input.value = app.input.value.replace("Earlier conversation", "Edited conversation") + "What should I do next?";
  app.send();
  await app.settle();
  assert.equal(app.getClicks(), 1);
  assert.match(app.input.value, /Edited conversation/);
  assert.doesNotMatch(app.input.value, /Earlier conversation/);
  assert.match(app.input.value, /I prefer concise answers/);
  assert.equal((app.input.value.match(/Edited conversation/g) || []).length, 1);
});

test("a new transfer replaces an unused Relay draft from an earlier destination tab", async () => {
  const oldDraft = "[Relay transfer context — start]\nOld conversation\n[Relay transfer context — end]\n\nCURRENT REQUEST\n";
  const app = harness({ pending: { id: "t2", prompt: "New conversation" }, initial: oldDraft });
  await app.settle();
  assert.match(app.input.value, /New conversation/);
  assert.doesNotMatch(app.input.value, /Old conversation/);
  assert.equal(app.getCompleted(), 0);
});

test("first send waits for pending transfer to load", async () => {
  const app = harness({ pending: { id: "t1", prompt: "Earlier conversation" } });
  app.send();
  await app.settle();
  assert.equal(app.getPrevented(), 1);
  assert.equal(app.getClicks(), 1);
  assert.match(app.input.value, /Earlier conversation/);
});

test("later messages send normally without interception", async () => {
  const app = harness({ existing: true });
  await app.settle();
  app.send();
  assert.equal(app.getPrevented(), 0);
  assert.equal(app.getDialogs(), 0);
});
