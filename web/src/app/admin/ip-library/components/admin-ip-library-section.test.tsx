import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin IP library section", () => {
    it("keeps content, grants, and usage in duty-aware paged workflows", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/ip-library/components/admin-ip-library-section.tsx"), "utf8");
        expect(source).toContain('key: "content"');
        expect(source).toContain('key: "grants"');
        expect(source).toContain('key: "usage"');
        expect(source).toContain('hasAdminPermission(currentUser, "content.manage")');
        expect(source).toContain('hasAdminPermission(currentUser, "education.manage")');
        expect(source).toContain("adminIpLibraryApi.listVersions");
        expect(source).toContain("adminIpLibraryApi.listGrants");
        expect(source).toContain("adminIpLibraryApi.listUsage");
        expect(source).toContain("adminIpLibraryApi.listFiles");
        expect(source).toContain("IpContentUpload");
        expect(source).toContain("IpContentPreview");
        expect(source).toContain("adminIpLibraryApi.updateVersion");
        expect(source).not.toContain("listLibraryAssetPage");
        expect(source).not.toContain("AssetSelect");
        expect(source).toContain("adminEducationApi.listSchools");
        expect(source).toContain('width="min(760px, 100vw)"');
        expect(source).toContain("destroyOnHidden");
    });

    it("keeps authorization mode on each school grant instead of the IP profile form", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/ip-library/components/admin-ip-library-section.tsx"), "utf8");
        expect(source).toContain('name="mode" label="授权方式"');
        expect(source).not.toContain('name="authorizationMode"');
        expect(source).not.toContain('name="coverAssetId"');
    });
});
