const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function harness(onRequest = () => {}) {
  const storage = { autoMemorySettings: { enabled: false, apiKey: "" }, memories: [], memorySuggestions: [], autoMemoryProcessed: {} };
  let calls = 0;
  let ids = 0;
  let request;
  let onMessage;
  const tabMessages = [];
  const chrome = {
    action: { onClicked: { addListener() {} } },
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener(handler) { onMessage = handler; } } },
    contextMenus: { onClicked: { addListener() {} } },
    tabs: { onRemoved: { addListener() {} }, async sendMessage(id, message) { tabMessages.push({ id, message }); } },
    storage: { local: {
      async get(keys) {
        const names = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(names.map((name) => [name, structuredClone(storage[name])]));
      },
      async set(values) { Object.assign(storage, structuredClone(values)); }
    } }
  };
  const context = vm.createContext({
    importScripts() {},
    chrome, crypto: { subtle: webcrypto.subtle, randomUUID: () => `suggestion-${++ids}` },
    TextEncoder, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (_url, options) => {
      request = JSON.parse(options.body);
      calls++;
      onRequest(storage);
      return { ok: true, async json() { return { output: [{ content: [{ type: "output_text", text: JSON.stringify({
        memories: [
          { text: "The user prefers concise answers.", quote: "I prefer concise answers", category: "answer_style" },
          { text: "The user is a computer science student.", quote: "I am a computer science student", category: "role_background" },
          { text: "The project is a Chrome extension.", quote: "Our project is a Chrome extension", category: "project_fact" },
          { text: "The user lives on Mars.", quote: "You live on Mars", category: "ongoing_goal" },
          { text: "The user is 1234 years old.", quote: "I am 1234 years old", category: "ongoing_goal" },
          { text: "The user owns a car.", quote: "I own a car", category: "miscellaneous" }
        ]
      }) }] }] }; } };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "memory-policy.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "transfer-core.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8"), context);
  return { context, storage, getCalls: () => calls, getRequest: () => request, onMessage: () => onMessage, tabMessages };
}

const sender = { tab: { url: "https://chatgpt.com/c/example" } };
const capture = {
  url: "https://chatgpt.com/c/example", title: "Example",
  messages: [
    { role: "user", text: "I prefer concise answers." },
    { role: "user", text: "I am a computer science student." },
    { role: "user", text: "Our project is a Chrome extension." },
    { role: "user", text: "I am 1234 years old. I own a car." },
    { role: "assistant", text: "You live on Mars." }
  ]
};

test("pausing saving while extraction is in flight prevents new memories being persisted", async () => {
  const { context, storage } = harness((data) => { data.autoMemorySettings.enabled = false; });
  storage.autoMemorySettings = { enabled: true, apiKey: "test-key" };
  const result = await vm.runInContext("processAutoCapture", context)(capture, sender);
  assert.equal(result.status, "disabled");
  assert.equal(storage.memories.length, 0);
  assert.deepEqual(storage.autoMemoryProcessed, {});
});

test("automatic saving requires opt-in, grounds facts in user messages, and skips unchanged chats", async () => {
  const { context, storage, getCalls, getRequest } = harness();
  const run = (value = capture) => vm.runInContext("processAutoCapture", context)(value, sender);
  assert.equal((await run()).status, "disabled");
  assert.equal(getCalls(), 0);

  storage.autoMemorySettings = { enabled: true, apiKey: "test-key" };
  assert.equal((await run()).status, "processed");
  assert.equal(getCalls(), 1);
  assert.equal(getRequest().store, false);
  assert.equal(storage.memories.length, 2);
  assert.equal(storage.memories[0].sourceQuote, "I prefer concise answers");
  assert.equal(storage.memories[0].scope, "global");
  assert.equal(storage.memories[0].category, "answer_style");
  assert.equal(storage.memories[1].category, "role_background");
  assert.match(getRequest().instructions, /answer_style/);
  assert.equal(getRequest().text.format.schema.properties.memories.items.properties.category.enum.length, 7);
  assert.equal((await run()).status, "unchanged");
  assert.equal(getCalls(), 1);

  const changed = { ...capture, messages: [...capture.messages, { role: "user", text: "One more message." }] };
  assert.equal((await run(changed)).status, "processed");
  assert.equal(getCalls(), 2);
  assert.equal(storage.memories.length, 2);
});

test("new core categories are allowed and retired categories are rejected", () => {
  const { context } = harness();
  const validate = vm.runInContext("validSuggestions", context);
  const messages = [
    { role: "user", text: "I enjoy hiking on weekends. I have a peanut allergy. I am learning Rust this year." }
  ];
  const raw = { memories: [
    { text: "The user enjoys hiking.", quote: "I enjoy hiking on weekends", category: "hobbies_interests" },
    { text: "The user has a peanut allergy.", quote: "I have a peanut allergy", category: "health_context" },
    { text: "The user is learning Rust.", quote: "I am learning Rust this year", category: "ongoing_goal" }
  ] };
  assert.deepEqual(Array.from(validate(raw, messages, []), (item) => item.category),
    ["hobbies_interests", "health_context"]);
});

test("undo removes only the newly saved memories from the same chat", async () => {
  const { context, storage } = harness();
  storage.autoMemorySettings = { enabled: true, apiKey: "test-key" };
  const saved = await vm.runInContext("processAutoCapture", context)(capture, sender);
  assert.equal(saved.saved.length, 2);
  storage.memories.push({ id: "manual", text: "Keep me", scope: "global", origin: "manual" });
  const undo = vm.runInContext("undoAutoMemories", context);
  assert.equal((await undo(saved.saved.map((item) => item.id),
    { tab: { url: "https://claude.ai/new" } })).ok, false);
  assert.equal(storage.memories.length, 3);
  const result = await undo(saved.saved.map((item) => item.id), sender);
  assert.equal(result.ok, true);
  assert.equal(result.removed, 2);
  assert.deepEqual(storage.memories.map((item) => item.id), ["manual"]);
});

test("a successful auto-save notifies its chat so Undo can appear", async () => {
  const { storage, onMessage, tabMessages } = harness();
  storage.autoMemorySettings = { enabled: true, apiKey: "test-key" };
  const response = await new Promise((resolve) => {
    onMessage()({ type: "AUTO_MEMORY_CAPTURE", capture }, { tab: { id: 42, url: sender.tab.url } }, resolve);
  });
  assert.equal(response.saved.length, 2);
  assert.equal(tabMessages.length, 1);
  assert.equal(tabMessages[0].id, 42);
  assert.equal(tabMessages[0].message.type, "AUTO_MEMORY_SAVED");
  assert.deepEqual(Array.from(tabMessages[0].message.saved, (item) => item.id),
    Array.from(response.saved, (item) => item.id));
  assert.equal(tabMessages[0].message.saved[0].quote, "I prefer concise answers");
  assert.equal(tabMessages[0].message.saved[0].reason,
    "Changes how future answers should be written.");
});

test("repeating an already saved preferred name gives feedback without another save", async () => {
  const { context, storage, getCalls, onMessage, tabMessages } = harness();
  storage.autoMemorySettings = { enabled: true, apiKey: "test-key" };
  storage.memories = [{ id: "nova", text: "The user prefers to be called Nova.",
    category: "preferred_name", sourceQuote: "please call me Nova", origin: "automatic" }];
  const repeated = { ...capture, messages: [
    { role: "user", text: "For future chats, please call me Nova." },
    { role: "assistant", text: "Got it." }
  ] };
  const response = await new Promise((resolve) => {
    onMessage()({ type: "AUTO_MEMORY_CAPTURE", capture: repeated },
      { tab: { id: 42, url: sender.tab.url } }, resolve);
  });
  assert.equal(response.status, "already_saved");
  assert.equal(getCalls(), 0);
  assert.equal(storage.memories.length, 1);
  assert.equal(tabMessages[0].message.type, "AUTO_MEMORY_ALREADY_SAVED");
});

test("UI deletion is verified in storage and records when it happened", async () => {
  const { context, storage, onMessage } = harness();
  storage.memories = [{ id: "nova", text: "Call the user Nova", category: "preferred_name",
    sourceUrl: "https://chatgpt.com/c/example", sourceQuote: "call me Nova" }];
  const result = await new Promise((resolve) => {
    onMessage()({ type: "DELETE_MEMORY", id: "nova" }, {}, resolve);
  });
  assert.equal(result.ok, true);
  assert.equal(storage.memories.length, 0);
  assert.ok(storage.memoryDeletionEpoch["https://chatgpt.com/c/example"]);
  assert.equal(result.memories.length, 0);
});

test("automatic extraction sees only the new request from a transferred message", () => {
  const { context } = harness();
  const build = context.RELAY_TRANSFER.buildAugmentedPrompt;
  const combined = build("SAVED MEMORY\n- I have a peanut allergy.", "What should I cook tonight?");
  const prepared = vm.runInContext("prepareMessages", context)([{ role: "user", text: combined }]);
  assert.equal(prepared[0].text, "What should I cook tonight?");
});
