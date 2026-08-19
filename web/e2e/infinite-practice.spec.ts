import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext } from "@playwright/test";

import { createAuthenticatedE2EContext, E2E_PRACTICE_PASSWORD, e2eSettingsPatch } from "./support";

const BASE_URL = `http://127.0.0.1:${Number(process.env.VOZEB_PRO_E2E_PORT || 3100)}`;

test.describe.configure({ mode: "serial" });

test("学校老师和学生可以在独立练习身份中完成五类模块", async ({ browser, page }, testInfo) => {
    test.setTimeout(240_000);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const managerUsername = `practice_manager_${suffix}`;
    const teacherUsername = `practice_teacher_${suffix}`;
    const studentUsername = `practice_student_${suffix}`;
    const contexts: BrowserContext[] = [];
    try {
        const settings = { ...e2eSettingsPatch(), practiceDefaultModels: { textModel: "e2e-text", imageModel: "e2e-image", videoModel: "e2e-video", audioModel: "e2e-audio" } };
        const settingsResponse = await page.request.patch("/api/admin/settings", { data: settings });
        expect(settingsResponse.ok(), await settingsResponse.text()).toBe(true);
        const schoolResponse = await page.request.post("/api/admin/schools", {
            data: {
                name: `无限练习验收学校 ${suffix}`,
                profile: { purpose: "e2e-infinite-practice" },
                administrator: { username: managerUsername, displayName: `练习管理员 ${suffix}`, password: E2E_PRACTICE_PASSWORD },
            },
        });
        expect(schoolResponse.ok(), await schoolResponse.text()).toBe(true);

        const managerContext = await createAuthenticatedE2EContext(browser, BASE_URL, { username: managerUsername, password: E2E_PRACTICE_PASSWORD }, { viewport: testInfo.project.use.viewport });
        contexts.push(managerContext);
        const membersResponse = await managerContext.request.post("/api/school/members", {
            data: {
                rows: [
                    { username: teacherUsername, displayName: `练习老师 ${suffix}`, password: E2E_PRACTICE_PASSWORD, role: "teacher" },
                    { username: studentUsername, displayName: `练习学生 ${suffix}`, password: E2E_PRACTICE_PASSWORD, role: "student" },
                ],
            },
        });
        expect(membersResponse.ok(), await membersResponse.text()).toBe(true);

        const denied = await page.goto("/practice", { waitUntil: "domcontentloaded" });
        expect(denied?.status()).toBe(404);
        await expect(page).toHaveURL(/\/practice$/);
        await expect(page.getByText("404", { exact: true })).toBeVisible();

        for (const role of ["teacher", "student"] as const) {
            const username = role === "teacher" ? teacherUsername : studentUsername;
            const context = await createAuthenticatedE2EContext(browser, BASE_URL, { username, password: E2E_PRACTICE_PASSWORD }, { viewport: testInfo.project.use.viewport });
            contexts.push(context);
            const rolePage = await context.newPage();
            await rolePage.goto("/practice", { waitUntil: "domcontentloaded" });
            await expect(rolePage.getByRole("heading", { name: "无限练习", exact: true })).toBeVisible();
            await expect(rolePage.getByText("无限练习").first()).toBeVisible();
            const initialOverflow = await rolePage.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
            expect(initialOverflow.width).toBeLessThanOrEqual(initialOverflow.viewport);

            for (const kind of ["canvas", "drama"] as const) {
                const card = rolePage.locator(`[data-practice-project-card="${kind}"]`);
                await card.getByRole("button", { name: "新建", exact: true }).click();
                await expect(rolePage).toHaveURL(new RegExp(`/${kind}/[^/]+$`));
                await rolePage.goBack();
                await expect(rolePage.getByRole("heading", { name: "无限练习", exact: true })).toBeVisible();
            }

            for (const practiceModule of ["script", "storyboard-image", "storyboard-video", "dubbing", "music"] as const) {
                await rolePage.goto(`/practice/${practiceModule}`, { waitUntil: "domcontentloaded" });
                await rolePage.getByLabel("输入你的想法").fill(`${role} ${practiceModule} 验收练习`);
                const responsePromise = rolePage.waitForResponse((response) => response.url().includes("/api/practice/sessions") && response.request().method() === "POST");
                await rolePage.getByRole("button", { name: "开始练习", exact: true }).click();
                const response = await responsePromise;
                expect(response.status()).toBe(200);
                const payload = await response.json();
                const serialized = JSON.stringify(payload);
                expect(serialized).not.toMatch(/taskRefs|provider|model|channelId|pointsCost|executionProfile/i);
                const sessionId = payload.data?.session?.id;
                expect(typeof sessionId).toBe("string");
                await expect
                    .poll(
                        async () => {
                            const sessionResponse = await rolePage.request.get(`/api/practice/sessions/${sessionId}`);
                            expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true);
                            const sessionPayload = await sessionResponse.json();
                            const session = sessionPayload.data?.session;
                            expect(JSON.stringify(sessionPayload)).not.toMatch(/taskRefs|provider|channelId|pointsCost|executionProfile/i);
                            return session?.status;
                        },
                        { timeout: 90_000 },
                    )
                    .toBe("success");
            }
            await rolePage.close();
        }
    } finally {
        await Promise.all(contexts.map((context) => context.close()));
    }
});
