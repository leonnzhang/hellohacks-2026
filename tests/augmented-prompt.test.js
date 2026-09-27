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
