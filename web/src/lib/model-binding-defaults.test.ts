import { describe, expect, it } from "vitest";
import { synchronizeLogicalModelsWithChannels } from "./model-routing-config";
import type { LogicalModel, SystemModelChannel } from "@/lib/auth/store";
const channel: SystemModelChannel = { id: "c", name: "channel", baseUrl: "https://example.com", apiKey: "secret", apiFormat: "openai", models: ["writer"], enabled: true };
const model: LogicalModel = { id: "writer", name: "writer", capability: "text", enabled: true, bindings: [{ id: "b", channelId: "c", upstreamModel: "writer", priority: 1, enabled: true }] };
describe("binding verification defaults", () => {
    it("keeps new bindings disabled without disabling the channel or logical model", () => {
        const result = synchronizeLogicalModelsWithChannels([], [channel]);
        expect(result[0].bindings[0].enabled).toBe(false);
        expect(result[0].enabled).toBe(true);
        expect(channel.enabled).toBe(true);
    });
    it("preserves an existing enabled binding and closes only newly discovered bindings", () => {
        const result = synchronizeLogicalModelsWithChannels([model], [channel, { ...channel, id: "new" }]);
        expect(result[0].bindings.find((b) => b.channelId === "c")?.enabled).toBe(true);
        expect(result[0].bindings.find((b) => b.channelId === "new")?.enabled).toBe(false);
    });
    it("does not reenable disabled bindings when refreshing catalog", () => {
        const result = synchronizeLogicalModelsWithChannels([{ ...model, bindings: [{ ...model.bindings[0], enabled: false }] }], [channel], "detect");
        expect(result[0].bindings[0].enabled).toBe(false);
    });
});
