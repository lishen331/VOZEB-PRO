import { describe, expect, it } from "vitest";
import type { LogicalModelBinding, SystemModelChannel } from "@/lib/auth/store";
import { applyChannelProtocol } from "@/lib/channel-protocol-registry";
import { bindingToggleNeedsVerification, scopeProtocolPatchToBinding } from "./admin-logical-model-manager";
const binding: LogicalModelBinding = { id: "b", channelId: "c", upstreamModel: "m", enabled: false, priority: 1 };
const channel: SystemModelChannel = { id: "c", name: "C", baseUrl: "https://fixture.test", apiKey: "", apiFormat: "openai", models: ["m", "other"], enabled: true };
describe("binding enable interaction", () => {
    it("gates only off-to-on for regular channels", () => {
        expect(bindingToggleNeedsVerification(binding, channel, true, "video")).toBe(true);
        expect(bindingToggleNeedsVerification(binding, channel, false, "video")).toBe(false);
        expect(bindingToggleNeedsVerification({ ...binding, enabled: true }, channel, true, "video")).toBe(false);
        expect(bindingToggleNeedsVerification(binding, { ...channel, advancedConfig: { protocol: "runninghub" } as SystemModelChannel["advancedConfig"] }, true, "video")).toBe(false);
        expect(bindingToggleNeedsVerification(binding, channel, true, "audio")).toBe(true);
    });
    it("only applies the target model operation, preserving sibling and channel-wide configuration", () => {
        const advanced = {
            ...applyChannelProtocol(channel, "custom").advancedConfig!,
            protocol: "custom",
            operationConfigs: { video: { capability: "video", createPath: "/video" } },
            modelConfigs: { other: { capability: "image", createPath: "/other" } },
        } as SystemModelChannel["advancedConfig"];
        const current = { ...channel, advancedConfig: advanced };
        const patch = scopeProtocolPatchToBinding(current, binding, "video", { ...current, advancedConfig: { ...advanced!, operationConfigs: { video: { capability: "video", createPath: "/fixed" } } } });
        expect(patch.advancedConfig?.modelConfigs?.m.createPath).toBe("/fixed");
        expect(patch.advancedConfig?.modelConfigs?.other.createPath).toBe("/other");
        expect(patch.advancedConfig?.operationConfigs?.video?.createPath).toBe("/video");
        expect(patch).not.toHaveProperty("baseUrl");
    });
    it("ignores assistant Base URL suggestions and still applies the target model config", () => {
        const advanced = {
            ...applyChannelProtocol(channel, "custom").advancedConfig!,
            protocol: "custom",
            operationConfigs: { image: { capability: "image", createPath: "/image/submit" } },
        } as SystemModelChannel["advancedConfig"];
        const current = { ...channel, advancedConfig: advanced };
        const patch = scopeProtocolPatchToBinding(current, binding, "image", {
            baseUrl: "https://api.modelbay.io/pricing",
            advancedConfig: {
                ...advanced!,
                operationConfigs: { image: { capability: "image", createPath: "/image/submit", queryPath: "/image/fetch/:task_id" } },
            },
        });
        expect(patch).not.toHaveProperty("baseUrl");
        expect(patch.advancedConfig?.modelConfigs?.m.createPath).toBe("/image/submit");
        expect(patch.advancedConfig?.modelConfigs?.m.queryPath).toBe("/image/fetch/:task_id");
    });
});
