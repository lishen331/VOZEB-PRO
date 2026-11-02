import { describe, expect, it } from "vitest";

import type { FeatureModuleSettings } from "./feature-modules";
import { buildOnboardingSteps, hasActiveSchoolRole, onboardingSignature, onboardingStorageKey } from "./onboarding-guide";
import type { SchoolContext } from "./school-domain";

const allModulesOn = {} as FeatureModuleSettings;

function schoolContext(role: "teacher" | "student" | "admin" | null): SchoolContext | null {
    if (!role) return null;
    return { school: { id: "school-one", name: "测试学校", status: "active" }, membership: { id: "m-one", role, status: "active" } } as unknown as SchoolContext;
}

describe("onboarding guide steps", () => {
    it("gives a teacher the school and practice areas", () => {
        const steps = buildOnboardingSteps({ featureModules: allModulesOn, schoolContext: schoolContext("teacher") });
        const areas = steps.find((step) => step.id === "areas");

        expect(areas?.bullets.map((bullet) => bullet.label)).toEqual(expect.arrayContaining(["学校", "无限练习", "创作", "资产"]));
    });

    it("never points a non-school user at 无限练习, which requires an active school role", () => {
        const steps = buildOnboardingSteps({ featureModules: allModulesOn, schoolContext: null });
        const labels = steps.flatMap((step) => step.bullets.map((bullet) => bullet.label));

        expect(labels).not.toContain("无限练习");
        expect(labels).not.toContain("想先试试手感");
    });

    it("drops steps that depend on modules disabled in the admin console", () => {
        const steps = buildOnboardingSteps({ featureModules: { canvas: false } as FeatureModuleSettings, schoolContext: null });
        const labels = steps.flatMap((step) => step.bullets.map((bullet) => bullet.label));

        expect(labels).not.toContain("想自由拼装");
    });

    it("still explains points when every optional area is hidden", () => {
        const steps = buildOnboardingSteps({
            featureModules: {
                "creative-agent": false,
                canvas: false,
                drama: false,
                "drama-lab": false,
                "one-click-film": false,
                assets: false,
                works: false,
                practice: false,
            } as FeatureModuleSettings,
            schoolContext: null,
        });

        expect(steps.map((step) => step.id)).toEqual(["points"]);
    });

    it("changes the storage key when the visible module set changes", () => {
        const withCanvas = onboardingStorageKey({ featureModules: allModulesOn });
        const withoutCanvas = onboardingStorageKey({ featureModules: { canvas: false } as FeatureModuleSettings });

        expect(withCanvas).not.toBe(withoutCanvas);
        expect(withCanvas).toContain("vozeb-pro:onboarding:v1:");
    });

    it("treats only an active teacher or student as having a school role", () => {
        expect(hasActiveSchoolRole(schoolContext("teacher"))).toBe(true);
        expect(hasActiveSchoolRole(schoolContext("student"))).toBe(true);
        expect(hasActiveSchoolRole(schoolContext("admin"))).toBe(false);
        expect(hasActiveSchoolRole(null)).toBe(false);
    });

    it("keeps the signature stable for the same visible modules", () => {
        expect(onboardingSignature({ featureModules: allModulesOn })).toBe(onboardingSignature({ featureModules: allModulesOn }));
    });
});
