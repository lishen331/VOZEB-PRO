import { describe, expect, it, vi } from "vitest";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BindingVerificationModal, canConfirmBindingVerification, readBindingVerification, verificationFixtureCount } from "./binding-verification-modal";

vi.mock("antd", async (importOriginal) => ({
    ...(await importOriginal<typeof import("antd")>()),
    Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => createElement(Fragment, null, children, footer),
}));

describe("binding verification safety", () => {
    it("renders the real fixed video fixture inputs, cost notice and disabled enable action", () => {
        const html = renderToStaticMarkup(createElement(BindingVerificationModal, { open: true, onCancel: vi.fn(), onVerified: vi.fn(), logicalModelId: "m", bindingId: "b", capability: "video", channelName: "渠道", upstreamModel: "模型" }));
        expect(html).toContain("/api/admin/binding-verifications/fixtures/2");
        expect(html).toContain("实际上游调用费用");
        expect(html).toContain("480P");
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*><span>启用此绑定/);
    });
    it("requires passed status, actual result and explicit confirmation", () => {
        const test = { id: "t", status: "passed" as const, phase: "done", result: { text: "正文" } };
        expect(canConfirmBindingVerification(test, false)).toBe(false);
        expect(canConfirmBindingVerification(test, true)).toBe(true);
        expect(canConfirmBindingVerification({ ...test, status: "failed" }, true)).toBe(false);
        expect(canConfirmBindingVerification({ ...test, status: "needs_review" }, true)).toBe(false);
        expect(canConfirmBindingVerification({ ...test, result: {} }, true)).toBe(false);
    });
    it("uses three references for video and one for image/text", () => {
        expect(verificationFixtureCount("video")).toBe(3);
        expect(verificationFixtureCount("image")).toBe(1);
        expect(verificationFixtureCount("text")).toBe(1);
    });
    it("does not retry unknown statuses", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ test: { id: "t", status: "unknown", phase: "query" } })));
        await expect(readBindingVerification("/api/admin/binding-verifications/t", {}, fetcher)).rejects.toThrow("未知测试状态");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it("surfaces server errors without fabricating results", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "请先保存配置" }), { status: 409 }));
        await expect(readBindingVerification("/api/admin/binding-verifications", {}, fetcher)).rejects.toThrow("请先保存配置");
    });
});
