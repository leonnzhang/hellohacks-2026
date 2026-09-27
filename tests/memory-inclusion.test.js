const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "background.js"), "utf8");
function harness(settings = {}, result = {}) {
  let searches = 0;
  const memories = [
    { id: "manual", text: "Use concise answers", scope: "global", origin: "manual" },
    { id: "automatic", text: "I enjoy hiking", scope: "global", origin: "automatic", category: "hobbies_interests" },
    { id: "project", text: "Private project context", scope: "project", origin: "manual" }
  ];
  const context = vm.createContext({
    chrome: { storage: { local: { get: async () => ({ memories, ...settings }) } } },
    supportedChatUrl: () => true,
    RELAY_RAG: { search: async () => { searches++; if (result instanceof Error) throw result; return result; } }
  });
  for (const file of ["memory-policy.js", "transfer-core.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  vm.runInContext(source.slice(source.indexOf("async function retrieveContext"), source.indexOf("function lastUserMessage")), context);
  vm.runInContext(source.slice(source.indexOf("async function coreMemories"), source.indexOf("async function pendingTransfer")), context);
  return { context, memories, searches: () => searches };
}

test("without a key, memory inclusion defaults on and includes every eligible core memory", async () => {
  const app = harness({ ragEnabled: true });
  const result = await app.context.retrieveContext("a question", app.memories);
  assert.deepEqual(Array.from(result.memories, m => m.id), ["manual", "automatic"]);
  assert.equal(app.searches(), 0);
});

test("memory opt-out overrides saved keys, semantic search, and core-memory fallback", async () => {
  const app = harness({ memoryEnabled: false, ragEnabled: true, autoMemorySettings: { apiKey: "key" } });
  const result = await app.context.retrieveContext("a question", app.memories);
  assert.equal(result.memories.length, 0);
  assert.equal(result.relatedConversations.length, 0);
  assert.equal((await app.context.coreMemories({ tab: { url: "https://chatgpt.com/" } })).length, 0);
  assert.equal(app.searches(), 0);
});

test("search failure includes eligible memories, but successful zero matches stays empty", async () => {
  const settings = { ragEnabled: true, autoMemorySettings: { apiKey: "key" } };
  const failed = harness(settings, new Error("offline"));
  const fallback = await failed.context.retrieveContext("a question", failed.memories);
  assert.equal(fallback.memories.length, 2);
  assert.equal(fallback.ragError, "offline");
  const succeeded = harness(settings, { indexedCount: 2, memories: [], excerpts: [] });
  const empty = await succeeded.context.retrieveContext("a question", succeeded.memories);
  assert.equal(empty.memories.length, 0);
  assert.equal(empty.ragUsed, true);
});
