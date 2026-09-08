import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { availableIpLibraryScopes } from "./ip-library-page";

describe("IP library page contract", () => {
    it("shows the school library only to active school members", () => {
        expect(availableIpLibraryScopes(false)).toEqual([{ label: "公共 IP", value: "public" }]);
        expect(availableIpLibraryScopes(true).map((item) => item.value)).toEqual(["public", "school"]);
    });
    it("keeps only the right-aligned keyword search", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/ip-library/components/ip-library-page.tsx"), "utf8");
        expect(source).not.toContain("社区内容资源");
        expect(source).not.toContain("内容类型");
        expect(source).not.toContain("按标签筛选");
        expect(source).toContain("justify-end");
    });
});
