import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("homepage authentication entry", () => {
    it("navigates to the independent login page instead of rendering an auth modal", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/home/home-actions.tsx"), "utf8");
        expect(source).toContain("window.location.assign(path)");
        expect(source).toContain("navigate(loginHref(nextPath))");
        expect(source).not.toContain("landing-auth-modal");
        expect(source).not.toContain('<AuthForm mode="login"');
        expect(source).not.toContain("authOpen");
    });

    it("uses a document navigation for protected paths so role-based server redirects are applied after a direct home visit", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/home/home-actions.tsx"), "utf8");

        expect(source).toContain("if (authenticated) navigate(path);");
        expect(source).not.toContain("useRouter");
    });

    it("uses a native header form for the primary creation entry", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/home/home-header.tsx"), "utf8");

        expect(source).toContain('<form action={authenticated ? "/create" : loginHref("/create")} method="get" className={styles.primarySmallAction}>');
        expect(source).toContain('<button type="submit" className={styles.primarySmallButton}>');
        expect(source).not.toContain('onClick={() => (authenticated ? openProtectedPath("/create") : openLogin("/create"))}');
    });
});

describe("homepage capability entry points", () => {
    it("opens the real course catalog directly and replaces unsupported professional shortcuts with published cases", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/home/gamma-home-view.tsx"), "utf8");
        expect(source).toContain('openProtectedPath("/teaching?tab=catalog")');
        expect(source).toContain("<GammaHomeCases />");
        expect(source).not.toContain("GAMMA_SUBJECTS");
        expect(source).not.toContain("GammaToolRow");
        expect(source).not.toContain("openBillingPlans");
    });
});
