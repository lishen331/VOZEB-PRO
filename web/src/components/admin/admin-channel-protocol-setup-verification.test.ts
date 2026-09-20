import { describe, expect, it } from "vitest";
import type { ChannelProtocolDraft } from "@/lib/channel-protocol-draft";
import type { SystemModelChannel } from "@/lib/auth/store";
import { buildProtocolDraftPatch, selectProtocolVerificationDraft } from "./admin-channel-protocol-setup";
const channel: SystemModelChannel = { id: "c", name: "C", baseUrl: "https://fixture.test", apiKey: "never-send", apiFormat: "openai", models: ["video"], enabled: true };
const draft = (model = "video", path = "/fresh-submit"): ChannelProtocolDraft => ({
    baseUrl: "https://fixture.test",
    apiFormat: "openai",
    authMode: "bearer",
    modelCatalogPaths: [],
    operations: [{ apiFormat: "openai", capability: "video", models: [model], config: { capability: "video", createPath: path } }],
    summary: [],
    assisted: true,
});
describe("analysis and verification draft handoff", () => {
    it("uses the freshly returned matching model, not a previous selection", () => {
        const fresh = draft("models/VIDEO");
        const selected = selectProtocolVerificationDraft([draft("other", "/wrong"), fresh], "video");
        expect(selected).toBe(fresh);
        const patch = buildProtocolDraftPatch(channel, selected, "https://fixture.test/docs");
        expect(patch.advancedConfig?.modelConfigs?.video.createPath).toBe("/fresh-submit");
        expect(patch).not.toHaveProperty("apiKey");
        expect(JSON.stringify(patch)).not.toContain("never-send");
    });
    it("stops before a paid request for missing, mismatched or ambiguous fresh drafts", () => {
        for (const drafts of [[], [draft("other")], [draft(), draft()], [{ ...draft(), operations: [] }]]) expect(() => selectProtocolVerificationDraft(drafts, "video")).toThrow("未唯一匹配");
    });
    it("accepts a sole generic draft but does not guess among generic protocols", () => {
        const generic = { ...draft(), operations: [{ ...draft().operations[0], models: [] }] };
        expect(selectProtocolVerificationDraft([generic], "video")).toBe(generic);
        expect(() => selectProtocolVerificationDraft([generic, generic], "video")).toThrow();
    });
    it("builds a patch without mutating channel configuration or drafts", () => {
        const before = JSON.stringify(channel);
        const source = draft();
        const beforeDraft = JSON.stringify(source);
        buildProtocolDraftPatch(channel, source, "");
        expect(JSON.stringify(channel)).toBe(before);
        expect(JSON.stringify(source)).toBe(beforeDraft);
    });
});
