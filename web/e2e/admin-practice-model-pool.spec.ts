import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test, type APIRequestContext, type APIResponse, type Page, type Response } from "@playwright/test";

import type { AuthSettings, LogicalModel, LogicalModelCapability, PracticeModelPoolConfig, PracticePoolKind, SystemChannelModelConfig, SystemModelChannel } from "../src/lib/auth/store-types";
import { e2eSettingsPatch } from "./support";

type SettingsEnvelope = { settings: AuthSettings; settingsRevision: number };
type Candidate = { upstreamModel: string; modelKey: string; channelId: string; inPool: boolean; supportsImageInput: boolean };
type Candidates = { pools: Record<PracticePoolKind, Candidate[]>; excluded: Array<{ channelId: string; code: string }> };
const KINDS = ["text", "vision", "image", "video", "audio"] as const;

// Runs only against the local E2E server and its explicitly configured isolated PostgreSQL database.
// No generation/connection-test endpoint is called, and all fixture upstreams use the local protocol server.
test("管理员五个练习模型池独立保存图片视频选择，不改生产默认模型", async ({ page, baseURL }) => {
    expect(new URL(baseURL!).hostname).toBe("127.0.0.1");
    const connectionString = process.env.VOZEB_PRO_E2E_DATABASE_URL?.trim();
    if (!connectionString) throw new Error("Model-pool persistence regression requires the dedicated E2E PostgreSQL database");
    const request = page.context().request;
    const original = await readSettings(request);
    const fixture = new Client({ connectionString });
    await fixture.connect();
    let configured = false;
    const suffix = randomUUID().slice(0, 8);
    const prefix = `e2e-pool-${suffix}`;
    const names = Object.fromEntries(KINDS.map((kind) => [kind, `${prefix}-${kind}`])) as Record<PracticePoolKind, string>;
    const productionName = `${prefix}-production-image`;
    const disabledName = `${prefix}-disabled-image`;
    const ownedKeys = [...Object.values(names), productionName, disabledName];
    const channels = [makeChannel(`${prefix}-practice`, Object.values(names), "open-source-practice", true), makeChannel(`${prefix}-production`, [productionName], "production", false), makeChannel(`${prefix}-disabled`, [disabledName], "shared", false)];
    const ownedChannelIds = new Set(channels.map((channel) => channel.id));
    const models: LogicalModel[] = channels.flatMap((channel) =>
        channel.models.map((name) => ({
            id: name,
            name,
            capability: modelCapability(name),
            enabled: true,
            bindings: [{ id: `${channel.id}:${name}`, channelId: channel.id, upstreamModel: name, enabled: true, priority: 1 }],
        })),
    );
    const poolBefore = await fixture.query<{ practice_model_pool: PracticeModelPoolConfig | null }>("SELECT practice_model_pool FROM vozeb_pro_app_settings WHERE id = 'default'");
    expect(poolBefore.rowCount).toBe(1);
    const originalPool = poolBefore.rows[0].practice_model_pool;
    try {
        configured = true;
        const seeded = await json<SettingsEnvelope>(
            await request.patch("/api/admin/settings", {
                data: { settingsRevision: original.settingsRevision, systemChannels: [...original.settings.systemChannels, ...channels], logicalModels: [...original.settings.logicalModels, ...models] },
            }),
        );
        expect(seeded.settingsRevision).toBeGreaterThan(original.settingsRevision);
        expect(seeded.settings.defaultModels).toEqual(original.settings.defaultModels);
        expect(seeded.settings.practiceDefaultModels).toEqual(original.settings.practiceDefaultModels);
        const candidates = await readCandidates(request);
        for (const kind of KINDS) {
            const own = candidates.pools[kind].filter((item) => ownedChannelIds.has(item.channelId));
            expect(own.map((item) => item.modelKey).sort(), `${kind} own candidates`).toEqual((kind === "text" ? [names.text, names.vision] : [names[kind]]).sort());
        }
        expect(candidates.pools.vision.find((item) => item.modelKey === names.vision)?.supportsImageInput).toBe(true);
        expect(candidates.pools.vision.some((item) => item.modelKey === names.text)).toBe(false);
        expect(candidates.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ channelId: channels[1].id, code: "purpose" }), expect.objectContaining({ channelId: channels[2].id, code: "switch" })]));
        for (const kind of ["image", "video"] as const) await json(await request.patch("/api/admin/practice-model-pool", { data: { pool: kind, updates: { [names[kind]]: false } } }));
        const baseline = await readSettings(request);
        await openPracticePool(page);
        await togglePoolModel(page, "图片", "image", names.image);
        const imageSaved = await readSettings(request);
        expect(imageSaved.settings.practiceModelPool?.pools?.image?.[names.image]).toBe(true);
        expect(imageSaved.settings.practiceModelPool?.pools?.video?.[names.video]).toBe(false);
        for (const kind of KINDS.filter((kind) => kind !== "image")) expect(imageSaved.settings.practiceModelPool?.pools?.[kind]).toEqual(baseline.settings.practiceModelPool?.pools?.[kind]);
        await togglePoolModel(page, "视频", "video", names.video);
        const saved = await readSettings(request);
        expect(saved.settings.practiceModelPool?.pools?.video?.[names.video]).toBe(true);
        expect(saved.settings.practiceModelPool?.pools?.image).toEqual(imageSaved.settings.practiceModelPool?.pools?.image);
        expect(saved.settings.practiceModelPool?.models).toEqual(baseline.settings.practiceModelPool?.models);
        expect(saved.settings.defaultModels).toEqual(original.settings.defaultModels);
        expect(saved.settings.practiceDefaultModels).toEqual(original.settings.practiceDefaultModels);
        await page.reload({ waitUntil: "domcontentloaded" });
        await openPracticePool(page, false);
        for (const [label, kind] of [
            ["图片", "image"],
            ["视频", "video"],
        ] as const) {
            await page.getByRole("button", { name: new RegExp(`^${label}\\s+\\d+/\\d+$`) }).click();
            await expect(modelRow(page, names[kind]).getByRole("checkbox")).toBeChecked();
            expect((await readCandidates(request)).pools[kind]).toContainEqual(expect.objectContaining({ modelKey: names[kind], channelId: channels[0].id, inPool: true }));
        }
    } finally {
        await page.close();
        try {
            if (configured) {
                const current = await readSettings(request);
                await json(
                    await request.patch("/api/admin/settings", {
                        data: {
                            settingsRevision: current.settingsRevision,
                            systemChannels: current.settings.systemChannels.filter((channel) => !ownedChannelIds.has(channel.id)),
                            logicalModels: current.settings.logicalModels.filter((model) => !ownedKeys.includes(model.id)),
                        },
                    }),
                );
                // The public pool PATCH can set booleans but cannot delete keys. Remove only this test's keys
                // under a QA row lock; preserve unrelated writes and the original null/object shape.
                await fixture.query("BEGIN");
                try {
                    const row = await fixture.query<{ practice_model_pool: PracticeModelPoolConfig | null }>("SELECT practice_model_pool FROM vozeb_pro_app_settings WHERE id = 'default' FOR UPDATE");
                    const cleaned = structuredClone(row.rows[0].practice_model_pool);
                    if (cleaned) {
                        for (const key of ownedKeys) delete cleaned.models?.[key];
                        for (const kind of KINDS) {
                            for (const key of ownedKeys) delete cleaned.pools?.[kind]?.[key];
                            if (cleaned.pools?.[kind] && !Object.keys(cleaned.pools[kind]!).length && !originalPool?.pools?.[kind]) delete cleaned.pools[kind];
                        }
                        if (cleaned.pools && !Object.keys(cleaned.pools).length && !originalPool?.pools) delete cleaned.pools;
                    }
                    const restored = originalPool === null && cleaned && !Object.keys(cleaned.models || {}).length && !Object.keys(cleaned.pools || {}).length ? null : cleaned;
                    await fixture.query("UPDATE vozeb_pro_app_settings SET practice_model_pool = $1::jsonb, settings_revision = settings_revision + 1 WHERE id = 'default'", [restored === null ? null : JSON.stringify(restored)]);
                    await fixture.query("COMMIT");
                } catch (error) {
                    await fixture.query("ROLLBACK");
                    throw error;
                }
                const restored = await readSettings(request); // Fresh GET also invalidates the app's short-lived settings cache.
                expect(restored.settings.systemChannels.some((channel) => ownedChannelIds.has(channel.id))).toBe(false);
                expect(restored.settings.logicalModels.some((model) => ownedKeys.includes(model.id))).toBe(false);
            }
        } finally {
            await fixture.end();
        }
    }
});

