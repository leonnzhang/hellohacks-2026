const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function panelHarness() {
  const elements = new Map();
  const storage = { chats: [], memories: [] };
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: "", textContent: "", options: [],
        classList: { add() {}, remove() {}, toggle() {} },
        replaceChildren(...options) { this.options = options; },
        add(option) { this.options.push(option); }
      });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: element },
    Option: class { constructor(label, value) { this.label = label; this.value = value; } },
    chrome: {
      storage: {
        local: {
          async get(key) {
            const keys = Array.isArray(key) ? key : [key];
            return Object.fromEntries(keys.map((name) => [name, structuredClone(storage[name])]));
          },
          async set(values) { Object.assign(storage, structuredClone(values)); }
        }
      }
    },
    crypto: { randomUUID: (() => { let n = 0; return () => `test-${++n}`; })() },
    setTimeout: () => 1,
    clearTimeout: () => {}
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "sidepanel.js"), "utf8")
    .replace(/init\(\)\.catch\([\s\S]*$/, "");
  vm.runInContext(source, context);
  context.__testTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "prompts", "handoff.json"), "utf8"));
  vm.runInContext("handoffTemplate = globalThis.__testTemplate", context);
  return { context, element, storage };
}

test("Save creates a visible entry; Update edits it; a new draft creates another entry", async () => {
  const { context, element, storage } = panelHarness();
  const state = vm.runInContext("state", context);
  state.draftSource = "ChatGPT";
  state.draftUrl = "https://chatgpt.com/c/test";
  element("chat-title").value = "First chat";
  element("transcript").value = "USER:\nHello";

  assert.equal(await vm.runInContext("saveChat()", context), true);
  assert.equal(storage.chats.length, 1);
  assert.equal(element("chat-count").textContent, "(1)");
  assert.equal(element("chat-select").value, storage.chats[0].id);
  assert.match(element("chat-select").options[1].label, /First chat/);
  assert.equal(element("save-chat-btn").textContent, "Update conversation");
  assert.match(element("prompt-preview").value, /PREVIOUS CONVERSATION/);

  element("transcript").value = "USER:\nHello again";
  assert.equal(await vm.runInContext("saveChat()", context), true);
  assert.equal(storage.chats.length, 1);
  assert.equal(storage.chats[0].transcript, "USER:\nHello again");

  state.selectedChatId = "";
  element("chat-title").value = "Second chat";
  element("transcript").value = "USER:\nNew topic";
  assert.equal(await vm.runInContext("saveChat()", context), true);
  assert.equal(storage.chats.length, 2);
  assert.equal(element("chat-count").textContent, "(2)");
  assert.match(element("chat-select").options[1].label, /Second chat/);
});

test("Capture stays unsaved until Save conversation is clicked", async () => {
  const { context, element, storage } = panelHarness();
  context.chrome.tabs = {
    async query() { return [{ id: 7, url: "https://chatgpt.com/c/demo" }]; },
    async sendMessage() {
      return {
        service: "ChatGPT", url: "https://chatgpt.com/c/demo", title: "Demo chat",
        messages: [{ role: "user", text: "Hello" }], captureMethod: "messages"
      };
    }
  };

  await vm.runInContext("captureCurrentTab()", context);
  assert.equal(storage.chats.length, 0);
  assert.equal(element("chat-select").value, "");
  assert.match(element("save-state").textContent, /Captured draft/);
  assert.equal(element("transcript").value, "USER:\nHello");

  assert.equal(await vm.runInContext("saveChat()", context), true);
  assert.equal(storage.chats.length, 1);
  assert.equal(element("chat-select").value, storage.chats[0].id);
});
