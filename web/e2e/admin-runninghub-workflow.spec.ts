import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("管理员可以维护 RunningHub 工作流版本和练习绑定", async ({ page }) => {
    const settingsResponse = await page.request.get("/api/admin/settings");
    expect(settingsResponse.ok(), await settingsResponse.text()).toBe(true);
    const current = (await settingsResponse.json()).settings;
    const channel = {
        id: "e2e-runninghub-workflow",
        name: "E2E RunningHub",
        baseUrl: `http://127.0.0.1:${Number(process.env.VOZEB_PRO_RUNNINGHUB_FIXTURE_PORT || 4030)}`,
        apiKey: "e2e-runninghub-key",
        apiFormat: "custom",
        models: ["e2e-runninghub-script"],
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
            supportsReferenceImage: false,
            supportsReferenceVideo: false,
            supportsReferenceAudio: false,
            modelCapabilities: { "e2e-runninghub-script": "text" },
            modelConfigs: {
                "e2e-runninghub-script": {
                    capability: "text",
                    source: "manual",
                    protocol: "runninghub",
                    createPath: "/openapi/v2/task/create",
                    queryPath: "/openapi/v2/task/query/{taskId}",
                    taskIdField: "data.taskId",
                    statusField: "data.status",
                    resultField: "data.result",
                    requestTemplate: '{"workflowId":"{{model}}","prompt":"{{prompt}}"}',
                },
            },
            workflowConfigs: {},
        },
    };
    const channels = [...current.systemChannels.filter((item: { id: string }) => item.id !== channel.id), channel];
    const saved = await page.request.patch("/api/admin/settings", {
        data: { systemChannels: channels, logicalModels: current.logicalModels, defaultModels: current.defaultModels, practiceDefaultModels: current.practiceDefaultModels, practiceWorkflowModels: current.practiceWorkflowModels },
    });
    expect(saved.ok(), await saved.text()).toBe(true);

    const created = await page.request.post("/api/admin/runninghub/workflows", {
        data: {
            channelId: channel.id,
            workflowName: "E2E 脚本工作流",
            businessCode: "script",
            capability: "text",
            workflowId: "workflow-e2e-script",
            createPath: "/openapi/v2/task/create",
            queryPath: "/openapi/v2/task/query/{taskId}",
            taskIdField: "data.taskId",
            statusField: "data.status",
            resultField: "data.result",
            requestTemplate: '{"workflowId":"{{workflowId}}","prompt":"{{prompt}}"}',
            inputSchema: [{ key: "prompt", label: "提示词", type: "text", required: true }],
            nodeMappings: [{ paramKey: "prompt", nodeId: "1", fieldName: "text", valueType: "STRING", source: "INPUT", inputKey: "prompt" }],
            outputMappings: [{ key: "text", label: "文本", assetType: "TEXT", required: true, primary: true }],
        },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const workflow = (await created.json()).data;
    expect(workflow).toMatchObject({ enabled: false, version: 1 });

    await page.goto("/admin?section=channels");
    const runningHubRow = page.locator("tr").filter({ hasText: "E2E RunningHub" });
    await expect(runningHubRow).toHaveCount(1, { timeout: 30_000 });
    await runningHubRow.locator("button").nth(1).click({ timeout: 30_000 });
    await page.getByRole("tab", { name: "工作流" }).click();
    await expect(page.getByText("E2E 脚本工作流", { exact: true }).first()).toBeVisible();
    const workflowActions = page.getByRole("button", { name: "启用", exact: true }).last();
    await expect(page.getByRole("button", { name: "编辑", exact: true }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "复制版本", exact: true }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "测试", exact: true }).last()).toBeVisible();
    await expect(workflowActions).toBeVisible();
    const actionGeometry = await workflowActions.evaluate((element) => {
        const actionRect = element.getBoundingClientRect();
        const rowRect = element.closest("tr")?.getBoundingClientRect();
        return { actionRight: actionRect.right, rowRight: rowRect?.right || 0 };
    });
    expect(actionGeometry.actionRight).toBeGreaterThan(actionGeometry.rowRight - 360);
    await page.getByRole("button", { name: "测试", exact: true }).last().click();
    await expect(page.getByText("独立管理员测试", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    for (const tab of ["基础配置", "平台对接", "参数契约", "节点映射", "出参映射", "测试运行"]) await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    await page.keyboard.press("Escape");

    const copied = await page.request.post(`/api/admin/runninghub/workflows/${workflow.workflowKey}/versions`, { data: { activateVersion: false } });
    expect(copied.ok(), await copied.text()).toBe(true);
    expect((await copied.json()).data).toMatchObject({ enabled: false, version: 2 });
});