function modelCapability(name: string): LogicalModelCapability {
    return name.endsWith("-image") ? "image" : name.endsWith("-video") ? "video" : name.endsWith("-audio") ? "audio" : "text";
}

function makeChannel(id: string, models: string[], purpose: SystemModelChannel["purpose"], practiceEnabled: boolean): SystemModelChannel {
    const template = e2eSettingsPatch().systemChannels[0];
    const modelConfigs = Object.fromEntries(
        models.map((name) => [
            name,
            {
                ...template.advancedConfig.operationConfigs[modelCapability(name)],
                supportsImageInput: name.endsWith("-vision"),
            } satisfies SystemChannelModelConfig,
        ]),
    );
    return {
        ...template,
        id,
        name: id,
        apiFormat: "openai",
        apiKey: "local-model-pool-fixture-only",
        models,
        enabled: purpose === "production",
        practiceEnabled,
        purpose,
        advancedConfig: { ...template.advancedConfig, protocol: "openai", authMode: "bearer", modelCapabilities: Object.fromEntries(models.map((name) => [name, modelCapability(name)])), modelConfigs },
    };
}

async function openPracticePool(page: Page, navigate = true) {
    if (navigate) await page.goto("/admin?section=channels", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-hydrated='true']")).toBeVisible();
    await page.getByRole("tab", { name: "逻辑模型", exact: true }).click();
    await page.getByRole("radio", { name: "无限练习", exact: true }).click();
    for (const label of ["文本", "文本 · 图片理解", "图片", "视频", "音频"]) await expect(page.getByRole("button", { name: new RegExp(`^${label}\\s+\\d+/\\d+$`) })).toBeVisible();
}

