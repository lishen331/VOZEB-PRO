import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveLogicalBillingModel, resolveLogicalModel, resolveLogicalModelCandidates, resolveVisionModelCandidates } from "./logical-model-router";
import { releaseChannelReservations, reserveChannelSlot, resetChannelConcurrency } from "./channel-concurrency";

const channel = (id: string, models: string[], enabled = true) => ({ id, name: id, baseUrl: `https://${id}.example.com`, apiKey: "secret", apiFormat: "openai" as const, models, enabled });

describe("resolveLogicalModel", () => {
    it("deduplicates a logical model while routing to its highest priority enabled binding", () => {
        const settings = {
            systemChannels: [channel("primary", ["vendor/gpt-4o"], false), channel("backup", ["gpt-4o-proxy"])],
            logicalModels: [
                {
                    id: "gpt-4o",
                    name: "GPT-4o",
                    capability: "text" as const,
                    enabled: true,
                    bindings: [
                        { id: "one", channelId: "primary", upstreamModel: "vendor/gpt-4o", enabled: true, priority: 1 },
                        { id: "two", channelId: "backup", upstreamModel: "gpt-4o-proxy", enabled: true, priority: 2 },
                    ],
                },
            ],
        };
        expect(resolveLogicalModel(settings, "text", "gpt-4o")).toMatchObject({ logicalModelId: "gpt-4o", channelId: "backup", upstreamModel: "gpt-4o-proxy" });
    });

    it("returns all usable bindings in priority order", () => {
        const settings = {
            systemChannels: [channel("primary", ["writer-v1"]), channel("backup", ["writer-v2"])],
            logicalModels: [
                {
                    id: "writer",
                    name: "Writer",
                    capability: "text" as const,
                    enabled: true,
                    bindings: [
                        { id: "two", channelId: "backup", upstreamModel: "writer-v2", enabled: true, priority: 2 },
                        { id: "one", channelId: "primary", upstreamModel: "writer-v1", enabled: true, priority: 1 },
                    ],
                },
            ],
        };
        expect(resolveLogicalModelCandidates(settings, "text", "writer").map((item) => item.channelId)).toEqual(["primary", "backup"]);
        expect(resolveLogicalModelCandidates(settings, "text", "writer", "backup").map((item) => item.channelId)).toEqual(["backup", "primary"]);
    });

    it("uses binding weight inside the same priority and exposes capability limits", () => {
        const settings = {
            systemChannels: [channel("low", ["video-low"]), channel("high", ["video-high"])],
            logicalModels: [
                {
                    id: "video",
                    name: "Video",
                    capability: "video" as const,
                    enabled: true,
                    bindings: [
                        { id: "low", channelId: "low", upstreamModel: "video-low", enabled: true, priority: 1, weight: 10 },
                        { id: "high", channelId: "high", upstreamModel: "video-high", enabled: true, priority: 1, weight: 100, capabilityProfile: { supportsReferenceImage: true, maxReferenceImages: 2, maxDurationSeconds: 10, timeoutMs: 12 * 60_000 } },
                    ],
                },
            ],
        };

        const candidates = resolveLogicalModelCandidates(settings, "video", "video");
        expect(candidates.map((item) => item.channelId)).toEqual(["high", "low"]);
        expect(candidates[0].capabilityProfile).toMatchObject({ supportsReferenceImage: true, maxReferenceImages: 2, maxDurationSeconds: 10, timeoutMs: 12 * 60_000 });
    });

    it("does not route a logical model through a binding missing from the channel model list", () => {
        const settings = {
            systemChannels: [channel("one", ["other-model"])],
            logicalModels: [{ id: "voice", name: "Voice", capability: "audio" as const, enabled: true, bindings: [{ id: "one", channelId: "one", upstreamModel: "voice-upstream", enabled: true, priority: 1 }] }],
        };
        expect(resolveLogicalModel(settings, "audio", "voice")).toBeNull();
    });

    it("rejects raw upstream model names when a logical catalog exists", () => {
        const settings = {
            systemChannels: [channel("primary", ["vendor/writer-v2"])],
            logicalModels: [{ id: "writer", name: "Writer", capability: "text" as const, enabled: true, bindings: [{ id: "one", channelId: "primary", upstreamModel: "vendor/writer-v2", enabled: true, priority: 1 }] }],
        };
        expect(resolveLogicalModel(settings, "text", "vendor/writer-v2")).toBeNull();
        expect(resolveLogicalModel(settings, "text", "writer")).toMatchObject({ logicalModelId: "writer", upstreamModel: "vendor/writer-v2" });
    });

    it("routes SD2.0 as video while keeping full Stable Diffusion names on image", () => {
        const settings = {
            systemChannels: [channel("primary", ["sd2.0", "stable-diffusion-2.0"])],
            logicalModels: [
                { id: "sd2.0", name: "Seedance 2.0", capability: "video" as const, enabled: true, bindings: [{ id: "one", channelId: "primary", upstreamModel: "sd2.0", enabled: true, priority: 1 }] },
                { id: "stable-diffusion-2.0", name: "Stable Diffusion 2.0", capability: "image" as const, enabled: true, bindings: [{ id: "two", channelId: "primary", upstreamModel: "stable-diffusion-2.0", enabled: true, priority: 1 }] },
            ],
        };

        expect(resolveLogicalModel(settings, "video", "sd2.0")?.upstreamModel).toBe("sd2.0");
        expect(resolveLogicalModel(settings, "image", "stable-diffusion-2.0")?.upstreamModel).toBe("stable-diffusion-2.0");
        expect(resolveLogicalModel(settings, "image", "sd2.0")).toBeNull();
    });

    it("uses the logical model id as the billing key for its bound upstream model", () => {
        const logicalModels = [{ id: "writer", name: "Writer", capability: "text" as const, enabled: true, bindings: [{ id: "one", channelId: "primary", upstreamModel: "vendor/writer-v2", enabled: true, priority: 1 }] }];

        expect(resolveLogicalBillingModel(logicalModels, "text", "primary", "vendor/writer-v2")).toBe("writer");
        expect(resolveLogicalBillingModel(logicalModels, "text", "other", "vendor/writer-v2")).toBe("vendor/writer-v2");
    });

    it("uses normalized model equivalence when resolving the billing key", () => {
        const logicalModels = [{ id: "gemini", name: "Gemini", capability: "text" as const, enabled: true, bindings: [{ id: "one", channelId: "primary", upstreamModel: "models/GEMINI-2.5", enabled: true, priority: 1 }] }];

        expect(resolveLogicalBillingModel(logicalModels, "text", "primary", "gemini-2.5")).toBe("gemini");
    });

    it("honors a validated preferred logical model when bindings share an upstream alias", () => {
        const logicalModels = [
            { id: "writer-basic", name: "Basic", capability: "text" as const, enabled: true, bindings: [{ id: "one", channelId: "primary", upstreamModel: "vendor/shared", enabled: true, priority: 1 }] },
            { id: "writer-pro", name: "Pro", capability: "text" as const, enabled: true, bindings: [{ id: "two", channelId: "primary", upstreamModel: "vendor/shared", enabled: true, priority: 1 }] },
        ];

        expect(resolveLogicalBillingModel(logicalModels, "text", "primary", "vendor/shared", "writer-pro")).toBe("writer-pro");
        expect(resolveLogicalBillingModel(logicalModels, "text", "primary", "vendor/shared", "forged-model")).toBe("writer-basic");
    });

    it("does not route a text model as vision without an image-input flag", () => {
        const settings = {
            systemChannels: [channel("primary", ["gpt-5.6-sol"])],
            logicalModels: [{ id: "gpt-5.6-sol", name: "GPT-5.6 Sol", capability: "text" as const, enabled: true, bindings: [{ id: "one", channelId: "primary", upstreamModel: "gpt-5.6-sol", enabled: true, priority: 1 }] }],
        };

        expect(resolveVisionModelCandidates(settings, "gpt-5.6-sol")).toEqual([]);
    });

    it("routes a text model as vision only when the binding supports image input", () => {
        const settings = {
            systemChannels: [channel("primary", ["gpt-5.6-sol"])],
            logicalModels: [
                {
                    id: "gpt-5.6-sol",
                    name: "GPT-5.6 Sol",
                    capability: "text" as const,
                    enabled: true,
                    bindings: [{ id: "one", channelId: "primary", upstreamModel: "gpt-5.6-sol", enabled: true, priority: 1, capabilityProfile: { supportsImageInput: true } }],
                },
            ],
        };

        expect(resolveVisionModelCandidates(settings, "gpt-5.6-sol")).toMatchObject([{ logicalModelId: "gpt-5.6-sol", upstreamModel: "gpt-5.6-sol", channelId: "primary", capabilityProfile: { supportsImageInput: true } }]);
    });
});

