import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { demoRunningHubWorkflowCatalog } from "./runninghub-demo-workflow-catalog";
import { prepareRunningHubWorkflowExecution } from "./runninghub-workflow-adapter";

let fixture: ChildProcessWithoutNullStreams | undefined;

describe("RunningHub Demo local fixture contract", () => {
    afterEach(() => {
        fixture?.kill();
        fixture = undefined;
    });

    it("accepts all seven workflow ids and records the Demo-shaped request", async () => {
        const port = await freePort();
        fixture = spawn(process.execPath, [resolve(process.cwd(), "scripts/runninghub-workflow-fixture.mjs")], { env: { ...process.env, VOZEB_PRO_RUNNINGHUB_FIXTURE_PORT: String(port) } });
        await waitForFixture(fixture);

        for (const workflow of demoRunningHubWorkflowCatalog()) {
            const execution = prepareRunningHubWorkflowExecution({ config: workflow, businessInput: sampleInput(workflow.workflowCode || ""), references: [] });
            const response = await fetch(`http://127.0.0.1:${port}/task/openapi/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(execution.payload) });
            expect(response.status).toBe(200);
            const body = (await response.json()) as { data?: { taskId?: string } };
            expect(body.data?.taskId).toMatch(/^fixture-task-/);
            const query = await fetch(`http://127.0.0.1:${port}/openapi/v2/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: body.data?.taskId }) });
            expect(query.status).toBe(200);
            const queryBody = (await query.json()) as { data?: { result?: string } };
            if (workflow.capability === "image") expect(queryBody.data?.result).toMatch(/\.png$/);
            if (workflow.capability === "video") expect(queryBody.data?.result).toMatch(/\.mp4$/);
            if (workflow.capability === "audio") expect(queryBody.data?.result).toMatch(/\.mp3$/);
        }

        const upload = await fetch(`http://127.0.0.1:${port}/openapi/v2/media/upload/binary`, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=fixture" }, body: "--fixture\r\nContent-Disposition: form-data; name=\"file\"; filename=reference.png\r\n\r\nfixture\r\n--fixture--\r\n" });
        expect(upload.status).toBe(200);

        const state = (await (await fetch(`http://127.0.0.1:${port}/__state`)).json()) as { tasks?: Array<{ payload?: Record<string, unknown> }> };
        expect(state.tasks).toHaveLength(7);
        expect(state.tasks?.every((task) => Array.isArray(task.payload?.nodeInfoList))).toBe(true);
        expect(state.tasks?.some((task) => task.payload?.workflow)).toBe(true);
        expect((state as { uploads?: string[] }).uploads).toContain("reference.png");
    });

    it("returns a stable failure state and public reason for a rejected node value", async () => {
        const port = await freePort();
        fixture = spawn(process.execPath, [resolve(process.cwd(), "scripts/runninghub-workflow-fixture.mjs")], { env: { ...process.env, VOZEB_PRO_RUNNINGHUB_FIXTURE_PORT: String(port) } });
        await waitForFixture(fixture);
        const created = await fetch(`http://127.0.0.1:${port}/task/openapi/create`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflowId: "2069627147735621634", nodeInfoList: [{ nodeId: "prompt", fieldName: "value", fieldValue: "__FAIL__" }] }) });
        const taskId = ((await created.json()) as { data: { taskId: string } }).data.taskId;
        const queried = await fetch(`http://127.0.0.1:${port}/openapi/v2/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId }) });
        expect(await queried.json()).toMatchObject({ code: 0, data: { status: "FAILED", error: "fixture task rejected" } });
    });
});

function sampleInput(code: string) {
    if (code === "character_multi_view") return { referenceImage: "https://fixture/reference.png", prompt: "角色", width: 1350, height: 2400 };
    if (code === "storyboard_shot") return { prompt: "镜头", width: 1536, height: 864, sceneImage: "https://fixture/scene.png" };
    if (code === "storyboard_shot_video") return { image: "https://fixture/image.png", prompt: "推进", duration: 4, width: 1280, height: 720, audioEnabled: false };
    if (code === "storyboard_dialogue_audio") return { text: "第一句" };
    if (code === "scene_main_view") return { prompt: "场景", outputPreset: "2048 x 1024" };
    return { prompt: code, width: 1024, height: 1024 };
}

function freePort() {
    return new Promise<number>((resolvePort, reject) => {
        const server = createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") return reject(new Error("fixture port unavailable"));
            server.close((error) => (error ? reject(error) : resolvePort(address.port)));
        });
    });
}

function waitForFixture(child: ChildProcessWithoutNullStreams) {
    return new Promise<void>((resolveReady, reject) => {
        let output = "";
        child.stdout.on("data", (chunk) => {
            output += String(chunk);
            if (output.includes("RunningHub fixture listening")) resolveReady();
        });
        child.once("error", reject);
        child.once("exit", (code) => code === 0 ? undefined : reject(new Error(`fixture exited: ${code}`)));
    });
}
