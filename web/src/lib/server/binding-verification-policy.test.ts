import { describe, expect, it, vi } from "vitest";
import type { LogicalModel, LogicalModelBinding, SystemModelChannel } from "@/lib/auth/store";
import { normalizeSystemChannelAdvancedConfig } from "@/lib/auth/store-normalizers-channel";
import { bindingVerificationFingerprint, assertBindingVerificationChanges } from "./binding-verification-policy";
const b: LogicalModelBinding = { id: "b", channelId: "c", upstreamModel: "writer", enabled: false, priority: 1 };
const m: LogicalModel = { id: "writer", name: "writer", capability: "text", enabled: true, bindings: [b] };
const c: SystemModelChannel = { id: "c", name: "channel", baseUrl: "https://example.com/v1", apiKey: "secret", apiFormat: "openai", models: ["writer"], enabled: true };
const settings = (binding = b, channel = c) => ({ logicalModels: [{ ...m, bindings: [binding] }], systemChannels: [channel] });
describe("binding verification policy", () => {
    it("does not expose credentials and ignores enable state and ranking", () => {
        const fp = bindingVerificationFingerprint(m, b, c);
        expect(fp).toMatch(/^[a-f0-9]{64}$/);
        expect(bindingVerificationFingerprint(m, { ...b, enabled: true, priority: 99 }, c)).toBe(fp);
    });
    it("invalidates proof for credentials, target, capability and endpoint changes", () => {
        const fp = bindingVerificationFingerprint(m, b, c);
        expect(bindingVerificationFingerprint(m, b, { ...c, apiKey: "other" })).not.toBe(fp);
        expect(bindingVerificationFingerprint(m, { ...b, upstreamModel: "other" }, c)).not.toBe(fp);
        expect(bindingVerificationFingerprint({ ...m, capability: "image" }, b, c)).not.toBe(fp);
        expect(bindingVerificationFingerprint(m, b, { ...c, baseUrl: "https://other.example" })).not.toBe(fp);
    });
    it("preserves enabled bindings with unchanged execution config without inventing proof", async () => {
        const lookup = vi.fn();
        await assertBindingVerificationChanges(settings({ ...b, enabled: true }), settings({ ...b, enabled: true }), lookup);
        expect(lookup).not.toHaveBeenCalled();
    });
    it("allows enabling without server evidence and returns a warning", async () => {
        const warnings = await assertBindingVerificationChanges(settings(), settings({ ...b, enabled: true }), async () => false);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toContain("尚无当前配置的成功生成记录");
    });
    it("accepts enabling only the matching tested fingerprint", async () => {
        const fp = bindingVerificationFingerprint(m, b, c);
        await expect(assertBindingVerificationChanges(settings(), settings({ ...b, enabled: true }), async (v) => v === fp)).resolves.toEqual([]);
    });
    it("allows enabled execution changes but returns a warning when proof is stale", async () => {
        const warnings = await assertBindingVerificationChanges(settings({ ...b, enabled: true }), settings({ ...b, enabled: true }, { ...c, apiKey: "new" }), async () => false);
        expect(warnings).toHaveLength(1);
    });
    it("allows creating an enabled binding with an explicit warning", async () => {
        const warnings = await assertBindingVerificationChanges({ logicalModels: [], systemChannels: [c] }, settings({ ...b, enabled: true }), async () => false);
        expect(warnings[0].bindingId).toBe("b");
    });
    it("allows disabling and leaves RunningHub out of scope", async () => {
        const lookup = vi.fn();
        await assertBindingVerificationChanges(settings({ ...b, enabled: true }), settings(), lookup);
        await assertBindingVerificationChanges(settings(), settings({ ...b, enabled: true }, { ...c, advancedConfig: normalizeSystemChannelAdvancedConfig({ protocol: "runninghub" }) }), lookup);
        expect(lookup).not.toHaveBeenCalled();
    });
});
