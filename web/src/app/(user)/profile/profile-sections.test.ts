import { describe, expect, it } from "vitest";

import { parseProfileSection, profileSections } from "./profile-elements";

describe("user profile navigation", () => {
    it("shows only account overview and personal profile", () => {
        expect(profileSections.map((section) => section.key)).toEqual(["overview", "profile"]);
    });

    it("preserves profile and account overview as the only visible areas", () => {
        expect(profileSections.map((section) => section.label)).toEqual(["账户概览", "个人资料"]);
    });

    it("keeps non-billing account services addressable while removing checkout access", () => {
        expect(parseProfileSection("billing")).toBe("overview");
        for (const section of ["coupons", "orders", "points", "consume", "referrals", "security"]) {
            expect(parseProfileSection(section)).toBe(section);
        }
    });
});
