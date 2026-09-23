import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { decodeOneClickRouteId } from "./route-id";

/**
 * 一键成片项目 id 含冒号（`drama-one-click-film:<uuid>`），这在 URL 里是 `%3A`。
 *
 * `useParams()` 返回**未解码**的路径段，若客户端再 `encodeURIComponent` 一次就变成
 * `%253A`，服务端解码一次后拿到字面量 `%3A`，按 id 查库必然落空 —— 页面显示
 * "短剧项目不存在"，而项目其实在库里。其他项目 id 不含冒号，所以只有一键成片会中招。
 */
describe("one-click-film route id decoding", () => {
    it("restores the colon from an encoded route segment", () => {
        expect(decodeOneClickRouteId("drama-one-click-film%3A5ae4674a-cd4a-4574-ab3a-dd7b8dbe8e2c")).toBe("drama-one-click-film:5ae4674a-cd4a-4574-ab3a-dd7b8dbe8e2c");
    });

    it("is idempotent so an already decoded id survives unchanged", () => {
        const plain = "drama-one-click-film:5ae4674a-cd4a-4574-ab3a-dd7b8dbe8e2c";
        expect(decodeOneClickRouteId(plain)).toBe(plain);
        expect(decodeOneClickRouteId(decodeOneClickRouteId(plain))).toBe(plain);
    });

    it("leaves ids without a colon untouched", () => {
        // 创作工坊与普通短剧的 id 不含冒号，行为不能被这次修复改变。
        expect(decodeOneClickRouteId("drama-lab-1788466386863-xxoelvm")).toBe("drama-lab-1788466386863-xxoelvm");
        expect(decodeOneClickRouteId("drama-U_ZCqDsrtMu0ObYM74Ryi")).toBe("drama-U_ZCqDsrtMu0ObYM74Ryi");
    });

    it("does not throw on a malformed percent sequence", () => {
        // 孤立的 % 会让 decodeURIComponent 抛错，这里必须降级而不是崩页面。
        expect(decodeOneClickRouteId("drama-100%-broken")).toBe("drama-100%-broken");
    });

    it("handles empty and non-string input", () => {
        expect(decodeOneClickRouteId(undefined)).toBe("");
        expect(decodeOneClickRouteId(null)).toBe("");
        expect(decodeOneClickRouteId("")).toBe("");
    });

    it("is actually used by both client entry points", async () => {
        // 光有 helper 不算修好，必须真的接在读路由参数的地方。
        for (const file of ["src/app/(user)/one-click-film/[id]/one-click-film-project.tsx", "src/app/(user)/one-click-film/[id]/canvas/page.tsx"]) {
            const source = await readFile(resolve(process.cwd(), file), "utf8");
            expect(source).toContain("decodeOneClickRouteId");
            // 不能再把 useParams 的原始值直接当 id 用
            expect(source).not.toContain('const projectId = String(id || "")');
        }
    });
});
