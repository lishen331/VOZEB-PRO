import { randomUUID } from "node:crypto";
import path from "node:path";
import Papa from "papaparse";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

test.describe("admin official work publishing", () => {
    test("renders the official publishing workflow and responsive drawer", async ({ page }) => {
        await page.goto("/admin?section=works", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "作品管理", level: 1 })).toBeVisible();
        await expect(page.getByRole("button", { name: "发布官方作品" })).toBeVisible();
        await page.getByRole("button", { name: "发布官方作品" }).click();
        const drawer = page.locator(".ant-drawer");
        await expect(drawer).toBeVisible();
        await expect(drawer.getByPlaceholder("作品标题")).toBeVisible();
        await expect(drawer.getByPlaceholder("公开提示词（选填）")).toBeVisible();
        await expect(drawer.getByRole("button", { name: "保存草稿" })).toBeVisible();
        await expect(drawer.getByRole("button", { name: "发布", exact: true })).toBeVisible();
        await expect
            .poll(async () => {
                const box = await drawer.boundingBox();
                return box ? Math.max(-box.x, box.x + box.width - (await page.evaluate(() => innerWidth))) : Number.POSITIVE_INFINITY;
            })
            .toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test("rejects official publishing APIs without content management permission", async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
        const response = await context.request.post("/api/admin/works", { data: { title: "未授权作品" } });
        expect(response.status()).toBe(401);
        await context.close();
    });
});

