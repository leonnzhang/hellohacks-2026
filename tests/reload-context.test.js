const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  let invalidated = false;
  let urlCalls = 0;
  const events = {};
  const cancelled = [];
  const runtime = {
    get id() {
      if (invalidated) throw new Error("Extension context invalidated.");
      return "test-extension";
    },
    getURL() { urlCalls++; throw new Error("Extension context invalidated."); },
    onMessage: { addListener() {} }
  };
  const context = vm.createContext({
    chrome: { runtime }, location: { hostname: "claude.ai" },
    document: { body: null, addEventListener() {}, createElement() { throw new Error("Must not mount a stale iframe"); } },
    addEventListener(name, callback) { events[name] = callback; },
    clearTimeout: () => cancelled.push("timeout"),
    clearInterval: () => cancelled.push("interval"),
    cancelAnimationFrame: () => cancelled.push("frame")
  });
  const source = fs.readFileSync(path.join(__dirname, "../content.js"), "utf8");
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, "globalThis.testHooks = { extensionReady, openMemoryCenter }; })();"), context);
  return { context, events, cancelled, expire() { invalidated = true; }, urlCalls: () => urlCalls };
}

test("reload invalidation stops background work and does not call getURL", () => {
  const app = setup();
  assert.equal(app.context.testHooks.extensionReady(), true);
  app.expire();
  assert.doesNotThrow(() => app.context.testHooks.openMemoryCenter());
  assert.equal(app.urlCalls(), 0);
  assert.deepEqual(app.cancelled, ["timeout", "interval", "frame"]);
  assert.equal(app.context.testHooks.extensionReady(), false);
  assert.equal(app.cancelled.length, 3, "cleanup runs only once");
});

test("page messages after reload never access invalidated runtime properties", () => {
  const app = setup();
  app.expire();
  assert.doesNotThrow(() => app.events.message({ origin: "https://claude.ai", source: {}, data: {} }));
  assert.doesNotThrow(() => app.events.message({ origin: "chrome-extension://test-extension", source: {}, data: {} }));
});

test("reload racing getURL does not throw or create a broken Memory Center", () => {
  const app = setup();
  assert.doesNotThrow(() => app.context.testHooks.openMemoryCenter());
  assert.equal(app.urlCalls(), 1);
});
