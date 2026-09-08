import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { E2E_ADMIN } from "./support";

// Isolated local fixtures only. No production channels or database are accessed.
test("course cover local upload, persistence, assigned image cards and permissions", async ({ browser, request, baseURL }, info) => {
    test.setTimeout(180_000);
    const suffix = randomUUID().slice(0, 8);
    const status = await (await request.get("/api/install/status")).json();
    if (status.install.firstAdminRequired) {
        const created = await request.post("/api/auth/register", { data: { ...E2E_ADMIN, installToken: process.env.COURSE_COVER_TEST_TOKEN || E2E_ADMIN.installToken } });
        expect(created.ok(), await created.text()).toBe(true);
    } else {
        const login = await request.post("/api/auth/login", { data: E2E_ADMIN });
        expect(login.ok(), await login.text()).toBe(true);
    }
    const admin = await browser.newContext({ baseURL, storageState: await request.storageState() });
    const page = await admin.newPage();
    const managerName = `cover_${suffix}`;
    const schoolResponse = await request.post("/api/admin/schools", { data: { name: `封面测试 ${suffix}`, administrator: { username: managerName, displayName: "封面测试老师", password: "CoverLocal!2026" } } });
    expect(schoolResponse.ok(), await schoolResponse.text()).toBe(true);
    const school = (await schoolResponse.json()).data;
    const images = path.join(info.outputDir, "fixtures");
    await mkdir(images, { recursive: true });
    const red = path.join(images, "local-red.png"),
        blue = path.join(images, "local-blue.png");
    await sharp({ create: { width: 640, height: 480, channels: 3, background: "#dc3636" } })
        .png()
        .toFile(red);
    await sharp({ create: { width: 480, height: 640, channels: 3, background: "#2266dd" } })
        .png()
        .toFile(blue);
    const title = `本地封面 ${suffix}`;
    await page.goto("/admin?section=courses");
    await page.getByRole("button", { name: "创建课程", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "创建课程", exact: true });
    await dialog.getByLabel("课程标题").fill(title);
    await dialog.getByLabel("课程摘要").fill("这段摘要不能出现在封面卡片中");
    const uploadResponse = page.waitForResponse((r) => r.url().endsWith("/api/admin/course-covers") && r.request().method() === "PUT");
    const chooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "上传封面", exact: true }).click();
    await (await chooser).setFiles(red);
    const uploaded = await uploadResponse;
    expect(uploaded.status()).toBe(200);
    await expect(dialog.getByAltText("课程封面预览")).toBeVisible();
    await dialog.getByRole("button", { name: /保\s*存/ }).click();
    await expect(dialog).toBeHidden();
    let courses = (await (await request.get(`/api/admin/courses?keyword=${encodeURIComponent(title)}`)).json()).data.items;
    const course = courses.find((item: { title: string }) => item.title === title);
    expect(course.content.coverStorageKey).toBeTruthy();
    const firstKey = course.content.coverStorageKey;
    await page.reload();
    await page.getByPlaceholder("搜索课程标题或摘要").fill(title);
    await page.getByPlaceholder("搜索课程标题或摘要").press("Enter");
    await page.locator("tr").filter({ hasText: title }).getByRole("button", { name: "编辑", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "编辑课程", exact: true });
    await expect(dialog.getByAltText("课程封面预览")).toHaveAttribute("src", new RegExp(firstKey));
    const replacementResponse = page.waitForResponse((r) => r.url().endsWith("/api/admin/course-covers") && r.request().method() === "PUT");
    const replaceChooser = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "替换封面" }).click();
    await (await replaceChooser).setFiles(blue);
    expect((await replacementResponse).ok()).toBe(true);
    await expect(dialog.getByAltText("课程封面预览")).not.toHaveAttribute("src", new RegExp(firstKey));
    await dialog.getByRole("button", { name: /保\s*存/ }).click();
    await expect(dialog).toBeHidden();
    courses = (await (await request.get(`/api/admin/courses?keyword=${encodeURIComponent(title)}`)).json()).data.items;
    const key = courses.find((c: { id: string }) => c.id === course.id).content.coverStorageKey;
    expect(key).not.toBe(firstKey);
    const ids = [course.id];
    for (let i = 1; i < 6; i++) {
        const r = await request.post("/api/admin/courses", { data: { title: `封面 ${i} ${suffix}`, summary: "", content: { coverStorageKey: key } } });
        expect(r.ok(), await r.text()).toBe(true);
        ids.push((await r.json()).data.id);
    }
    for (const id of ids) {
        expect((await request.patch(`/api/admin/courses/${id}`, { data: { status: "published" } })).ok()).toBe(true);
        expect((await request.post(`/api/admin/courses/${id}/schools`, { data: { schoolIds: [school.id] } })).ok()).toBe(true);
    }
    const manager = await browser.newContext({ baseURL });
    expect((await manager.request.post("/api/auth/login", { data: { username: managerName, password: "CoverLocal!2026" } })).ok()).toBe(true);
    expect((await manager.request.put("/api/admin/course-covers", { data: Buffer.from("x") })).status()).toBe(403);
    const assignments = (await (await manager.request.get("/api/school/courses")).json()).data.items;
    const assignment = assignments.find((a: { courseId: string }) => a.courseId === course.id);
    expect(assignment.course.content.coverStorageKey).toBe(key);
    const cover = await manager.request.get(`/api/school/courses/${assignment.id}/cover`);
    expect(cover.ok(), await cover.text()).toBe(true);
    expect(cover.headers()["content-type"]).toBe("image/webp");
    const schoolPage = await manager.newPage();
    for (const theme of ["light", "dark"] as const) {
        await schoolPage.addInitScript((t) => localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme: t }, version: 0 })), theme);
        for (const width of [1440, 390, 430]) {
            await schoolPage.setViewportSize({ width, height: 932 });
            await schoolPage.goto("/school");
            await schoolPage.getByRole("tab", { name: "课程安排" }).click();
            const grid = schoolPage.getByLabel("课程封面", { exact: true });
            await expect(grid.getByRole("button")).toHaveCount(6);
            await expect(grid.locator("img").first()).toBeVisible();
            await expect.poll(() => grid.locator("img").evaluateAll((imgs) => imgs.every((e) => (e as HTMLImageElement).naturalWidth > 0))).toBe(true);
            const boxes = await grid.getByRole("button").evaluateAll((elements) =>
                elements.map((e) => {
                    const r = e.getBoundingClientRect();
                    return { x: r.x, y: r.y, right: r.right, width: r.width };
                }),
            );
            expect(boxes.every((b) => b.x >= 0 && b.right <= width)).toBe(true);
            if (width === 1440) {
                expect(boxes[0].y).toBe(boxes[2].y);
                expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
                expect(boxes[3].y).toBeGreaterThan(boxes[0].y);
            } else {
                expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
            }
            expect(await grid.innerText()).toBe("");
            expect(await schoolPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await schoolPage.screenshot({ path: info.outputPath(`covers-${theme}-${width}.png`) });
        }
    }
    await schoolPage.getByRole("button", { name: `打开课程：${title}`, exact: true }).click();
    await expect(schoolPage.getByRole("button", { name: "新建安排", exact: true })).toBeVisible();
    const anonymous = await browser.newContext({ baseURL });
    expect((await anonymous.request.get(`/api/school/courses/${assignment.id}/cover`)).status()).toBe(401);
    await anonymous.close();
    await manager.close();
    await admin.close();
});
