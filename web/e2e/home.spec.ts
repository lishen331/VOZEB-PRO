import { expect, test, type Page } from "@playwright/test";

const galleryResponse = { code: 0, msg: "OK", data: { items: [galleryItem(1, "image", "canvas", "视觉设计"), galleryItem(2, "image", "media", "插画")] } };

async function openHome(page: Page) {
    const skip = page.getByRole("button", { name: "跳过引导", exact: true });
    await page.removeLocatorHandler(skip);
    await page.addLocatorHandler(skip, async (button) => {
        await button.click();
    });
    await page.route("**/api/public/gallery?**", (route) => {
        const category = new URL(route.request().url()).searchParams.get("category");
        const items = category ? galleryResponse.data.items.filter((item) => item.category === category) : galleryResponse.data.items;
        return route.fulfill({ json: { ...galleryResponse, data: { items } } });
    });
    await mockPublicWorkDetails(page);
    await page.goto("/");
    await expect(page.getByTestId("home-canvas-cases")).toBeVisible();
}

test("anonymous homepage requires login and preserves the destination", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
    await context.close();
});

test("homepage course hall opens the real catalog and cases open real work details", async ({ page }) => {
    await openHome(page);
    const cases = page.getByTestId("home-canvas-cases");
    await expect(cases.getByRole("heading", { name: "画布创作案例" })).toBeVisible();
    await expect(cases.getByRole("link", { name: "全部作品" })).toHaveAttribute("href", "/community");
    await cases.getByRole("button", { name: /首页公开作品 1/ }).click();
    const preview = page.getByRole("dialog");
    await expect(preview.getByRole("img", { name: "首页公开作品 1" })).toBeVisible();
    await preview.getByRole("button", { name: "关闭作品详情" }).click();
    const catalogRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/teaching");
    await page.getByRole("button", { name: /课程大厅，/ }).click();
    expect(new URL((await catalogRequest).url()).searchParams.get("tab")).toBe("catalog");
    // The standalone fixture admin has no school membership: preserve the teaching access guard.
    await expect(page).toHaveURL(/\/create$/);
});

test("homepage gallery uses real categories and explicit empty states", async ({ page }) => {
    await openHome(page);
    await expect(page.getByTestId("home-gallery-card")).toHaveCount(2);
    await page.getByRole("group", { name: "按分类筛选" }).getByRole("button", { name: "视频", exact: true }).click();
    await expect(page.getByText("视频分类暂无可展示作品", { exact: true })).toBeVisible();
    await expect(page.getByTestId("home-gallery-card")).toHaveCount(0);
    await page.getByRole("group", { name: "按分类筛选" }).getByRole("button", { name: "全部", exact: true }).click();
    await expect(page.getByTestId("home-gallery-card")).toHaveCount(2);
});

test("homepage gallery hides internal service errors and can recover", async ({ page }) => {
    await openHome(page);
    await page.route("**/api/public/gallery?**", (route) => route.fulfill({ status: 500, json: { error: "private upstream debug detail" } }));
    await page.reload();
    await expect(page.getByText("案例暂时无法加载", { exact: true })).toBeVisible();
    await expect(page.getByText("作品暂时无法加载", { exact: true })).toBeVisible();
    await expect(page.getByText("private upstream debug detail")).toHaveCount(0);
    await page.unroute("**/api/public/gallery?**");
    await openHome(page);
    await expect(page.getByTestId("home-gallery-card")).toHaveCount(2);
});

test("homepage workspace stays within desktop and mobile viewports", async ({ page }, testInfo) => {
    await openHome(page);
    await expect(page.getByTestId("home-gallery-card")).toHaveCount(2);
    const widths = await page.evaluate(() => [document.documentElement, document.body, document.querySelector("main")!].map((element) => ({ client: element.clientWidth, scroll: element.scrollWidth })));
    for (const width of widths) expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    const images = page.getByTestId("home-canvas-cases").getByRole("img");
    await expect(images).toHaveCount(2);
    for (const image of await images.all()) expect(await image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath("homepage.png"), fullPage: true });
});

function galleryItem(index: number, mediaType: "image" | "video", sourceType: "media" | "canvas" | "drama", category: string) {
    return {
        slug: `home-e2e-${index}`,
        sourceType,
        viewCount: index * 10,
        likeCount: index * 3,
        isFeatured: false,
        publishedAt: "2026-08-05T00:00:00.000Z",
        title: `首页公开作品 ${index}`,
        description: "公开作品测试数据",
        publicPrompt: `public fixture ${index}`,
        category,
        tags: [],
        authorName: "公开创作者",
        preview: {
            id: `home-preview-${index}`,
            mediaType,
            mimeType: mediaType === "video" ? "video/mp4" : "image/svg+xml",
            url: mediaType === "video" ? "data:video/mp4;base64," : `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="hsl(${index * 48} 58% 62%)"/></svg>`)}`,
        },
    };
}

async function mockPublicWorkDetails(page: Page) {
    await page.route("**/api/public/works/**", async (route) => {
        const url = new URL(route.request().url());
        const segments = url.pathname.split("/").filter(Boolean);
        const slug = segments[3] || "";
        const suffix = segments[4];
        const item = galleryResponse.data.items.find((candidate) => candidate.slug === slug);
        if (!item) return route.fallback();
        if (suffix === "view") {
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, msg: "OK", data: { viewCount: item.viewCount + 1 } }) });
        }
        if (suffix === "community") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    code: 0,
                    msg: "OK",
                    data: { workId: `home-work-${slug}`, versionId: `home-version-${slug}`, slug, ownerUserId: "home-owner", authorDisplay: "custom", likeCount: item.likeCount, followerCount: 0, liked: false, followingAuthor: false, canFollow: false },
                }),
            });
        }
        if (suffix) return route.fallback();
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                code: 0,
                msg: "OK",
                data: {
                    work: {
                        id: `home-work-${slug}`,
                        slug,
                        sourceType: item.sourceType,
                        viewCount: item.viewCount,
                        likeCount: item.likeCount,
                        publishedAt: item.publishedAt,
                        title: item.title,
                        description: item.description,
                        publicPrompt: item.publicPrompt,
                        category: item.category,
                        tags: item.tags,
                        visibility: "public",
                        hasProcess: false,
                        authorName: item.authorName,
                        assets: [{ id: item.preview.id, mediaType: item.preview.mediaType, mimeType: item.preview.mimeType, role: "content", sortOrder: 0, metadata: {}, url: item.preview.url }],
                    },
                },
            }),
        });
    });
}
