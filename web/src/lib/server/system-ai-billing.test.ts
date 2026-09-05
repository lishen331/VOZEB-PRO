import { describe, expect, it } from "vitest";

import {
    hasSystemAiCharge,
    readSystemAiBilling,
    readVerifiedSystemAiBusinessRequest,
    readVerifiedSystemAiBusinessRequestId,
    systemAiBillingHeaders,
    systemAiIdempotencyKey,
    systemAiPointsIdempotencyKey,
    systemAiRequestFingerprint,
} from "./system-ai-billing";

describe("system AI billing helpers", () => {
    it("preserves a zero-cost consumption record so its quota can be refunded", () => {
        const billing = readSystemAiBilling(new Headers({ "x-vozeb-pro-points-cost": "0", "x-vozeb-pro-billing-receipt-id": "school:free-text" }));

        expect(billing).toEqual({ pointsCost: 0, billingReceiptId: "school:free-text" });
        expect(hasSystemAiCharge(billing)).toBe(true);
    });

    it("creates stable scoped idempotency headers without exposing source identifiers", () => {
        const first = systemAiIdempotencyKey("workbench-plan", "user-one", "request-one", "image", "channel-one");
        const second = systemAiIdempotencyKey("workbench-plan", "user-one", "request-one", "image", "channel-one");
        const headers = new Headers(systemAiBillingHeaders("planner", first, "vendor-text"));

        expect(first).toBe(second);
        expect(first).toMatch(/^workbench-plan:[a-f0-9]{32}$/);
        expect(headers.get("x-vozeb-pro-logical-model")).toBe("planner");
        expect(headers.get("x-vozeb-pro-points-idempotency-key")).toBe(first);
        expect(headers.get("x-vozeb-pro-points-signature")).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(readVerifiedSystemAiBusinessRequestId(headers, "planner", "vendor-text")).toBe(first);

        headers.set("x-vozeb-pro-points-idempotency-key", `${first}:forged`);
        expect(readVerifiedSystemAiBusinessRequestId(headers, "planner", "vendor-text")).toBeUndefined();
    });

    it("binds the execution profile to the signed internal request", () => {
        const headers = new Headers(systemAiBillingHeaders("writer", "practice-one", "vendor-text", "open-source-practice"));
        expect(readVerifiedSystemAiBusinessRequestId(headers, "writer", "vendor-text", "open-source-practice")).toBe("practice-one");
        expect(readVerifiedSystemAiBusinessRequestId(headers, "writer", "vendor-text", "production")).toBeUndefined();
        const forged = new Headers(systemAiBillingHeaders("writer", "practice-one", "vendor-text"));
        forged.set("x-vozeb-pro-execution-profile", "open-source-practice");
        expect(readVerifiedSystemAiBusinessRequestId(forged, "writer", "vendor-text")).toBeUndefined();
    });

    it("binds the school billing context to the internal signature", () => {
        const context = { schoolId: "school-a", groupId: "group-a", orderId: "order-a", projectType: "canvas" as const, projectId: "canvas-a" };
        const headers = new Headers(systemAiBillingHeaders("writer", "school-one", "vendor-text", "production", context));
        expect(readVerifiedSystemAiBusinessRequest(headers, "writer", "vendor-text")).toEqual({ businessRequestId: "school-one", billingContext: context });
        headers.set("x-vozeb-pro-billing-context", JSON.stringify({ ...context, schoolId: "school-b" }));
        expect(readVerifiedSystemAiBusinessRequest(headers, "writer", "vendor-text")).toBeUndefined();
    });

    it("binds the local billing key and request fingerprint to separate identities", () => {
        const identity = { userId: "user-one", businessRequestId: "task-one", logicalModel: "writer", channelId: "channel-one", upstreamModel: "vendor-text", callType: "text:create:/chat/completions" };
        const firstKey = systemAiPointsIdempotencyKey(identity);
        const secondKey = systemAiPointsIdempotencyKey(identity);
        const firstFingerprint = systemAiRequestFingerprint({
            method: "POST",
            callType: identity.callType,
            logicalModel: identity.logicalModel,
            channelId: identity.channelId,
            upstreamModel: identity.upstreamModel,
            usageKind: "text",
            amount: 1,
            bodyDigest: "a".repeat(64),
        });
        const secondFingerprint = systemAiRequestFingerprint({
            method: "POST",
            callType: identity.callType,
            logicalModel: identity.logicalModel,
            channelId: identity.channelId,
            upstreamModel: identity.upstreamModel,
            usageKind: "text",
            amount: 1,
            bodyDigest: "b".repeat(64),
        });

        expect(firstKey).toBe(secondKey);
        expect(firstKey).toMatch(/^system-ai:[a-f0-9]{64}$/);
        expect(firstFingerprint).not.toBe(secondFingerprint);
    });
});
