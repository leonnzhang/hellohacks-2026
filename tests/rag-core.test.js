const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("saved text is split into bounded chunks with overlap", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "rag-core.js"), "utf8"), context);
  const first = "A".repeat(900);
  const second = "B".repeat(900);
  const chunks = context.RELAY_RAG.splitText(`${first} ${second}`);
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 1100));
  assert.ok(chunks[1].startsWith("A".repeat(160)));
  assert.equal(chunks[0] + chunks[1].slice(160), `${first} ${second}`);
});

test("empty and whitespace-only sources produce no chunks", () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "rag-core.js"), "utf8"), context);
  assert.deepEqual(Array.from(context.RELAY_RAG.splitText("  \n\n ")), []);
});
