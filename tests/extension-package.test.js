const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");

test("manifest, worker imports, and panel assets exist and JavaScript parses", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  const html = fs.readFileSync(path.join(root, "sidepanel.html"), "utf8");
  const worker = fs.readFileSync(path.join(root, manifest.background.service_worker), "utf8");
  const imports = [...worker.matchAll(/importScripts\(([^)]+)\)/g)]
    .flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]));
  const assets = new Set([
    manifest.background.service_worker, ...imports,
    ...manifest.content_scripts.flatMap((item) => item.js),
    ...manifest.web_accessible_resources.flatMap((item) => item.resources),
    ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1])
  ]);
  for (const asset of assets) {
    assert.ok(fs.existsSync(path.join(root, asset)), `Missing asset: ${asset}`);
    const content = fs.readFileSync(path.join(root, asset), "utf8");
    if (asset.endsWith(".js")) new vm.Script(content, { filename: asset });
    if (asset.endsWith(".json")) JSON.parse(content);
  }
});

test("Memory Center has unique IDs and every literal script element reference exists", () => {
  const html = fs.readFileSync(path.join(root, "sidepanel.html"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "Duplicate element IDs");
  const source = fs.readFileSync(path.join(root, "sidepanel.js"), "utf8");
  for (const [, id] of source.matchAll(/\$\("([^"]+)"\)/g)) {
    assert.ok(ids.includes(id), `Missing Memory Center element: ${id}`);
  }
});
