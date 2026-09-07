import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: () => null }));

import { ipReferenceFromQuery, selectedIpItemIds, upsertIpReference } from "./ip-reference-picker";

describe("IP reference picker contract", () => {
    it("passes a child IP through a workspace handoff", () => {
        expect(ipReferenceFromQuery(new URLSearchParams("ipId=ip-one&subIpId=child-three"))).toEqual({ type: "ip", id: "ip-one", subIpId: "child-three", itemIds: [] });
        expect(ipReferenceFromQuery(new URLSearchParams("ipId=ip-one"))).toBeUndefined();
    });

    it("replaces an existing reference to the same child", () => {
        const original = { type: "ip" as const, id: "ip-one", subIpId: "child-one", itemIds: [] };
        expect(upsertIpReference([original], { ...original, itemIds: ["item-one"] })).toEqual([{ ...original, itemIds: ["item-one"] }]);
        expect(selectedIpItemIds("all", ["item-one"], ["item-one"])).toEqual([]);
        expect(selectedIpItemIds("items", ["item-one", "missing"], ["item-one"])).toEqual(["item-one"]);
    });
});
