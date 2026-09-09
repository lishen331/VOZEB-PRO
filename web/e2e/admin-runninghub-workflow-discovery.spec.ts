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
    const referenceKey = discovery.suggestedInputs.find((item: { type?: string }) => item.type === "image")?.key;
    expect(referenceKey).toBeTruthy();
    const submitted = await page.request.post(`/api/admin/runninghub/workflows/${workflow.workflowKey}/test`, {
        multipart: {
            input: JSON.stringify({ prompt: "测试视频" }),
            references: "[]",
            fileKeys: JSON.stringify([referenceKey]),
            file: { name: "reference.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") },
        },
    });
    expect(submitted.ok(), await submitted.text()).toBe(true);
    const run = (await submitted.json()).data;
    const inspected = await page.request.get(`/api/admin/runninghub/workflows/${workflow.workflowKey}/test/${run.runId}`);
    expect(inspected.ok(), await inspected.text()).toBe(true);
    expect((await inspected.json()).data).toMatchObject({ status: "success", taskId: run.taskId, workflowId: discovery.workflowId, configFingerprint: expect.any(String) });
    const fixtureState = (await (await page.request.get(`http://127.0.0.1:${fixturePort}/__state`)).json()) as { tasks: Array<{ payload?: { nodeInfoList?: Array<{ fieldValue?: string }> } }>; uploads: string[] };
    expect(fixtureState.uploads).toContain("reference.png");
    expect(fixtureState.tasks.at(-1)?.payload?.nodeInfoList).toEqual(expect.arrayContaining([expect.objectContaining({ fieldValue: "api/fixture/uploaded-media.png" })]));

    const enabled = await page.request.put(`/api/admin/runninghub/workflows/${workflow.workflowKey}`, { data: { enabled: true } });
    expect(enabled.ok(), await enabled.text()).toBe(true);
    expect((await enabled.json()).data).toMatchObject({ enabled: true, requiresRetest: false });

    // 启用只改变工作流本身：不生成伪模型、逻辑模型绑定或练习模型绑定
    const routedSettings = (await (await page.request.get("/api/admin/settings")).json()).settings;
    const savedChannel = routedSettings.systemChannels.find((item: { id: string }) => item.id === channel.id);
    expect(savedChannel?.models).toEqual([]);
    expect(savedChannel?.purpose).toBe("open-source-practice");
    expect(savedChannel?.advancedConfig?.workflowConfigs?.[workflow.workflowKey]).toMatchObject({ enabled: true, workflowId: discovery.workflowId });
    expect(routedSettings.practiceWorkflowModels).toEqual({});
    expect(routedSettings.logicalModels.some((model: { bindings: Array<{ channelId: string }> }) => model.bindings.some((binding) => binding.channelId === channel.id))).toBe(false);
    const listed = await page.request.get(`/api/admin/runninghub/workflows?channelId=${channel.id}&status=enabled`);
    expect(listed.ok(), await listed.text()).toBe(true);
    expect((await listed.json()).data.items).toContainEqual(expect.objectContaining({ workflowKey: workflow.workflowKey, enabled: true, requiresRetest: false }));

    // 配置一旦变化，旧的测试证据失效，必须重新测试后才能再次启用
    const disabled = await page.request.put(`/api/admin/runninghub/workflows/${workflow.workflowKey}`, { data: { enabled: false } });
    expect(disabled.ok(), await disabled.text()).toBe(true);
    const edited = await page.request.put(`/api/admin/runninghub/workflows/${workflow.workflowKey}`, { data: { remark: "changed after test" } });
    expect(edited.ok(), await edited.text()).toBe(true);
    expect((await edited.json()).data).toMatchObject({ enabled: false, requiresRetest: true });
    const blocked = await page.request.put(`/api/admin/runninghub/workflows/${workflow.workflowKey}`, { data: { enabled: true } });
    expect(blocked.status()).toBe(409);
});
