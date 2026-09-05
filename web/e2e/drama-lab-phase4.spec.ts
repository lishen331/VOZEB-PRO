import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type DramaShotSeed = {
    id: string;
    order: number;
    title: string;
    description: string;
    sourceText: string;
    shotBoundary: string;
    dialogue: string;
    narration: string;
    utterances: [];
    imagePrompt: string;
    videoPrompt: string;
    cameraMotion: string;
    duration: number;
    characterIds: string[];
    propIds: string[];
    sceneId: string;
    storyboardStatus: "idle";
    generationStatus: "idle";
};

type DramaEpisodeSeed = {
    id: string;
    episodeNumber: number;
    title: string;
    script: string;
    outline: string;
    hook: string;
    nextPreview: string;
    sourceRange: string;
    reviewStatus: "draft";
    shots: DramaShotSeed[];
};

type SeededDrama = {
    id: string;
    firstEpisodeId: string;
    secondEpisodeId: string;
    shotId: string;
};

test.describe.configure({ mode: "serial" });

async function seedDramaProject(request: APIRequestContext): Promise<SeededDrama> {
    const suffix = randomUUID().slice(0, 8);
    const created = await request.post("/api/drama/projects", {
        data: {
            title: `Phase 4 浏览器回归 ${suffix}`,
            summary: "验证短剧实验室入口、分集画布和分镜定位",
            style: "电影感写实",
            ratio: "16:9",
        },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const createdPayload = (await created.json()) as { data: { project: { id: string; episodes: Array<{ id: string }> } } };
    const projectId = createdPayload.data.project.id;
    const firstEpisodeId = createdPayload.data.project.episodes[0]?.id;
    expect(firstEpisodeId).toBeTruthy();

    const secondEpisodeId = `e2e-episode-${suffix}`;
    const shotId = `e2e-shot-${suffix}`;
    const firstShot: DramaShotSeed = {
        id: `e2e-shot-first-${suffix}`,
        order: 1,
        title: "第一集开场",
        description: "主角在雨夜推开旧门。",
        sourceText: "主角在雨夜推开旧门。",
        shotBoundary: "",
        dialogue: "",
        narration: "",
        utterances: [],
        imagePrompt: "雨夜，旧门，电影感",
        videoPrompt: "镜头缓慢推进",
        cameraMotion: "推进",
        duration: 5,
        characterIds: ["character-lead"],
        propIds: ["prop-key"],
        sceneId: "scene-alley",
        storyboardStatus: "idle",
        generationStatus: "idle",
    };
    const secondShot: DramaShotSeed = {
        ...firstShot,
        id: shotId,
        title: "第二集线索",
        description: "主角在车站发现一张旧照片。",
        sourceText: "主角在车站发现一张旧照片。",
        imagePrompt: "清晨车站，旧照片，电影感",
        videoPrompt: "镜头从照片摇到主角",
        cameraMotion: "横摇",
    };
    const firstEpisode: DramaEpisodeSeed = {
        id: firstEpisodeId!,
        episodeNumber: 1,
        title: "第一集 · 雨夜",
        script: "主角在雨夜推开旧门。",
        outline: "雨夜收到线索。",
        hook: "门后有什么？",
        nextPreview: "线索指向车站。",
        sourceRange: "",
        reviewStatus: "draft",
        shots: [firstShot],
    };
    const secondEpisode: DramaEpisodeSeed = {
        id: secondEpisodeId,
        episodeNumber: 2,
        title: "第二集 · 车站",
        script: "主角在车站发现一张旧照片。",
        outline: "照片揭开新的线索。",
        hook: "照片中的人是谁？",
        nextPreview: "线索继续延伸。",
        sourceRange: "",
        reviewStatus: "draft",
        shots: [secondShot],
    };
    const updated = await request.put(`/api/drama-lab/projects/${encodeURIComponent(projectId)}`, {
        data: {
            title: `Phase 4 浏览器回归 ${suffix}`,
            summary: "验证短剧实验室入口、分集画布和分镜定位",
            style: "电影感写实",
            ratio: "16:9",
            episodes: [firstEpisode, secondEpisode],
            characters: [{ id: "character-lead", name: "主角", description: "谨慎的调查者" }],
            scenes: [{ id: "scene-alley", name: "旧巷", location: "旧巷", description: "潮湿的夜巷" }],
            props: [{ id: "prop-key", name: "旧钥匙", description: "一把生锈的钥匙" }],
        },
    });
    expect(updated.ok(), await updated.text()).toBe(true);
    return { id: projectId, firstEpisodeId: firstEpisodeId!, secondEpisodeId, shotId };
}

async function deleteDramaProject(request: APIRequestContext, projectId: string) {
    const response = await request.delete(`/api/drama/projects/${encodeURIComponent(projectId)}`);
    expect(response.ok(), await response.text()).toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
    const widths = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1);
}

async function openStoryboardStage(page: Page) {
    const storyboardStep = page.getByRole("button", { name: "3 分镜工作台", exact: true });
    await expect(storyboardStep).toBeVisible({ timeout: 30_000 });
    await storyboardStep.click();
    await expect(page.getByRole("heading", { name: "分镜工作台", exact: true })).toBeVisible({ timeout: 30_000 });
}

test("short drama lab opens the requested episode, locates a shot, and hands off to its episode Canvas", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop handoff assertion runs once; mobile layout has a dedicated test");
    const seeded = await seedDramaProject(request);
    try {
        await page.goto(`/drama-lab/${encodeURIComponent(seeded.id)}/create?episode=${encodeURIComponent(seeded.secondEpisodeId)}&stage=storyboard`, { waitUntil: "domcontentloaded" });
        await openStoryboardStage(page);
        await expect(page.getByText("第二集 · 车站", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("分镜 1 · 第二集线索", { exact: true })).toBeVisible();

        const sidebarToggle = page.getByRole("button", { name: "收起剧集侧栏" });
        if (await sidebarToggle.isVisible()) {
            await sidebarToggle.click();
            await expect(page.getByRole("button", { name: "展开剧集侧栏" })).toBeVisible();
            await page.getByRole("button", { name: "展开剧集侧栏" }).click();
            await expect(sidebarToggle).toBeVisible();
        }

        const shotLocator = page.getByRole("button", { name: /镜头 1: 主角在车站发现/ });
        if (await shotLocator.isVisible()) await shotLocator.click();
        await expect(page.locator(`#storyboard-shot-${seeded.shotId}`)).toBeVisible();

        const canvasLink = page.getByRole("link", { name: "在画布中打开此分镜" });
        await expect(canvasLink).toHaveAttribute("href", new RegExp(`episodeId=${seeded.secondEpisodeId}.*shotId=${seeded.shotId}`));
        await canvasLink.click();
        await expect(page).toHaveURL(/\/drama-canvas\/[^?]+\?.*dramaProjectId=/, { timeout: 45_000 });
        await expect(page.locator("[data-canvas-surface]")).toBeVisible({ timeout: 45_000 });
        await expect(page.getByRole("button", { name: "返回短剧分镜工作台" })).toBeVisible();
        await expect(page.getByRole("combobox", { name: "切换剧集" })).toBeVisible();

        await page.getByRole("button", { name: "返回短剧分镜工作台" }).click();
        await expect(page).toHaveURL(new RegExp(`/drama-lab/${seeded.id}/create\\?episode=${seeded.secondEpisodeId}.*stage=storyboard#storyboard-shot-${seeded.shotId}`), { timeout: 30_000 });
        await expect(page.locator(`#storyboard-shot-${seeded.shotId}`)).toBeVisible({ timeout: 30_000 });
    } finally {
        await deleteDramaProject(request, seeded.id);
    }
});

test("short drama Canvas switches episodes without crossing project bindings", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "desktop episode-switch assertion runs once");
    const seeded = await seedDramaProject(request);
    try {
        await page.goto(`/drama-lab/${encodeURIComponent(seeded.id)}/create?episode=${encodeURIComponent(seeded.firstEpisodeId)}&stage=storyboard`, { waitUntil: "domcontentloaded" });
        await openStoryboardStage(page);
        await page.getByRole("link", { name: "打开本集画布" }).click();
        await expect(page.locator("[data-canvas-surface]")).toBeVisible({ timeout: 45_000 });

        const episodePicker = page.getByRole("combobox", { name: "切换剧集" });
        await episodePicker.click();
        await episodePicker.press("ArrowDown");
        await episodePicker.press("Enter");
        await expect(page).toHaveURL(new RegExp(`episodeId=${seeded.secondEpisodeId}`), { timeout: 45_000 });
        await expect(episodePicker).toBeVisible();
        await expect(page.locator("[data-canvas-surface]")).toBeVisible();

        await page.getByRole("button", { name: "返回短剧分镜工作台" }).click();
        await expect(page).toHaveURL(new RegExp(`/drama-lab/${seeded.id}/create\\?episode=${seeded.secondEpisodeId}.*stage=storyboard`), { timeout: 30_000 });
        await expect(page.getByText("分镜 1 · 第二集线索", { exact: true })).toBeVisible({ timeout: 30_000 });
    } finally {
        await deleteDramaProject(request, seeded.id);
    }
});

test("short drama lab remains usable at 390px and 430px", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name === "chromium", "responsive assertion runs in the mobile projects");
    const seeded = await seedDramaProject(request);
    try {
        await page.goto(`/drama-lab/${encodeURIComponent(seeded.id)}/create?episode=${encodeURIComponent(seeded.secondEpisodeId)}&stage=storyboard`, { waitUntil: "domcontentloaded" });
        await openStoryboardStage(page);
        await expectNoHorizontalOverflow(page);
        await expect(page.getByRole("link", { name: "在画布中打开此分镜" })).toBeVisible();
        await page.getByRole("link", { name: "打开本集画布" }).click();
        await expect(page.locator("[data-canvas-surface]")).toBeVisible({ timeout: 45_000 });
        await expectNoHorizontalOverflow(page);
        await expect(page.getByRole("button", { name: "返回短剧分镜工作台" })).toBeVisible();
        expect(testInfo.project.name).toMatch(/^mobile-(390|430)$/);
    } finally {
        await deleteDramaProject(request, seeded.id);
    }
});
