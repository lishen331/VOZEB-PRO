import { afterEach, describe, expect, it, vi } from "vitest";
import { bindingVerificationDiagnosticsJson, assertBindingVerificationSaved, bindingVerificationProjection, bindingVerificationSessionKey, hasUnsavedBindingSecrets } from "./binding-verifications";
import { emptyAdvancedConfig } from "@/lib/channel-protocol-registry";
import type { LogicalModel, SystemModelChannel } from "@/lib/auth/store";
const binding = { id: "b", channelId: "c", upstreamModel: "m", enabled: false, priority: 1 };
const model: LogicalModel = { id: "l", name: "label", enabled: true, capability: "video", bindings: [binding] };
const channel: SystemModelChannel = { id: "c", name: "C", apiKey: "", apiFormat: "openai", baseUrl: "https://fixture.invalid", models: ["m"], enabled: true, advancedConfig: emptyAdvancedConfig() };
describe("binding configuration projection", () => {
    it("exports only public diagnostic fields and includes both task IDs", () => {
        const data = { id: "test", platformTaskId: "platform", upstreamTaskId: "provider", status: "failed" as const, phase: "query", diagnostics: { error: "safe" }, channel: { apiKey: "private" } };
        const json = bindingVerificationDiagnosticsJson(data);
        expect(JSON.parse(json)).toMatchObject({ id: "test", platformTaskId: "platform", upstreamTaskId: "provider" });
        expect(json).not.toContain("private");
        expect(json).not.toContain("channel");
    });
    afterEach(() => vi.unstubAllGlobals());
    it("compares saved configuration canonically and blocks secret edits before requesting", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ settings: { logicalModels: [model], systemChannels: [{ ...channel, advancedConfig: Object.fromEntries(Object.entries(channel.advancedConfig!).reverse()) }] } })));
        vi.stubGlobal("fetch", fetcher);
        await expect(assertBindingVerificationSaved(model, binding, channel)).resolves.toBeUndefined();
        await expect(assertBindingVerificationSaved(model, binding, { ...channel, clearApiKey: true })).rejects.toThrow("密钥");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it("hashes session keys without persisting configuration values", async () => {
        const key = await bindingVerificationSessionKey("l", "b", "private-template");
        expect(key).not.toContain("private-template");
        expect(key).toMatch(/:[a-f0-9]{64}$/);
    });
    it("ignores object order, labels and unrelated model configuration", () => {
        const changed = { ...channel, name: "new", models: ["m", "other"], advancedConfig: { ...channel.advancedConfig!, modelConfigs: { other: { capability: "image" as const, createPath: "/other" } } } };
        expect(bindingVerificationProjection(model, binding, channel)).toBe(bindingVerificationProjection({ ...model, name: "other" }, { ...binding, priority: 8 }, changed));
    });
    it("tracks actual bound model operation", () => {
        expect(bindingVerificationProjection(model, binding, channel)).not.toBe(
            bindingVerificationProjection(model, binding, { ...channel, advancedConfig: { ...channel.advancedConfig!, modelConfigs: { m: { capability: "video", createPath: "/new" } } } }),
        );
    });
    it("blocks pending secret changes without embedding secret values in projections", () => {
        expect(hasUnsavedBindingSecrets({ ...channel, apiKey: "secret" })).toBe(true);
        expect(hasUnsavedBindingSecrets({ ...channel, clearApiKey: true })).toBe(true);
        expect(hasUnsavedBindingSecrets({ ...channel, webhookSecret: "secret" })).toBe(true);
        expect(hasUnsavedBindingSecrets(channel)).toBe(false);
        expect(bindingVerificationProjection(model, binding, { ...channel, apiKey: "secret" })).not.toContain("secret");
    });
});
