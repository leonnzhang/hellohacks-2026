const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("reviewed send keeps context separate from the current request", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "transfer-core.js"), "utf8"), context);
  const build = context.RELAY_TRANSFER.buildAugmentedPrompt;
  const combined = build("Saved context", "What should I do next?");
  assert.equal(combined,
    "[Relay transfer context — start]\nSaved context\n[Relay transfer context — end]\n\nCURRENT REQUEST\nWhat should I do next?");
  assert.equal(context.RELAY_TRANSFER.stripAugmentedPrompt(combined), "What should I do next?");
  assert.equal(context.RELAY_TRANSFER.formatTranscript([{ role: "user", text: combined }]),
    "USER:\nWhat should I do next?");
  assert.equal(build("", "What should I do next?"), "What should I do next?");
  assert.equal(build("Saved context", "  "), "");
});

test("core memories and transfer context can be selected independently", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "memory-policy.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "transfer-core.js"), "utf8"), context);
  const core = context.RELAY_TRANSFER;
  const memories = Array.from({ length: 9 }, (_, index) => ({ text: `Memory ${index}`, scope: "global", origin: "manual" }));
  assert.equal(core.pickMemories(memories).length, 7);
  const selected = core.pickMemories(memories);
  const memoryOnly = core.buildSendPrompt({ memories: selected }, "Next request");
  assert.match(memoryOnly, /Relay core memories/);
  assert.doesNotMatch(memoryOnly, /Relay transfer context/);
  assert.doesNotMatch(memoryOnly, /Memory 7/);
  assert.equal(core.stripAugmentedPrompt(memoryOnly), "Next request");
  const transferOnly = core.buildSendPrompt({ transfer: "Earlier conversation" }, "Next request");
  assert.match(transferOnly, /Relay transfer context/);
  assert.doesNotMatch(transferOnly, /Relay core memories/);
  const both = core.buildSendPrompt({ memories: selected, transfer: "Earlier conversation" }, "Next request");
  assert.equal(core.stripAugmentedPrompt(both), "Next request");
});
