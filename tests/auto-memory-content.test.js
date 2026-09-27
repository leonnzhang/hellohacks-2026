const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("ChatGPT capture falls back when its primary selector finds only one role", () => {
  const node = (text, position) => ({
    position,
    cloneNode: () => ({ querySelectorAll: () => [], textContent: text }),
    compareDocumentPosition: (other) => position < other.position ? 4 : 2
  });
  const user = { ...node("For future chats, use bullet points.", 0), getAttribute: () => "user" };
  const userParent = node("You said: For future chats, use bullet points.", 0);
  const assistantParent = node("ChatGPT said: Understood.", 1);
  const headings = [
    { textContent: "You said:", parentElement: userParent },
    { textContent: "ChatGPT said:", parentElement: assistantParent }
  ];
  let useHeadings = true;
  const document = {
    title: "Chat", addEventListener() {},
    querySelector: () => ({ innerText: "You said:\nFor future chats, use bullet points.\nChatGPT said:\nUnderstood.\nChat with ChatGPT" }),
    querySelectorAll(selector) {
      if (selector === "[data-message-author-role]") return [user];
      if (selector === "h4, [role='heading']") return useHeadings ? headings : [];
      return [];
    }
  };
  const chrome = { runtime: { onMessage: { addListener() {} } } };
  const context = vm.createContext({
    document, chrome, location: { hostname: "chatgpt.com", href: "https://chatgpt.com/c/example" },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 }, addEventListener() {}
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, "globalThis.__testCapture = capture;\n})();"), context);
  const result = context.__testCapture();
  assert.deepEqual(Array.from(result.messages, (item) => item.role), ["user", "assistant"]);
  assert.equal(result.messages[1].text, "Understood.");
  useHeadings = false;
  const accessibleText = context.__testCapture();
  assert.equal(accessibleText.captureMethod, "accessible text");
  assert.equal(accessibleText.messages[1].text, "Understood.");
  assert.deepEqual(Array.from(accessibleText.messages, (item) => item.role), ["user", "assistant"]);
});

test("a failed auto-memory scan retries the same conversation after a cooldown", async () => {
  let now = 100000;
  let captureCalls = 0;
  const messageNode = (role, text, position) => ({
    getAttribute: () => role,
    cloneNode: () => ({ querySelectorAll: () => [], textContent: text }),
    compareDocumentPosition: (other) => position < other.position ? 4 : 2,
    position
  });
  const nodes = [messageNode("user", "I prefer concise answers.", 0),
    messageNode("assistant", "Understood.", 1)];
  const document = {
    title: "Chat",
    body: { append() {} },
    addEventListener() {},
    querySelectorAll: (selector) => selector === "[data-message-author-role]" ? nodes : [],
    createElement: () => ({ setAttribute() {}, style: {}, remove() {} })
  };
  const chrome = { runtime: {
    async sendMessage(message) {
      if (message.type === "AUTO_MEMORY_STATUS") return { enabled: true };
      if (message.type === "AUTO_MEMORY_CAPTURE") {
        captureCalls++;
        return captureCalls === 1 ? { status: "error" } : { status: "processed", saved: [] };
      }
      return {};
    },
    onMessage: { addListener() {} }
  } };
  const context = vm.createContext({
    document, chrome, location: { hostname: "chatgpt.com", href: "https://chatgpt.com/c/example" },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    MutationObserver: class { observe() {} },
    Date: { now: () => now },
    setTimeout() {}, clearTimeout() {}, setInterval() {},
    requestAnimationFrame() {}, addEventListener() {}
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, "globalThis.__testSendAutoCapture = sendAutoCapture;\n})();"), context);
  const scan = context.__testSendAutoCapture;

  await scan();
  assert.equal(captureCalls, 1);
  await scan();
  assert.equal(captureCalls, 1);
  now += 60000;
  await scan();
  assert.equal(captureCalls, 2);
  await scan();
  assert.equal(captureCalls, 2);
});

