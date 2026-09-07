import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin IP library section", () => {
    it("keeps child content, grants, and usage in duty-aware workflows", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/ip-library/components/admin-ip-library-section.tsx"), "utf8");
        expect(source).toContain('key: "content"');
        expect(source).toContain('key: "grants"');
        expect(source).toContain('key: "usage"');
        expect(source).toContain('hasAdminPermission(currentUser, "content.manage")');
        expect(source).toContain('hasAdminPermission(currentUser, "education.manage")');
        expect(source).toContain("adminIpLibraryApi.createSubIp");
        expect(source).toContain("adminIpLibraryApi.updateSubIp");
        expect(source).toContain("adminIpLibraryApi.deleteSubIp");
        expect(source).toContain("adminIpLibraryApi.listGrants");
        expect(source).toContain("adminIpLibraryApi.listUsage");
        expect(source).toContain("adminIpLibraryApi.createGrants");
        expect(source).toContain("adminIpLibraryApi.updateGrant");
        expect(source).toMatch(/adminIpLibraryApi\s*\.\s*listFiles/);
        expect(source).toContain("IpContentUpload");
        expect(source).toContain('<Form.Item name="coverFileId" label="IP 封面" className="!mb-0 mt-4">\n                            <IpContentUpload variant="cover"');
        expect(source).toContain('<Form.Item name="coverFileId" label="封面">\n                    <IpContentUpload variant="cover"');
        expect(source).toContain("ipItemCategoryLabel");
        expect(source).toContain('name={[field.name, "fileId"]}');
        expect(source).toContain('kind="image"');
        expect(source).toContain("openGrantOnMount");
        expect(source).toContain('aria-label="暂停授权"');
        expect(source).toContain('aria-label="恢复授权"');
        expect(source).toContain('aria-label="撤销授权"');
        expect(source).toContain('title="编辑学校授权"');
        expect(source).not.toContain("adminIpLibraryApi.listVersions");
        expect(source).not.toContain("adminIpLibraryApi.updateVersion");
        expect(source).not.toContain("adminIpLibraryApi.publishVersion");
        expect(source).not.toContain("listLibraryAssetPage");
        expect(source).not.toContain("AssetSelect");
        expect(source).toContain("adminEducationApi.listSchools");
        expect(source).toContain("destroyOnHidden");
        expect(source).toContain("disabled={disabled}");
        expect(source).toContain('label: "学校授权"');
        expect(source).toContain("详情");
        expect(source).toContain("授权");
        expect(source).toContain("撤销授权时间");
    });

    it("keeps authorization mode on each school grant instead of the IP profile form", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/ip-library/components/admin-ip-library-section.tsx"), "utf8");
        expect(source).toContain('name="mode" label="授权方式"');
        expect(source).not.toContain('name="authorizationMode"');
        expect(source).not.toContain('name="coverAssetId"');
    });
});
