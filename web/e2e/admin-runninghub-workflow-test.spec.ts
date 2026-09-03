import { expect, test } from "@playwright/test";

test("管理员测试运行只创建独立 origin 任务", async ({ page }) => {
    const list = await page.request.get("/api/admin/runninghub/workflows?search=E2E%20%E8%84%9A%E6%9C%AC%E5%B7%A5%E4%BD%9C%E6%B5%81&pageSize=10");
    expect(list.ok(), await list.text()).toBe(true);
    const workflow = (await list.json()).data.items[0];
    test.skip(!workflow, "需要先运行管理员工作流配置验收");
    const submitted = await page.request.post(`/api/admin/runninghub/workflows/${workflow.workflowKey}/test`, { data: { input: { prompt: "RunningHub E2E test" }, references: [] } });
    expect(submitted.ok(), await submitted.text()).toBe(true);
    const run = (await submitted.json()).data;
    expect(run).toMatchObject({ status: "running" });
    const inspected = await page.request.get(`/api/admin/runninghub/workflows/${workflow.workflowKey}/test/${run.runId}`);
    expect(inspected.ok(), await inspected.text()).toBe(true);
    expect((await inspected.json()).data).toMatchObject({ status: "success", taskId: run.taskId });
});
