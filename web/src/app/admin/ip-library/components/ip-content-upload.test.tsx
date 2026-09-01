import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("IP content upload", () => {
    it("uploads independent original files and turns manual text into a TXT file", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/ip-library/components/ip-content-upload.tsx"), "utf8");
        expect(source).toContain("adminIpLibraryApi.uploadFile");
        expect(source).toContain('new File([manualText], "手工正文.txt"');
        expect(source).toContain("IpContentPreview");
        expect(source).not.toContain("listLibraryAssetPage");
        expect(source).not.toContain("assetId");
    });
});
