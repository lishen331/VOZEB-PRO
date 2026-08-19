import { describe, expect, it } from "vitest";

import { ipReferenceFromQuery, selectedIpItemIds, upsertIpReference } from "./ip-reference-picker";

describe("IP reference picker contract", () => {
    it("pins a query handoff to one stable full version reference", () => {
        expect(ipReferenceFromQuery(new URLSearchParams("ipId=ip-one&versionId=version-three"))).toEqual({ type: "ip", id: "ip-one", versionId: "version-three", itemIds: [] });
        expect(ipReferenceFromQuery(new URLSearchParams("ipId=ip-one"))).toBeUndefined();
    });

    it("uses an empty item list for a full version and validates partial selections", () => {
        expect(selectedIpItemIds("all", ["item-one"], ["item-one", "item-two"])).toEqual([]);
        expect(selectedIpItemIds("items", ["item-two", "missing"], ["item-one", "item-two"])).toEqual(["item-two"]);
        expect(() => selectedIpItemIds("items", [], ["item-one"])).toThrow("至少选择一个 IP 内容项");
    });

    it("replaces the same pinned version instead of creating duplicate references", () => {
        const original = { type: "ip" as const, id: "ip-one", versionId: "version-one", itemIds: [] };
        const replacement = { ...original, itemIds: ["item-one"] };
        expect(upsertIpReference([original], replacement)).toEqual([replacement]);
    });
});