test("the save toast explains the memory and shows a draining Undo window", async () => {
  let now = 10000;
  let tick;
  let animation;
  const sent = [];
  class Element {
    constructor(tag) {
      this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; this.dataset = {};
      this.style = { setProperty(name, value) { this[name] = value; } };
      this.classList = { add() {}, contains: () => false };
    }
    get isConnected() { return !!this.parent; }
    attachShadow() {
      const stack = new Element("stack");
      this.shadowRoot = { querySelector: () => stack };
      return this.shadowRoot;
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
    addEventListener(name, handler) { this.events[name] = handler; }
    animate(frames, options) { animation = { frames, options }; }
  }
  const body = new Element("body");
  const document = {
    body, documentElement: new Element("html"), createElement: (tag) => new Element(tag),
    addEventListener() {}, querySelectorAll: () => []
  };
  const chrome = { runtime: {
    async sendMessage(message) { sent.push(message); return { ok: true }; },
    onMessage: { addListener() {} }
  } };
  const context = vm.createContext({
    document, chrome, location: { hostname: "chatgpt.com" },
    getComputedStyle: () => ({ backgroundColor: "rgb(255, 255, 255)", color: "rgb(20, 20, 20)", colorScheme: "light" }),
    MutationObserver: class { observe() {} },
    Date: { now: () => now },
    setTimeout() {}, clearTimeout() {}, setInterval(callback) { tick = callback; return 1; },
    clearInterval() {}, requestAnimationFrame() {}, addEventListener() {}
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,
    "globalThis.__testToast = showAutoMemoryToast;\n})();"), context);
  const find = (element, predicate) => predicate(element) ? element :
    element.children.map((child) => find(child, predicate)).find(Boolean);
  const allText = (element) => [element.textContent || "", ...element.children.map(allText)].join(" ");
  const memory = { id: "m1", text: "The user prefers concise answers.",
    quote: "I prefer concise answers", reason: "Changes how future answers should be written." };

  context.__testToast([memory]);
  const stack = body.children[0].shadowRoot.querySelector(".stack");
  const toast = stack.children[0];
  assert.match(allText(toast), /Because you said “I prefer concise answers”/);
  assert.match(allText(toast), /Changes how future answers should be written/);
  assert.equal(animation.options.duration, 10000);
  assert.equal(animation.frames[0].transform, "scaleX(1)");
  assert.equal(animation.frames[1].transform, "scaleX(0)");
  const progress = find(toast, (item) => item.attributes.role === "progressbar");
  now += 5000;
  tick();
  assert.equal(progress.attributes["aria-valuenow"], "5");
  await find(toast, (item) => item.tag === "button").events.click();
  assert.equal(sent[0].type, "UNDO_AUTO_MEMORIES");
  assert.match(allText(toast), /Memory removed/);

  now += 5000;
  context.__testToast([{ ...memory, id: "m2" }]);
  const nextToast = stack.children[0];
  now += 10000;
  tick();
  assert.match(allText(nextToast), /Saved in Relay/);
  assert.equal(find(nextToast, (item) => item.tag === "button"), undefined);
  context.RELAY_UI.notice("A transfer is ready.");
  assert.equal(body.children.length, 1, "notifications share one host");
  assert.equal(stack.children.length, 2, "transfer and memory feedback stack without replacing each other");
});

test("theme detection respects a dark color scheme and ignores transparent white backgrounds", () => {
  let scheme = "dark";
  let background = "rgba(255, 255, 255, 0)";
  const body = { dataset: {}, classList: { contains: () => false } };
  const root = { dataset: {}, classList: { contains: () => false } };
  const context = vm.createContext({
    document: { body, documentElement: root, querySelectorAll: () => [], addEventListener() {} },
    location: { hostname: "chatgpt.com" },
    getComputedStyle: (node) => ({ backgroundColor: node === body ? background : "rgb(255, 255, 255)", colorScheme: scheme }),
    chrome: { runtime: { onMessage: { addListener() {} } } },
    MutationObserver: class { observe() {} }, Date, setTimeout() {}, clearTimeout() {}, setInterval() {},
    requestAnimationFrame() {}, addEventListener() {}
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, "globalThis.theme = chatTheme;\n})();"), context);
  assert.equal(context.theme().dark, true);
  scheme = "light";
  assert.equal(context.theme().dark, false);
  scheme = "light dark";
  background = "oklch(0.247759 0 none)";
  assert.equal(context.theme().dark, true);
  background = "oklch(98% 0 none)";
  assert.equal(context.theme().dark, false);
});