function modelRow(page: Page, model: string) {
    return page
        .locator("div.rounded-md.border")
        .filter({ has: page.getByText(model, { exact: true }) })
        .filter({ has: page.getByRole("checkbox") })
        .last();
}

async function togglePoolModel(page: Page, label: string, kind: PracticePoolKind, model: string) {
    await page.getByRole("button", { name: new RegExp(`^${label}\\s+\\d+/\\d+$`) }).click();
    const row = modelRow(page, model);
    await expect(row.getByRole("checkbox")).not.toBeChecked();
    const response = page.waitForResponse((value) => new URL(value.url()).pathname === "/api/admin/practice-model-pool" && value.request().method() === "PATCH");
    await row.locator("label").click(); // Gamma checkbox input is sr-only; click its visible label.
    const saved = await response;
    expect(saved.request().postDataJSON()).toEqual({ pool: kind, updates: { [model]: true } });
    await json(saved);
    await expect(row.getByRole("checkbox")).toBeChecked();
}

async function json<T = unknown>(response: APIResponse | Response): Promise<T> {
    const text = await response.text();
    expect(response.ok(), `${response.status()} ${text}`).toBe(true);
    return JSON.parse(text) as T;
}

async function readSettings(request: APIRequestContext) {
    return json<SettingsEnvelope>(await request.get("/api/admin/settings"));
}
async function readCandidates(request: APIRequestContext) {
    return json<Candidates>(await request.get("/api/admin/practice-model-pool/candidates"));
}
