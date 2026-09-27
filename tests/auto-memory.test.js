const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function harness() {
  const storage = { autoMemorySettings: { enabled: false, apiKey: "" }, memories: [], memorySuggestions: [], autoMemoryProcessed: {} };
  let calls = 0;
  let ids = 0;
  let request;
  const chrome = {
    action: { onClicked: { addListener() {} } },
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } },
    contextMenus: { onClicked: { addListener() {} } },
    tabs: { onRemoved: { addListener() {} } },
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
  return { context, storage, getCalls: () => calls, getRequest: () => request };
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

test("automatic extraction sees only the new request from a transferred message", () => {
  const { context } = harness();
  const build = context.RELAY_TRANSFER.buildAugmentedPrompt;
  const combined = build("SAVED MEMORY\n- I have a peanut allergy.", "What should I cook tonight?");
  const prepared = vm.runInContext("prepareMessages", context)([{ role: "user", text: combined }]);
  assert.equal(prepared[0].text, "What should I cook tonight?");
});
