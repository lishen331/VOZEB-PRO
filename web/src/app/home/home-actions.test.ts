import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("homepage authentication entry", () => {
    it("navigates to the independent login page instead of rendering an auth modal", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/home/home-actions.tsx"), "utf8");
        expect(source).toContain("router.push(loginHref(nextPath))");
        expect(source).not.toContain("landing-auth-modal");
        expect(source).not.toContain('<AuthForm mode="login"');
        expect(source).not.toContain("authOpen");
    });
});