describe("concurrency-aware candidate ordering", () => {
    const imageSettings = {
        systemChannels: [channel("primary", ["img-v1"]), channel("backup", ["img-v1"])],
        logicalModels: [
            {
                id: "painter",
                name: "Painter",
                capability: "image" as const,
                enabled: true,
                bindings: [
                    { id: "one", channelId: "primary", upstreamModel: "img-v1", enabled: true, priority: 1, capabilityProfile: { concurrencyLimit: 1 } },
                    { id: "two", channelId: "backup", upstreamModel: "img-v1", enabled: true, priority: 2, capabilityProfile: { concurrencyLimit: 1 } },
                ],
            },
        ],
    };

    beforeEach(() => {
        vi.stubEnv("VOZEB_PRO_DATABASE_PROVIDER", "file");
        resetChannelConcurrency();
    });
    afterEach(() => vi.unstubAllEnvs());

    it("drops a saturated channel so the caller fails over to the next one", async () => {
        expect(resolveLogicalModelCandidates(imageSettings, "image", "painter").map((item) => item.channelId)).toEqual(["primary", "backup"]);
        expect(await reserveChannelSlot("image", "primary", "img-v1", "r1", 1)).toBe(true);
        expect(resolveLogicalModelCandidates(imageSettings, "image", "painter").map((item) => item.channelId)).toEqual(["backup"]);
    });

    it("keeps the first candidate when every channel is saturated instead of returning none", async () => {
        await reserveChannelSlot("image", "primary", "img-v1", "r1", 1);
        await reserveChannelSlot("image", "backup", "img-v1", "r2", 1);
        expect(resolveLogicalModelCandidates(imageSettings, "image", "painter").map((item) => item.channelId)).toEqual(["primary", "backup"]);
    });

    it("restores the channel once its in-flight request finishes", async () => {
        await reserveChannelSlot("image", "primary", "img-v1", "r1", 1);
        await releaseChannelReservations(["r1"]);
        expect(resolveLogicalModelCandidates(imageSettings, "image", "painter").map((item) => item.channelId)).toEqual(["primary", "backup"]);
    });

    const overflowSettings = {
        systemChannels: [channel("primary", ["img-v1"]), channel("other", ["img-v2"]), channel("off", ["img-v3"])],
        logicalModels: [
            { id: "painter", name: "Painter", capability: "image" as const, enabled: true, bindings: [{ id: "one", channelId: "primary", upstreamModel: "img-v1", enabled: true, priority: 1, capabilityProfile: { concurrencyLimit: 1 } }] },
            { id: "sketcher", name: "Sketcher", capability: "image" as const, enabled: true, bindings: [{ id: "two", channelId: "other", upstreamModel: "img-v2", enabled: true, priority: 1 }] },
            { id: "disabled", name: "Disabled", capability: "image" as const, enabled: false, bindings: [{ id: "three", channelId: "off", upstreamModel: "img-v3", enabled: true, priority: 1 }] },
        ],
    };

    it("keeps its own channel first and other enabled image models as overflow, billing as the requested model", () => {
        const candidates = resolveLogicalModelCandidates(overflowSettings, "image", "painter");
        expect(candidates.map((item) => [item.channelId, item.upstreamModel, item.logicalModelId])).toEqual([
            ["primary", "img-v1", "painter"],
            ["other", "img-v2", "painter"],
        ]);
        expect(candidates.map((item) => item.overflow)).toEqual([undefined, true]);
    });

    it("shuffles overflow routes per request", () => {
        const many = {
            systemChannels: [channel("primary", ["img-v1"]), channel("a", ["img-a"]), channel("b", ["img-b"]), channel("c", ["img-c"])],
            logicalModels: [
                { id: "painter", name: "Painter", capability: "image" as const, enabled: true, bindings: [{ id: "p", channelId: "primary", upstreamModel: "img-v1", enabled: true, priority: 1 }] },
                ...["a", "b", "c"].map((id) => ({ id: `m-${id}`, name: id, capability: "image" as const, enabled: true, bindings: [{ id: `b-${id}`, channelId: id, upstreamModel: `img-${id}`, enabled: true, priority: 1 }] })),
            ],
        };
        const orders = new Set<string>();
        for (let i = 0; i < 40; i++) {
            const ids = resolveLogicalModelCandidates(many, "image", "painter").map((item) => item.channelId);
            expect(ids[0]).toBe("primary");
            expect([...ids.slice(1)].sort()).toEqual(["a", "b", "c"]);
            orders.add(ids.join(","));
        }
        expect(orders.size).toBeGreaterThan(1);
    });

    it("does not add overflow routes for non-image capabilities", () => {
        const text = {
            systemChannels: [channel("t1", ["txt-1"]), channel("t2", ["txt-2"])],
            logicalModels: [
                { id: "writer", name: "Writer", capability: "text" as const, enabled: true, bindings: [{ id: "w", channelId: "t1", upstreamModel: "txt-1", enabled: true, priority: 1 }] },
                { id: "other", name: "Other", capability: "text" as const, enabled: true, bindings: [{ id: "o", channelId: "t2", upstreamModel: "txt-2", enabled: true, priority: 1 }] },
            ],
        };
        expect(resolveLogicalModelCandidates(text, "text", "writer").map((item) => item.channelId)).toEqual(["t1"]);
    });
});
