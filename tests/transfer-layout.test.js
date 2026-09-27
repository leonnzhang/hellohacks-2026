const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../content.js"), "utf8");
const suggestions = source.slice(source.indexOf("  function destinationSuggestions"), source.indexOf("  let trackedComposer"));
const positioning = source.slice(source.indexOf("  function positionTransferControl"), source.indexOf("  function trackComposerPosition"));

test("footer counts captured messages and distinguishes text transfer from file attachments", () => {
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf("  function transferSummary"), source.indexOf("  function destinationSuggestions")), context);
  const result = { captureMethod: "messages", messages: [
    { role: "user", text: "Discuss report.pdf" }, { role: "assistant", text: "Here is an outline." },
    { role: "user", text: " " }, { role: "context", text: "Other page content" }
  ] };
  const summary = context.transferSummary(result, 1);
  assert.equal(summary.captured, "2 messages captured");
  assert.equal(summary.attachments, undefined);
  assert.equal(summary.memories, "1 core memory");
  assert.equal(context.transferSummary(result, 0).memories, "0 core memories");
  assert.equal(context.transferSummary(result, null).memories, "Core memories unavailable");
  assert.equal(context.transferSummary({ ...result, captureMethod: "page text" }, 2).captured, "Messages unavailable");
  assert.match(context.transferSummary({ captureMethod: "messages", messages: [{ role: "user", text: "a".repeat(12001) }] }, 2).captured, /trimmed/);
});

test("destinations exclude the source and rank relevant suggestions first", () => {
  for (const service of ["ChatGPT", "Claude", "Gemini"]) {
    const context = vm.createContext({ service });
    vm.runInContext(suggestions, context);
    const rows = context.destinationSuggestions([{ role: "user", text: "Research sources for my essay" }]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.name !== service));
    if (service !== "Gemini") assert.equal(rows[0].name, "Gemini");
    assert.ok(context.destinationSuggestions([]).every((row) => !row.recommended));
  }
});

test("button tracks composer movement and keeps the upward menu within viewport", () => {
  let rect = { top: 600, bottom: 700, left: 200, right: 1000 };
  const context = vm.createContext({
    window: {}, innerWidth: 1200, innerHeight: 800,
    transferHost: { style: {} }, transferPanel: { style: {} },
    transferButton: { getBoundingClientRect: () => ({ width: 110 }) },
    trackedComposer: { isConnected: true, getClientRects: () => [rect] },
    trackedAnchor: { isConnected: true, getBoundingClientRect: () => rect }
  });
  vm.runInContext(positioning, context);
  context.positionTransferControl();
  assert.equal(context.transferHost.style.left, "890px");
  rect = { ...rect, right: 850 };
  context.positionTransferControl();
  assert.equal(context.transferHost.style.left, "740px");
  context.window.visualViewport = { offsetLeft: 0, offsetTop: 0, width: 320, height: 500 };
  rect = { top: 250, bottom: 350, left: 8, right: 312 };
  context.positionTransferControl();
  assert.equal(context.transferHost.style.left, "202px");
  assert.equal(context.transferPanel.style.width, "304px");
  assert.equal(context.transferPanel.style.left, "-194px");
  assert.equal(context.transferPanel.style.maxHeight, "185px");
  assert.equal(Number.parseFloat(context.transferHost.style.top) + 38, rect.top - 10);
  rect = { ...rect, top: 30 };
  context.positionTransferControl();
  assert.equal(context.transferHost.hidden, true, "never overlap a composer near the viewport top");
  context.trackedComposer.isConnected = false;
  context.positionTransferControl();
  assert.equal(context.transferHost.hidden, true);
});

test("Claude anchors to its outer composer surface, not the nested text input", () => {
  const anchorSource = source.slice(source.indexOf("  function composerAnchor"), source.indexOf("  function destinationSuggestions"));
  const body = {};
  const outer = {
    parentElement: body,
    getBoundingClientRect: () => ({ top: 400, width: 700, height: 200 }),
    style: { borderTopLeftRadius: "24px", borderTopWidth: "1px", backgroundColor: "rgb(255, 255, 255)" }
  };
  const inner = {
    parentElement: outer,
    getBoundingClientRect: () => ({ top: 450, width: 650, height: 80 }),
    style: { borderTopLeftRadius: "0px", borderTopWidth: "0px", backgroundColor: "transparent" }
  };
  const composer = {
    parentElement: inner,
    getBoundingClientRect: inner.getBoundingClientRect,
    closest: () => inner
  };
  const context = vm.createContext({ service: "Claude", innerWidth: 1200, innerHeight: 800,
    document: { body, documentElement: {} }, getComputedStyle: (node) => node.style });
  vm.runInContext(anchorSource, context);
  assert.equal(context.composerAnchor(composer), outer);
});
