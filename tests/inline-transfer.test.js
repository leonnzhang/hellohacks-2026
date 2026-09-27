const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("inline transfer opens a blank chat and arms a reviewed first send", async () => {
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "prompts", "handoff.json"), "utf8"));
  const stored = { memories: [
    { text: "I have a peanut allergy.", scope: "global", origin: "automatic", category: "health_context" },
    { text: "I enjoy hiking.", scope: "global", origin: "automatic", category: "hobbies_interests" },
    { text: "I am learning Rust this year.", scope: "global", origin: "automatic", category: "ongoing_goal" }
  ] };
  let openedUrl = "";
  const session = {};
  const chrome = {
    action: { onClicked: { addListener() {} } },
    runtime: {
      getURL: (file) => `chrome-extension://test/${file}`,
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} }
    },
    contextMenus: { onClicked: { addListener() {} } },
    storage: {
      local: { async get() { return structuredClone(stored); } },
      session: {
        async get(key) { return { [key]: session[key] }; },
        async set(values) { Object.assign(session, structuredClone(values)); },
        async remove(key) { delete session[key]; }
      }
    },
    tabs: {
      onRemoved: { addListener() {} },
      async create({ url }) { openedUrl = url; return { id: 8 }; },
      async update() {}
    }
  };
  const context = vm.createContext({
    chrome, crypto: { randomUUID: () => "transfer-1" }, importScripts() {}, URL,
    setTimeout: (callback) => { callback(); return 1; }, clearTimeout() {},
    fetch: async () => ({ ok: true, async json() { return template; } })
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "memory-policy.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "transfer-core.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8"), context);
  const transfer = vm.runInContext("processInlineTransfer", context);
  const sender = { tab: { url: "https://chatgpt.com/c/source" } };
  const capture = {
    url: sender.tab.url, captureMethod: "messages",
    messages: [
      { role: "user", text: "Help me plan the next step." },
      { role: "assistant", text: "Let's make a short plan." }
    ]
  };
  const blocked = await transfer({ destination: "Claude", capture }, sender);
  assert.equal(blocked.code, "API_KEY_REQUIRED");
  assert.equal(openedUrl, "");
  assert.equal(Object.keys(session).length, 0);
  stored.autoMemorySettings = { apiKey: "test-key", enabled: false };
  const result = await transfer({ destination: "Claude", capture }, sender);
  assert.equal(result.ok, true);
  assert.equal(result.count, 0);
  assert.equal(openedUrl, "https://claude.ai/new");
  const armed = session["pendingTransfer:8"];
  assert.doesNotMatch(armed.prompt, /I have a peanut allergy/);
  assert.doesNotMatch(armed.prompt, /I enjoy hiking/);
  assert.doesNotMatch(armed.prompt, /learning Rust/);
  assert.match(armed.prompt, /USER:\nHelp me plan the next step/);
  assert.doesNotMatch(armed.prompt, /MY NEXT REQUEST|Add your next request/);
  const destinationSender = { tab: { id: 8, url: "https://claude.ai/new" } };
  assert.equal((await vm.runInContext("pendingTransfer", context)(destinationSender)).id, "transfer-1");
  assert.equal(await vm.runInContext("pendingTransfer", context)({ tab: { id: 8, url: "https://chatgpt.com/" } }), null);
  assert.equal((await vm.runInContext("completePendingTransfer", context)("transfer-1", destinationSender)).ok, true);
  assert.equal(await vm.runInContext("pendingTransfer", context)(destinationSender), null);

  const sameService = await transfer({ destination: "ChatGPT", capture }, sender);
  assert.equal(sameService.ok, true);
  assert.equal(openedUrl, "https://chatgpt.com/");
  assert.match(session["pendingTransfer:8"].prompt, /USER:\nHelp me plan the next step/);
});
