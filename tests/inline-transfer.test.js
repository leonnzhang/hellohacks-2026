const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("inline transfer opens an editable draft with only active core memories", async () => {
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "prompts", "handoff.json"), "utf8"));
  const stored = { memories: [
    { text: "I have a peanut allergy.", scope: "global", origin: "automatic", category: "health_context" },
    { text: "I enjoy hiking.", scope: "global", origin: "automatic", category: "hobbies_interests" },
    { text: "I am learning Rust this year.", scope: "global", origin: "automatic", category: "ongoing_goal" }
  ] };
  let openedUrl = "";
  let filledPrompt = "";
  const chrome = {
    action: { onClicked: { addListener() {} } },
    runtime: {
      getURL: (file) => `chrome-extension://test/${file}`,
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} }
    },
    contextMenus: { onClicked: { addListener() {} } },
    storage: { local: { async get() { return structuredClone(stored); } } },
    tabs: {
      async create({ url }) { openedUrl = url; return { id: 8 }; },
      async sendMessage(_id, message) { filledPrompt = message.text; return { ok: true }; }
    }
  };
  const context = vm.createContext({
    chrome, importScripts() {}, URL, setTimeout: (callback) => { callback(); return 1; }, clearTimeout() {},
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
  const result = await transfer({ destination: "Claude", capture }, sender);
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.equal(openedUrl, "https://claude.ai/new");
  assert.match(filledPrompt, /I have a peanut allergy/);
  assert.match(filledPrompt, /I enjoy hiking/);
  assert.doesNotMatch(filledPrompt, /learning Rust/);
  assert.match(filledPrompt, /USER:\nHelp me plan the next step/);
  assert.doesNotMatch(filledPrompt, /MY NEXT REQUEST|Add your next request/);
  assert.match(filledPrompt, /wait for my next request/i);

  const sameService = await transfer({ destination: "ChatGPT", capture }, sender);
  assert.equal(sameService.ok, true);
  assert.equal(openedUrl, "https://chatgpt.com/");
  assert.match(filledPrompt, /USER:\nHelp me plan the next step/);
});
