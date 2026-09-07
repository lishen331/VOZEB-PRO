import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("unified education login page contract", () => {
    it("uses a dedicated split login presentation with safe media fallback", async () => {
        const page = await readFile(resolve(process.cwd(), "src/app/login/page.tsx"), "utf8");
        const form = await readFile(resolve(process.cwd(), "src/components/auth/auth-form.tsx"), "utf8");
        const css = await readFile(resolve(process.cwd(), "src/app/styles/global-auth.css"), "utf8");

        expect(page).toContain('presentation="education-login"');
        expect(page).toContain("registrationEnabled={settings?.registrationEnabled ?? false}");
        expect(form).toContain("auth-education-shell");
        expect(form).toContain("muted autoPlay loop playsInline");
        expect(css).toContain("prefers-reduced-motion: reduce");
        expect(form).toContain("jointBrandUrl");
        expect(form).toContain("policyAccepted");
        expect(form).toContain('mfaRequired ? "验证并登录"');
        expect(form).toContain("mfaRequired");
        expect(form).not.toContain("图形验证码");
        expect(css).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)");
        expect(css).toContain("@media (max-width: 767px)");
    });
});
