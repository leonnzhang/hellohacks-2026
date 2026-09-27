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
    querySelector: () => ({ innerText: "You said:\nFor future chats, use bullet points.\nChatGPT said:\nUnderstood." }),
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
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.style = {}; this.events = {}; }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
    addEventListener(name, handler) { this.events[name] = handler; }
    animate(frames, options) { animation = { frames, options }; }
  }
  const body = new Element("body");
  const document = {
    body, createElement: (tag) => new Element(tag),
    addEventListener() {}, querySelectorAll: () => []
  };
  const chrome = { runtime: {
    async sendMessage(message) { sent.push(message); return { ok: true }; },
    onMessage: { addListener() {} }
  } };
  const context = vm.createContext({
    document, chrome, location: { hostname: "chatgpt.com" },
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
  const toast = body.children[0];
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
  const nextToast = body.children[0];
  now += 10000;
  tick();
  assert.match(allText(nextToast), /Saved in Relay/);
  assert.equal(find(nextToast, (item) => item.tag === "button"), undefined);
});
