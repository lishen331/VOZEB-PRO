import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const root = process.argv[2];
if (!root) throw new Error("Pass isolated fixture directory");
const base = "http://127.0.0.1:3217";
const session = JSON.parse(await readFile(join(root, "session.json"), "utf8"));
const evidence = [];
async function call(path, method = "GET", body) {
    const response = await fetch(base + path, { method, headers: { cookie: session.cookie, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    let payload;
    try {
        payload = JSON.parse(text);
    } catch {
        payload = { error: text.slice(0, 400) };
    }
    return { status: response.status, payload };
}
const specs = ["text", "image", "video"];
const models = specs.map((capability) => ({
    id: `fixture-${capability}`,
    name: `Fixture ${capability}`,
    capability,
    enabled: true,
    bindings: [
        {
            id: `binding-${capability}`,
            channelId: `channel-${capability}`,
            upstreamModel: `mock-${capability}`,
            enabled: false,
            priority: 1,
            capabilityProfile: {
                supportsImageInput: capability === "text",
                supportsReferenceImage: capability !== "text",
                maxReferenceImages: capability === "video" ? 3 : 1,
                ...(capability === "video" ? { resolutions: ["480p"], durationSeconds: [5] } : {}),
            },
        },
    ],
}));
const channels = specs.map((capability) => {
    const operation = {
        capability,
        protocol: "compatible",
        createPath: capability === "text" ? "/chat/completions" : capability === "image" ? "/images/generations" : "/videos",
        editPath: capability === "image" ? "/images/edits" : "",
        imageToVideoPath: capability === "video" ? "/videos" : "",
        queryPath: capability === "video" ? "/videos/:task_id" : "",
        supportsImageInput: capability === "text",
        supportsReferenceImage: capability !== "text",
        requestTemplate: capability === "video" ? '{{"model":"{{model}}","prompt":"{{prompt}}"}}' : "",
    };
    if (capability === "video") operation.requestTemplate = '{"model":"{{model}}","prompt":"{{prompt}}","images":"{{images}}","seconds":"{{seconds}}","resolution":"{{resolution}}"}';
    return {
        id: `channel-${capability}`,
        name: `Fixture ${capability}`,
        enabled: true,
        apiFormat: "openai",
        baseUrl: "http://127.0.0.1:3218/v1",
        apiKey: "fixture-only-not-real",
        models: [`mock-${capability}`],
        advancedConfig: {
            protocol: "compatible",
            authMode: "bearer",
            textModel: "",
            imageModel: "",
            videoModel: "",
            createPath: operation.createPath,
            queryPath: operation.queryPath,
            requestTemplate: operation.requestTemplate,
            resultField: capability === "video" ? "video_url / metadata.url" : "",
            statusField: "status",
            durationRange: capability === "video" ? "5" : "",
            referenceRule: "",
            supportsReferenceImage: capability !== "text",
            supportsReferenceVideo: false,
            supportsReferenceAudio: false,
            modelConfigs: { [`mock-${capability}`]: operation },
        },
    };
});
const current = await call("/api/admin/settings");
const saved = await call("/api/admin/settings", "PATCH", { systemChannels: channels, logicalModels: models, settingsRevision: current.payload.settingsRevision });
console.log("SAVE", saved.status, saved.payload.error || "");
assert.equal(saved.status, 200, JSON.stringify(saved.payload));
const denied = await call("/api/ai/system/channel-text/chat/completions", "POST", { model: "mock-text", messages: [{ role: "user", content: "disabled must deny" }] });
console.log("DISABLED_PROXY", denied.status);
assert.equal(denied.status, 403);
evidence.push({ case: "ordinary proxy denies disabled", status: denied.status });
for (const capability of specs) {
    const start = await call("/api/admin/binding-verifications", "POST", { logicalModelId: `fixture-${capability}`, bindingId: `binding-${capability}` });
    console.log("START", capability, start.status, start.payload.error || start.payload.test?.id);
    assert.equal(start.status, 202, JSON.stringify(start.payload));
    let test = start.payload.test;
    const end = Date.now() + 180000;
    while (test.status === "running" && Date.now() < end) {
        await new Promise((r) => setTimeout(r, 1000));
        const response = await call(`/api/admin/binding-verifications/${test.id}`);
        assert.equal(response.status, 200, JSON.stringify(response.payload));
        test = response.payload.test;
        console.log("POLL", capability, test.status, test.phase, test.error || "");
    }
    evidence.push({ case: capability, test });
    await writeFile(join(root, "http-evidence.json"), JSON.stringify(evidence, null, 2));
    if (test.status !== "passed") {
        console.log(JSON.stringify(test, null, 2));
        break;
    }
}
