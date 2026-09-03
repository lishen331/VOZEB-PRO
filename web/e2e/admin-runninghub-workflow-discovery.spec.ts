import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("管理员可读取 RunningHub 工作流、测试并在当前指纹成功后启用", async ({ page }) => {
    const settingsResponse = await page.request.get("/api/admin/settings");
    expect(settingsResponse.ok(), await settingsResponse.text()).toBe(true);
    const current = (await settingsResponse.json()).settings;
    const fixturePort = Number(process.env.VOZEB_PRO_RUNNINGHUB_FIXTURE_PORT || 4030);
    const channel = {
        id: "e2e-runninghub-discovery",
        name: "E2E RunningHub Discovery",
        baseUrl: `http://127.0.0.1:${fixturePort}`,
        apiKey: "e2e-discovery-key",
        apiFormat: "custom",
        models: [],
        enabled: true,
        purpose: "open-source-practice",
        advancedConfig: {
            protocol: "runninghub",
            textModel: "",
            imageModel: "",
            videoModel: "",
            createPath: "",
            queryPath: "",
            requestTemplate: "",
            resultField: "",
            statusField: "",
            durationRange: "",
            referenceRule: "",
            supportsReferenceImage: true,
            supportsReferenceVideo: false,
            supportsReferenceAudio: false,
            workflowConfigs: {},
        },
    };
    const saved = await page.request.patch("/api/admin/settings", {
        data: {
            systemChannels: [...current.systemChannels.filter((item: { id: string }) => item.id !== channel.id), channel],
            logicalModels: current.logicalModels,
            defaultModels: current.defaultModels,
            practiceDefaultModels: current.practiceDefaultModels,
            practiceWorkflowModels: current.practiceWorkflowModels,
        },
    });
    expect(saved.ok(), await saved.text()).toBe(true);

    const discovered = await page.request.post("/api/admin/runninghub/workflows/discover", { data: { channelId: channel.id, workflowIdOrUrl: "https://www.runninghub.cn/workflow/2090436199843454978", capability: "video" } });
    expect(discovered.ok(), await discovered.text()).toBe(true);
    const discovery = (await discovered.json()).data;
    expect(discovery.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: "138", role: "prompt" }), expect.objectContaining({ nodeId: "147", role: "image" }), expect.objectContaining({ nodeId: "92", role: "output" })]));

    const created = await page.request.post("/api/admin/runninghub/workflows", {
        data: {
            channelId: channel.id,
            workflowName: "E2E 自动发现视频",
            businessCode: "storyboard-video",
            capability: "video",
            workflowId: discovery.workflowId,
            workflowJsonFingerprint: discovery.workflowJsonFingerprint,
            inputSchema: discovery.suggestedInputs,
            nodeMappings: discovery.suggestedNodeMappings,
            outputMappings: discovery.suggestedOutputs,
        },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const workflow = (await created.json()).data;
    const submitted = await page.request.post(`/api/admin/runninghub/workflows/${workflow.workflowKey}/test`, { data: { input: { prompt: "测试视频" }, references: [{ type: "image", url: "https://fixture.invalid/reference.png" }] } });
    expect(submitted.ok(), await submitted.text()).toBe(true);
    const run = (await submitted.json()).data;
    const inspected = await page.request.get(`/api/admin/runninghub/workflows/${workflow.workflowKey}/test/${run.runId}`);
    expect(inspected.ok(), await inspected.text()).toBe(true);
    expect((await inspected.json()).data).toMatchObject({ status: "success", taskId: run.taskId, workflowId: discovery.workflowId, configFingerprint: expect.any(String) });

    const enabled = await page.request.put(`/api/admin/runninghub/workflows/${workflow.workflowKey}`, { data: { enabled: true } });
    expect(enabled.ok(), await enabled.text()).toBe(true);
    expect((await enabled.json()).data).toMatchObject({ enabled: true, requiresRetest: false });
});
