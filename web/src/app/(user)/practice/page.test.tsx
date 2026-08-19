import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("practice page access contract", () => {
    it("uses a not-found response for authenticated users without school practice access", async () => {
        const page = await readFile(resolve(process.cwd(), "src/app/(user)/practice/page.tsx"), "utf8");
        const modulePage = await readFile(resolve(process.cwd(), "src/app/(user)/practice/[module]/page.tsx"), "utf8");
        expect(page).toContain('import { notFound, redirect } from "next/navigation"');
        expect(page).toContain("notFound();");
        expect(page).not.toContain('redirect("/create")');
        expect(modulePage).toContain("notFound();");
        expect(modulePage).not.toContain('redirect("/create")');
    });
});