test("从独立弹窗跨页多选媒体，并恢复作品封面与顺序", async ({ page, request }) => {
    const title = `多图作品-${randomUUID().slice(0, 8)}`;
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#6b80ca" } })
        .png()
        .toBuffer();
    const names = Array.from({ length: 13 }, (_, index) => `${title}-${index + 1}.png`);
    for (const name of names) {
        const uploaded = await request.post("/api/admin/works/media", { multipart: { file: { name, mimeType: "image/png", buffer: image } } });
        expect(uploaded.status(), await uploaded.text()).toBe(201);
    }
    await page.goto("/admin?section=works");
    await page.getByRole("button", { name: "发布官方作品", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "发布官方作品" });
    const editorTitle = editor.getByPlaceholder("作品标题");
    const trigger = editor.getByRole("button", { name: "选择已有媒体", exact: true });
    const collection = page.getByRole("dialog", { name: "选择已有永久媒体" });
    const workMedia = editor.getByRole("region", { name: "作品媒体" });
    await expect(workMedia).toContainText("尚未添加媒体");
    await expect(editor.getByPlaceholder("搜索文件名")).toHaveCount(0);
    await expect(editor.getByLabel("上传媒体")).toBeAttached();
    await expect(trigger).toBeVisible();
    expect(
        await editor.evaluate((drawer) => {
            const titleField = drawer.querySelector('[placeholder="作品标题"]');
            const upload = drawer.querySelector('input[type="file"]');
            const media = drawer.querySelector('[aria-label="作品媒体"]');
            return Boolean(titleField && upload && media && titleField.compareDocumentPosition(upload) & Node.DOCUMENT_POSITION_FOLLOWING && upload.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING);
        }),
    ).toBe(true);

    const search = collection.getByPlaceholder("搜索文件名");
    const first = collection.getByRole("button", { name: names[12], exact: true });
    await trigger.click();
    await search.fill(names[12]);
    await first.click();
    await page.keyboard.press("Escape");
    await expect(collection).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(workMedia).toContainText("尚未添加媒体");
    await editor.getByRole("button", { name: "取消", exact: true }).click();
    await expect(editor).toBeHidden();
    await page.getByRole("button", { name: "发布官方作品", exact: true }).click();
    await editorTitle.fill(title);
    await trigger.click();
    await expect
        .poll(() =>
            collection.evaluate((dialog) => {
                const rect = dialog.getBoundingClientRect();
                return rect.left >= 0 && rect.right <= window.innerWidth + 1 && dialog.scrollWidth <= dialog.clientWidth + 1;
            }),
        )
        .toBe(true);
    await expect(collection.getByRole("button", { name: /添加所选/ })).toBeDisabled();
    await search.fill(title);
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await collection.getByRole("button", { name: "下一页" }).click();
    await collection.getByRole("button", { name: names[0], exact: true }).click();
    await search.fill(names[12]);
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await collection.getByRole("button", { name: /添加所选.*2/ }).click();
    await expect(collection).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(editorTitle).toHaveValue(title);
    const rows = workMedia.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(names[12]);
    await expect(rows.nth(0)).toContainText("封面");
    await trigger.click();
    await search.fill(names[12]);
    await expect(first).toBeDisabled();
    await collection.getByRole("button", { name: "关闭", exact: true }).click();
    await rows.nth(1).getByRole("button", { name: "设为封面" }).click();
    await rows.nth(1).getByRole("button", { name: "上移" }).click();
    await expect(rows.nth(0)).toContainText(names[0]);
    const savedResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/works") && response.request().method() === "POST");
    await editor.getByRole("button", { name: "保存草稿" }).click();
    const saved = await savedResponse;
    expect(saved.status(), await saved.text()).toBe(201);
    const work = (await saved.json()).data.work;
    const editing = page.getByRole("dialog", { name: "编辑官方作品" });
    await editing.getByRole("button", { name: "取消", exact: true }).click();
    await expect(editing).toBeHidden();

    const lookup = page.waitForResponse((response) => new URL(response.url()).searchParams.get("keyword") === title && response.ok());
    await page.getByRole("textbox", { name: "搜索作品标题、用户、用户 ID 或作品链接" }).fill(title);
    await lookup;
    const edit = page.getByRole("button", { name: "编辑", exact: true });
    await page.route(`**/api/admin/works/${work.id}`, (route) => route.fulfill({ status: 500, json: { msg: "测试读取失败" } }), { times: 1 });
    await edit.click();
    await expect(editing.getByRole("alert")).toContainText("测试读取失败");
    await expect(editing.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    await editing.getByRole("button", { name: "重试" }).click();
    const restored = editing.getByRole("region", { name: "作品媒体" }).getByRole("listitem");
    await expect(restored).toHaveCount(2);
    await expect(restored.nth(0)).toContainText(names[0]);
    await expect(restored.nth(0).getByText("封面", { exact: true })).toBeVisible();
    await expect(restored.nth(1)).toContainText(names[12]);
    await expect.poll(() => editing.evaluate((dialog) => dialog.clientWidth <= window.innerWidth && dialog.scrollWidth <= dialog.clientWidth + 1)).toBe(true);

    await editing.getByRole("button", { name: "发布", exact: true }).click();
    const publication = page.waitForResponse((response) => response.url().endsWith(`/api/admin/works/${work.id}/publish`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "确认发布" }).click();
    const publishedResponse = await publication;
    expect(publishedResponse.ok(), await publishedResponse.text()).toBe(true);
    const published = await request.get(`/api/public/works/${work.slug}`);
    expect(published.status(), await published.text()).toBe(200);
    const assets = (await published.json()).data.work.assets;
    expect(assets.filter((asset: { role: string }) => asset.role === "content")).toHaveLength(2);
});

test("GBK 导入保留中文作品标题并匹配中文封面文件名", async ({ page }) => {
    const header = "title,description,publicPrompt,category,tags,authorName,authorDisplay,coverFile,mediaFiles";
    // GBK bytes for 春日海报,,,插画,,,custom,封面.png,封面.png
    const row = Buffer.from("b4bac8d5baa3b1a82c2c2cb2e5bbad2c2c2c637573746f6d2cb7e2c3e62e706e672cb7e2c3e62e706e67", "hex");
    const manifest = Buffer.concat([Buffer.from(`${header}\r\n`), row]);
    const cover = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#6b80ca" } })
        .png()
        .toBuffer();
    await page.goto("/admin?section=works");
    await page.getByRole("button", { name: "批量导入草稿", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "批量导入官方作品草稿" });
    await dialog.getByLabel("上传 CSV 清单").setInputFiles({ name: "作品.csv", mimeType: "text/csv", buffer: manifest });
    const preview = dialog.getByTestId("official-work-import-row");
    await expect(preview.getByRole("heading", { name: "春日海报", exact: true })).toBeVisible();
    await expect(preview.getByRole("alert")).toContainText("封面.png");
    await dialog.getByLabel("选择图片和视频").setInputFiles({ name: "封面.png", mimeType: "image/png", buffer: cover });
    await expect(preview.getByRole("alert")).toHaveCount(0);
    await expect(preview.getByRole("img", { name: "封面.png" })).toBeVisible();
});

test("批量预览、补齐媒体、重试失败并分批公开作品", async ({ page, request }, testInfo) => {
    const theme = testInfo.project.name.startsWith("mobile-") ? "dark" : "light";
    await page.addInitScript((value) => localStorage.setItem("vozeb-pro:theme_store", JSON.stringify({ state: { theme: value }, version: 0 })), theme);
    const token = randomUUID().slice(0, 8);
    const title = `批量作品-${token}`;
    const titles = [`${title} 海报`, `${title} 影片`, `${title} 保留`];
    const api = "/api/admin/works";
    const coverName = `封面-${token}.png`;
    const works: Array<{ id: string; slug: string }> = [];
    const gallery = () => request.get(`/api/public/gallery?keyword=${encodeURIComponent(title)}`);
    await page.goto("/admin?section=works");
    await expect(page.locator("[data-hydrated='true']")).toBeVisible();
    if (theme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await page.getByRole("button", { name: "批量导入草稿", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "批量导入官方作品草稿" });
    const csv = Papa.unparse([
        ["title", "description", "publicPrompt", "category", "tags", "authorName", "authorDisplay", "coverFile", "mediaFiles"],
        [titles[0], "预览简介", "", "插画", "海报", "官方测试", "custom", coverName, coverName],
        [titles[1], "", "", "视频", "短片", "", "hidden", coverName, "hero.mp4"],
        [titles[2], "", "", "摄影", "", "官方测试", "custom", coverName, coverName],
    ]);
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "下载 CSV 模板" }).click();
    expect((await download).suggestedFilename()).toBe("官方作品批量导入模板.csv");
    await dialog.getByLabel("上传 CSV 清单").setInputFiles({ name: "作品.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    const videoRow = dialog.getByTestId("official-work-import-row").filter({ hasText: titles[1] });
    await expect(videoRow.getByRole("alert")).toContainText(coverName);
    const image = await sharp({ create: { width: 48, height: 32, channels: 3, background: "#6b80ca" } })
        .png()
        .toBuffer();
    const registered = await page.request.post(api + "/media", { multipart: { file: { name: coverName, mimeType: "image/png", buffer: image } } });
    expect(registered.status(), await registered.text()).toBe(201);
    const { data: existingCover } = await registered.json();
    await dialog.getByRole("button", { name: "选择已有媒体" }).click();
    const picker = page.getByRole("dialog", { name: "选择已有永久媒体" });
    await picker.getByPlaceholder("搜索文件名").fill(coverName);
    await picker.getByRole("button", { name: new RegExp(coverName) }).click();
    await picker.getByRole("button", { name: "关闭", exact: true }).click();
    const files = dialog.getByLabel("选择图片和视频");
    await expect(videoRow.getByRole("alert")).toContainText("hero.mp4");
    await files.setInputFiles(path.resolve("public/login/hero.mp4"));
    await expect(videoRow.getByRole("alert")).toHaveCount(0);
    await expect(videoRow.locator("video")).toBeVisible();
    await expect(dialog.getByRole("paragraph").filter({ hasText: "预览简介" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: titles[0] })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));

    const capture = async (route: import("@playwright/test").Route) => {
        if (route.request().method() !== "POST") return route.continue();
        const input = route.request().postDataJSON();
        const response = await route.fetch({ maxRetries: 0 });
        expect(response.status(), await response.text()).toBe(201);
        const { data } = await response.json();
        expect(data.work.currentVersion.moderationStatus).toBe("draft");
        expect(data.work.currentAssets.find((asset: { role: string }) => asset.role === "cover")?.storageKey).toBe(existingCover.storageKey);
        if (!works.some((work) => work.id === data.work.id)) {
            works.push(data.work);
            if (input.title === titles[1]) return route.abort();
        }
        return route.fulfill({ response });
    };
    await page.route(`**${api}`, capture);
    await dialog.getByRole("button", { name: "导入 3 条草稿" }).click();
    await expect(dialog.getByRole("status").filter({ hasText: "2 条草稿已创建，1 条失败" })).toBeVisible();
    await dialog.getByRole("button", { name: "重试导入 1 条草稿" }).click();
    await expect(dialog.getByRole("status").filter({ hasText: "3 条草稿已创建，0 条失败" })).toBeVisible();
    expect(works).toHaveLength(3);
    await page.unroute(`**${api}`, capture);
    for (const work of works) expect((await request.get(`/api/public/works/${work.slug}`)).status()).toBe(404);
    await dialog.getByRole("button", { name: "关闭", exact: true }).last().click();
    for (const name of titles.slice(0, 2)) {
        const input = testInfo.project.name.startsWith("mobile-") ? page.getByRole("checkbox", { name: `选择草稿：${name}` }) : page.locator("tbody tr").filter({ hasText: name }).getByRole("checkbox", { name: "选择此行" });
        await input.check();
    }
    const failUrl = `**${api}/${works[1].id}/publish`;
    await page.route(failUrl, (route) => route.fulfill({ status: 409, json: { code: 409, msg: "请复核后再发布" } }));
    await page.getByRole("button", { name: /分批发布（\s*2\s*）/ }).click();
    const confirm = page.getByRole("dialog", { name: "分批发布官方作品" });
    await expect(confirm.getByText(titles[0], { exact: true })).toBeVisible();
    await expect(confirm.getByText(titles[2], { exact: true })).toHaveCount(0);
    await confirm.getByRole("button", { name: "确认发布 2 条作品" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "请复核后再发布" })).toBeVisible();
    expect((await request.get(`/api/public/works/${works[0].slug}`)).status()).toBe(200);
    expect((await request.get(`/api/public/works/${works[1].slug}`)).status()).toBe(404);
    await page.unroute(failUrl);
    await page.getByRole("button", { name: /分批发布（\s*1\s*）/ }).click();
    await confirm.getByRole("button", { name: "确认发布 1 条作品" }).click();
    await expect(confirm).toBeHidden();
    expect((await request.get(`/api/public/works/${works[2].slug}`)).status()).toBe(404);
    const response = await gallery();
    expect(response.ok()).toBe(true);
    const published = (await response.json()).data.items as Array<{ title: string }>;
    expect(published.map((item) => item.title).sort()).toEqual(titles.slice(0, 2).sort());
    await page.goto(`/gallery?keyword=${encodeURIComponent(title)}&sort=latest`);
    for (const name of titles.slice(0, 2)) await expect(page.getByRole("button", { name: `查看作品：${name}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `查看作品：${titles[2]}`, exact: true })).toHaveCount(0);
    await page.goto(`/share/${works[1].slug}`);
    await expect(page.getByText(titles[1], { exact: true }).first()).toBeVisible();
    const detail = await request.get(`/api/public/works/${works[1].slug}`);
    expect(detail.status()).toBe(200);
    const { data } = await detail.json();
    for (const asset of data.work.assets) {
        expect((await request.get(`/api/public/works/${works[1].slug}/media/${asset.id}`)).ok()).toBe(true);
    }
});

test("按作品状态批量下架和永久删除，并处理并发上架", async ({ page, request }) => {
    const prefix = `批量管理-${randomUUID().slice(0, 8)}`;
    const api = "/api/admin/works";
    const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#6b80ca" } })
        .png()
        .toBuffer();
    const media = await request.post(`${api}/media`, { multipart: { file: { name: `${prefix}.png`, mimeType: "image/png", buffer: png } } });
    expect(media.status(), await media.text()).toBe(201);
    const { data: asset } = await media.json();
    const works = [];
    for (const suffix of ["草稿", "发布冲突", "线上"]) {
        const created = await request.post(api, {
            data: { title: `${prefix}-${suffix}`, category: "视觉设计", authorDisplay: "hidden", coverStorageKey: asset.storageKey, assetStorageKeys: [asset.storageKey] },
        });
        expect(created.status(), await created.text()).toBe(201);
        works.push((await created.json()).data.work);
    }
    const [draft, changed, online] = works;
    const publish = async (work: typeof draft) => {
        const response = await request.post(`${api}/${work.id}/publish`, { data: { versionId: work.currentVersion.id, expectedUpdatedAt: work.currentVersion.updatedAt } });
        expect(response.ok(), await response.text()).toBe(true);
    };
    await publish(online);
    await publish(changed);
    await page.goto("/admin?section=works");
    await expect(page.locator("[data-hydrated='true']")).toBeVisible();
    const filtered = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === api && url.searchParams.get("keyword") === prefix && response.ok();
    });
    await page.getByRole("textbox", { name: "搜索作品标题、用户、用户 ID 或作品链接" }).fill(prefix);
    await filtered;
    const selectPage = page.getByRole("checkbox", { name: "全选本页可操作作品", exact: true });
    await expect(page.getByText(`${prefix}-草稿`, { exact: true }).filter({ visible: true })).toBeVisible();
    await selectPage.check();
    await page.getByRole("button", { name: /批量下架作品（\s*2\s*）/ }).click();
    const takeDown = page.getByRole("dialog", { name: "批量下架作品" });
    const confirmTakeDown = takeDown.getByRole("button", { name: "确认下架 2 条作品" });
    await expect(takeDown.getByText(`${prefix}-草稿`, { exact: true })).toHaveCount(0);
    await expect(confirmTakeDown).toBeDisabled();
    await takeDown.getByRole("textbox").fill("批量下架测试");
    await confirmTakeDown.click();
    await expect(page.getByRole("status").filter({ hasText: "批量下架作品：成功 2 条，失败 0 条" })).toBeVisible();
    await expect(page.getByRole("button", { name: /批量下架作品（/ })).toHaveCount(0);
    for (const work of [changed, online]) await expect.poll(async () => (await request.get(`/api/public/works/${work.slug}`)).status()).toBe(404);

    const takenDownWorks = await request.get(`${api}?status=taken_down&keyword=${encodeURIComponent(prefix)}`);
    expect(takenDownWorks.ok(), await takenDownWorks.text()).toBe(true);
    expect((await takenDownWorks.json()).data.items.map((work: { id: string }) => work.id).sort()).toEqual([changed.id, online.id].sort());
    await selectPage.check();
    await page.getByRole("button", { name: /批量删除已下架作品（\s*2\s*）/ }).click();
    const removeTakenDown = page.getByRole("dialog", { name: "批量删除已下架作品" });
    const relisted = await request.post(`${api}/${changed.id}/relist`);
    expect(relisted.ok(), await relisted.text()).toBe(true);
    await removeTakenDown.getByRole("button", { name: "永久删除 2 条作品" }).click();
    await expect(page.getByRole("alert").filter({ hasText: `${prefix}-发布冲突` })).toContainText("下架");
    await expect(page.getByText(`${prefix}-线上`, { exact: true }).filter({ visible: true })).toHaveCount(0);
    expect((await request.get(`/api/public/works/${changed.slug}`)).status()).toBe(200);
});

test("置顶只影响默认排序，展示数与真实互动分开", async ({ page, request, browser, baseURL }) => {
    const prefix = `作品展示-${randomUUID().slice(0, 8)}`;
    const api = "/api/admin/works";
    const image = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#6b80ca" } })
        .png()
        .toBuffer();
    const uploaded = await request.post(`${api}/media`, { multipart: { file: { name: `${prefix}.png`, mimeType: "image/png", buffer: image } } });
    expect(uploaded.ok(), await uploaded.text()).toBe(true);
    const { data: media } = await uploaded.json();
    const create = async (suffix: string) => {
        const response = await request.post(api, { data: { title: `${prefix}-${suffix}`, category: "视觉设计", authorDisplay: "hidden", coverStorageKey: media.storageKey, assetStorageKeys: [media.storageKey] } });
        expect(response.ok(), await response.text()).toBe(true);
        return (await response.json()).data.work;
    };
    const work = await create("置顶");
    const featured = await create("精选");
    const show = async (item: typeof work) => {
        const response = await request.post(`${api}/${item.id}/publish`, { data: { versionId: item.currentVersion.id } });
        expect(response.ok(), await response.text()).toBe(true);
    };
    const presentation = `${api}/${work.id}/presentation`;
    const anonymous = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
        expect((await anonymous.request.patch(presentation, { data: { action: "pin", pinned: true } })).status()).toBe(401);
    } finally {
        await anonymous.close();
    }
    expect((await request.patch(presentation, { data: { action: "pin", pinned: true } })).status()).toBe(409);
    await show(work);
    await show(featured);
    expect((await request.post(`${api}/${featured.id}/feature`, { data: { featured: true } })).ok()).toBe(true);
    const publicWork = `/api/public/works/${work.slug}`;
    const requestData = async (url: string) => {
        const response = await request.get(url);
        expect(response.ok(), await response.text()).toBe(true);
        return (await response.json()).data;
    };
    const gallery = `/api/public/gallery?keyword=${encodeURIComponent(prefix)}&limit=1`;
    await page.goto("/admin?section=works");
    await expect(page.locator("[data-hydrated='true']")).toBeVisible();
    const results = page.waitForResponse((response) => new URL(response.url()).pathname === api && new URL(response.url()).searchParams.get("keyword") === `${prefix}-置顶` && response.ok());
    await page.getByRole("textbox", { name: "搜索作品标题、用户、用户 ID 或作品链接" }).fill(`${prefix}-置顶`);
    await results;
    await expect(page.getByText(`${prefix}-精选`, { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByText(`${prefix}-置顶`, { exact: true }).filter({ visible: true })).toBeVisible();
    const pinnedFilter = page.getByRole("switch", { name: "已置顶" });
    const adjustedFilter = page.getByRole("switch", { name: "展示已调整" });
    const selectAll = page.getByRole("checkbox", { name: "全选本页可操作作品" });
    const clearFilters = page.getByRole("button", { name: "清除筛选", exact: true });
    const displayFilters = page.getByRole("group", { name: "作品展示筛选" });
    await expect(pinnedFilter).toBeVisible();
    await expect(adjustedFilter).toBeVisible();
    await expect(selectAll).toBeVisible();
    await expect(clearFilters).toBeVisible();
    const [pinnedBounds, adjustedBounds, clearBounds, selectBounds] = await Promise.all([
        displayFilters.getByText("已置顶", { exact: true }).boundingBox(),
        displayFilters.getByText("展示已调整", { exact: true }).boundingBox(),
        clearFilters.boundingBox(),
        selectAll.boundingBox(),
    ]);
    expect(pinnedBounds!.x).toBeGreaterThan(selectBounds!.x);
    expect(adjustedBounds!.x).toBeGreaterThanOrEqual(pinnedBounds!.x + pinnedBounds!.width);
    expect(Math.abs(pinnedBounds!.y - adjustedBounds!.y)).toBeLessThanOrEqual(1);
    expect(adjustedBounds!.y).toBeGreaterThanOrEqual(clearBounds!.y + clearBounds!.height - 1);
    expect(Math.abs(adjustedBounds!.x + adjustedBounds!.width - clearBounds!.x - clearBounds!.width)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "置顶作品", exact: true }).click();
    await expect(page.getByRole("button", { name: "取消置顶", exact: true })).toBeVisible();
    await pinnedFilter.click();
    await expect(pinnedFilter).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(`${prefix}-置顶`, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(`${prefix}-精选`, { exact: true }).filter({ visible: true })).toHaveCount(0);
    await pinnedFilter.click();
    await expect(pinnedFilter).toHaveAttribute("aria-checked", "false");
    const first = await requestData(gallery);
    expect(first.items[0].slug).toBe(work.slug);
    expect((await requestData(`${gallery}&cursor=${encodeURIComponent(first.nextCursor)}`)).items[0].slug).toBe(featured.slug);
    expect((await requestData(`${gallery}&sort=latest`)).items[0].slug).toBe(featured.slug);
    const secondPresentation = `${api}/${featured.id}/presentation`;
    expect((await request.patch(secondPresentation, { data: { action: "pin", pinned: true } })).ok()).toBe(true);
    const newestPin = await requestData(gallery);
    expect(newestPin.items[0].slug).toBe(featured.slug);
    expect((await requestData(`${gallery}&cursor=${encodeURIComponent(newestPin.nextCursor)}`)).items[0].slug).toBe(work.slug);
    expect((await request.patch(secondPresentation, { data: { action: "pin", pinned: false } })).ok()).toBe(true);
    expect((await requestData(`${gallery}&category=${encodeURIComponent("摄影")}`)).items).toHaveLength(0);
    await page.getByRole("button", { name: "取消置顶", exact: true }).click();
    await expect(page.getByRole("button", { name: "置顶作品", exact: true })).toBeVisible();
    expect((await requestData(gallery)).items[0].slug).toBe(featured.slug);

    const workRow = page.locator("tr, article").filter({ has: page.getByText(`${prefix}-置顶`, { exact: true }) });
    const counts = workRow.getByRole("group", { name: "作品互动数据" });
    const adjustedMarker = counts.getByText("展示已调整", { exact: true });
    await expect(adjustedMarker).toHaveCount(0);
    await workRow.getByRole("button", { name: "调整展示数据", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "调整展示数据" });
    await expect(dialog).toContainText("当前状态：未调整");
    await dialog.getByLabel(/观看展示数量/).fill("100");
    await dialog.getByLabel(/点赞展示数量/).fill("20");
    await expect(dialog.getByRole("button", { name: "保存展示数据" })).toBeDisabled();
    await dialog.getByLabel("调整原因").fill("验证展示数据");
    await dialog.getByRole("button", { name: "保存展示数据" }).click();
    await expect(dialog).toBeHidden();
    await expect(adjustedMarker).toBeVisible();
    await expect(counts).toContainText("观看 100");
    await expect(counts).toContainText("点赞 20");
    await selectAll.check();
    await adjustedFilter.click();
    await expect(selectAll).not.toBeChecked();
    await expect(adjustedFilter).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(`${prefix}-置顶`, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(`${prefix}-精选`, { exact: true }).filter({ visible: true })).toHaveCount(0);
    const desktopTable = page.locator(".admin-work-table .gm-table-content");
    if (await desktopTable.isVisible()) {
        const viewport = page.viewportSize()!;
        const expand = page.getByRole("button", { name: "展开后台侧边栏", exact: true });
        if (await expand.isVisible()) await expand.click();
        for (const width of [768, 1024, 1280, 1440, 1920]) {
            await page.setViewportSize({ width, height: viewport.height });
            await desktopTable.evaluate((container) => {
                container.scrollLeft = 0;
            });
            await expect
                .poll(
                    () =>
                        counts.evaluate((group) => {
                            const scroll = group.closest(".gm-table-content")!;
                            const actions = group.closest("tr")!.querySelector(".gm-table-cell-fix-right")!;
                            const visibleRight = Math.min(scroll.getBoundingClientRect().right, actions.getBoundingClientRect().left, innerWidth);
                            const visibleLeft = Math.max(scroll.getBoundingClientRect().left, 0);
                            return Array.from(group.children, (child) => {
                                const rect = child.getBoundingClientRect();
                                return rect.width > 0 && rect.left >= visibleLeft && rect.right <= visibleRight + 1;
                            });
                        }),
                    { message: `观看、点赞和调整标识在 ${width}px 时必须完整露出` },
                )
                .toEqual([true, true, true]);
        }
        await page.setViewportSize({ width: 1280, height: viewport.height });
        const scrollState = await desktopTable.evaluate((container) => {
            const actions = container.querySelector("tbody .gm-table-cell-fix-right")!;
            const before = actions.getBoundingClientRect().left;
            container.scrollLeft = container.scrollWidth;
            const scrolled = container.scrollLeft;
            const after = actions.getBoundingClientRect().left;
            container.scrollLeft = 0;
            return { scrolled, movement: Math.abs(before - after) };
        });
        expect(scrollState.scrolled).toBeGreaterThan(0);
        expect(scrollState.movement).toBeLessThanOrEqual(1);
        await page.setViewportSize(viewport);
    }
    await page.reload();
    await expect(page.locator("[data-hydrated='true']")).toBeVisible();
    await page.getByRole("textbox", { name: "搜索作品标题、用户、用户 ID 或作品链接" }).fill(`${prefix}-置顶`);
    await expect(counts.filter({ hasText: "展示已调整" })).toContainText("观看 100");
    expect((await requestData(publicWork)).work).toMatchObject({ viewCount: 100, likeCount: 20 });
    const watched = await request.post(`${publicWork}/view`);
    expect(await watched.json()).toMatchObject({ data: { viewCount: 101 } });
    for (const active of [true, false]) {
        const liked = await request.post(`${publicWork}/community/like`, { data: { active } });
        expect(liked.ok(), await liked.text()).toBe(true);
        expect(await liked.json()).toMatchObject({ data: { likeCount: active ? 21 : 20, active } });
    }
    expect((await requestData(gallery.replace("limit=1", "limit=2"))).items.find((item: { slug: string }) => item.slug === work.slug)).toMatchObject({ viewCount: 101, likeCount: 20 });
    expect((await requestData(`${api}?keyword=${encodeURIComponent(`${prefix}-置顶`)}`)).items[0]).toMatchObject({ viewCount: 1, likeCount: 0 });
    const boosted = await request.patch(`${api}/${featured.id}/presentation`, { data: { action: "counts", viewCount: 1000, likeCount: 0, reason: "验证人气排序" } });
    expect(boosted.ok(), await boosted.text()).toBe(true);
    expect((await requestData(`${gallery}&sort=popular`)).items[0].slug).toBe(work.slug);
    const search = page.getByRole("textbox", { name: "搜索作品标题、用户、用户 ID 或作品链接" });
    const adminSearch = `${api}?keyword=${encodeURIComponent(prefix)}&origin=official`;
    const pageOne = await requestData(`${adminSearch}&adjustedOnly=true&page=1&pageSize=1`);
    const pageTwo = await requestData(`${adminSearch}&adjustedOnly=true&page=2&pageSize=1`);
    expect(pageOne.total).toBe(2);
    expect(pageTwo.total).toBe(2);
    expect(new Set([pageOne.items[0].id, pageTwo.items[0].id])).toEqual(new Set([work.id, featured.id]));
    expect((await requestData(`${adminSearch}&pinnedOnly=true`)).items).toEqual([]);
    expect((await requestData(`${api}?keyword=${encodeURIComponent(prefix)}&origin=user_submission&adjustedOnly=true`)).items).toEqual([]);
    await adjustedFilter.click();
    await pinnedFilter.click();
    await expect(page.getByText("共 0 条", { exact: true })).toBeVisible();
    const allWorks = await requestData(api);
    await page.getByRole("button", { name: "清除筛选", exact: true }).click();
    await expect(page.getByText(`共 ${allWorks.total} 条`, { exact: true })).toBeVisible();
    await expect(adjustedFilter).toHaveAttribute("aria-checked", "false");
    await expect(pinnedFilter).toHaveAttribute("aria-checked", "false");
    await expect(search).toHaveValue("");
    const filteredAgain = page.waitForResponse((response) => new URL(response.url()).pathname === api && new URL(response.url()).searchParams.get("keyword") === `${prefix}-置顶` && response.ok());
    await search.fill(`${prefix}-置顶`);
    await filteredAgain;
    await adjustedFilter.click();
    await expect(workRow.getByRole("button", { name: "置顶作品", exact: true })).toBeVisible();
    await workRow.getByRole("button", { name: "置顶作品", exact: true }).click();
    await expect(workRow.getByRole("button", { name: "取消置顶", exact: true })).toBeVisible();
    await pinnedFilter.click();
    const combined = await requestData(`${adminSearch}&pinnedOnly=true&adjustedOnly=true`);
    expect(combined.items.map((item: { id: string }) => item.id)).toEqual([work.id]);
    await expect(counts.filter({ hasText: "展示已调整" })).toContainText("观看 101");
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(counts.filter({ hasText: "展示已调整" })).toContainText("观看 101");
    await workRow.getByRole("button", { name: "查看展示调整", exact: true }).click();
    await expect(dialog).toContainText("当前状态：已调整");
    await expect(dialog).toContainText("真实 1 · 当前展示 101 · 偏移 +100");
    await expect(dialog).toContainText("真实 0 · 当前展示 20 · 偏移 +20");
    await dialog.getByLabel("调整原因").fill("恢复实际计数");
    await dialog.getByRole("button", { name: "恢复真实数据" }).click();
    await expect(dialog).toBeHidden();
    await expect(workRow.filter({ visible: true })).toHaveCount(0);
    await adjustedFilter.click();
    await expect(adjustedMarker).toHaveCount(0);
    await expect(counts).toContainText("观看 1");
    await expect(counts).toContainText("点赞 0");
    await expect(workRow.getByRole("button", { name: "调整展示数据", exact: true })).toBeVisible();
    expect((await requestData(publicWork)).work).toMatchObject({ viewCount: 1, likeCount: 0 });

    await workRow.getByRole("button", { name: "取消置顶", exact: true }).click();
    await expect(workRow.filter({ visible: true })).toHaveCount(0);
    expect((await request.patch(presentation, { data: { action: "pin", pinned: true } })).ok()).toBe(true);
    expect((await request.post(`${api}/${work.id}/take-down`, { data: { reason: "测试取消置顶" } })).ok()).toBe(true);
    expect((await request.post(`${api}/${work.id}/relist`)).ok()).toBe(true);
    expect((await requestData(gallery)).items[0].slug).toBe(featured.slug);
});
