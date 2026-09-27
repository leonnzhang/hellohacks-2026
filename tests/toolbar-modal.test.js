const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup(firstMessageFails = false) {
  let onClick;
  let injected = false;
  const messages = [];
  const chrome = {
    action: { onClicked: { addListener(callback) { onClick = callback; } } },
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } },
    contextMenus: { onClicked: { addListener() {} } },
    tabs: { onRemoved: { addListener() {} }, async sendMessage(id, message) {
      if (firstMessageFails && !injected) throw new Error("No content script");
      messages.push({ id, message });
      return { ok: true };
    } },
    scripting: { async executeScript() { injected = true; } }
  };
  const context = vm.createContext({ chrome, importScripts() {}, URL, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8"), context);
  return { click: (tab) => onClick(tab), messages, wasInjected: () => injected };
}

test("toolbar opens Memory Center in a supported chat tab", async () => {
  const app = setup();
  await app.click({ id: 7, url: "https://chatgpt.com/c/example" });
  assert.equal(app.messages.length, 1);
  assert.equal(app.messages[0].id, 7);
  assert.equal(app.messages[0].message.type, "TOGGLE_MEMORY_CENTER");
  await app.click({ id: 8, url: "https://example.com/" });
  assert.equal(app.messages.length, 1);
});

test("toolbar injects the content script when a chat tab predates extension loading", async () => {
  const app = setup(true);
  await app.click({ id: 9, url: "https://claude.ai/chat/example" });
  assert.equal(app.wasInjected(), true);
  assert.equal(app.messages[0].message.type, "TOGGLE_MEMORY_CENTER");
});
