import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const root = process.argv[2];
const base = "http://127.0.0.1:3217";
const session = JSON.parse(await readFile(join(root, "session.json"), "utf8"));
const evidence = JSON.parse(await readFile(join(root, "http-evidence.json"), "utf8"));
async function call(path, method = "GET", body) {
    const r = await fetch(base + path, { method, headers: { cookie: session.cookie, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, payload: await r.json() };
}
async function save(body) {
    const fresh = await call("/api/admin/settings");
    return call("/api/admin/settings", "PATCH", { settingsRevision: fresh.payload.settingsRevision, ...body });
}
async function poll(test) {
    const end = Date.now() + 180000;
    while (test.status === "running" && Date.now() < end) {
        await new Promise((r) => setTimeout(r, 1000));
        const r = await call(`/api/admin/binding-verifications/${test.id}`);
        assert.equal(r.status, 200);
        test = r.payload.test;
        console.log("POLL", test.id, test.status, test.error || "");
    }
    return test;
}
for (const cap of ["text", "image", "video"]) assert.equal(evidence.find((e) => e.case === cap)?.test.status, "passed");
let current = (await call("/api/admin/settings")).payload.settings;
assert.ok(
    current.logicalModels.every((m) => m.bindings.every((b) => !b.enabled)),
    "test runner must not enable shared configuration",
);
let result = await save({ logicalModels: current.logicalModels.map((m) => ({ ...m, bindings: m.bindings.map((b) => ({ ...b, enabled: true })) })) });
console.log("ENABLE_AFTER_PASS", result.status, result.payload.error || "");
assert.equal(result.status, 200);
evidence.push({ case: "enable all exact passed bindings", status: result.status });
current = (await call("/api/admin/settings")).payload.settings;
let altered = current.systemChannels.map((c) => (c.id === "channel-text" ? { ...c, baseUrl: c.baseUrl + "/changed" } : c));
result = await save({ systemChannels: altered });
console.log("CHANGED_ENABLED_CONFIG", result.status, result.payload.error || "");
assert.equal(result.status, 400);
evidence.push({ case: "changed enabled configuration cannot reuse proof", status: result.status, error: result.payload.error });
const brokenChannels = current.systemChannels.map((c) =>
    c.id === "channel-video"
        ? {
              ...c,
              advancedConfig: {
                  ...c.advancedConfig,
                  modelConfigs: { ...c.advancedConfig.modelConfigs, "mock-video": { ...c.advancedConfig.modelConfigs["mock-video"], requestTemplate: '{"model":"{{model}}","prompt":"{{prompt}}","image":"{{image}}","seconds":5,"resolution":"480p"}' } },
              },
          }
        : c,
);
const disabledModels = current.logicalModels.map((m) => (m.id === "fixture-video" ? { ...m, bindings: m.bindings.map((b) => ({ ...b, enabled: false })) } : m));
result = await save({ systemChannels: brokenChannels, logicalModels: disabledModels });
assert.equal(result.status, 200, JSON.stringify(result.payload));
const before = await (await fetch("http://127.0.0.1:3218/__state")).json();
const count = (s) => s.requests.filter((r) => r.method === "POST" && r.path.endsWith("/videos")).length;
const started = await call("/api/admin/binding-verifications", "POST", { logicalModelId: "fixture-video", bindingId: "binding-video" });
assert.equal(started.status, 202);
const duplicates = await Promise.all([
    call("/api/admin/binding-verifications", "POST", { logicalModelId: "fixture-video", bindingId: "binding-video" }),
    call("/api/admin/binding-verifications", "POST", { logicalModelId: "fixture-video", bindingId: "binding-video" }),
]);
for (const r of duplicates) assert.equal(r.payload.test.id, started.payload.test.id);
evidence.push({ case: "concurrent POST reuses in-flight run", id: started.payload.test.id });
const broken = await poll(started.payload.test);
assert.equal(broken.status, "failed");
assert.match(broken.error, /参考图/);
const after = await (await fetch("http://127.0.0.1:3218/__state")).json();
assert.equal(count(after), count(before), "dropped references must be blocked before provider request");
evidence.push({ case: "adapter dropped reference images rejected before upstream", test: broken, providerCreateCountBefore: count(before), providerCreateCountAfter: count(after) });
current = (await call("/api/admin/settings")).payload.settings;
result = await save({ logicalModels: current.logicalModels.map((m) => ({ ...m, bindings: m.bindings.map((b) => ({ ...b, enabled: true })) })) });
assert.equal(result.status, 400);
evidence.push({ case: "failed changed binding cannot enable", status: result.status, error: result.payload.error });
await writeFile(join(root, "http-evidence.json"), JSON.stringify(evidence, null, 2));
console.log("HTTP ASSERTIONS PASSED", evidence.length);
