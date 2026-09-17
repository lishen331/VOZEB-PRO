import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 死代码守卫。
 *
 * 我在第三轮审查里发现自己反复犯同一类错误：把一键成片的后端路由建好、测试也写了，
 * 但没有任何调用方（编排层或 UI），从用户视角完全看不出变化，而"测试全绿"掩盖了这一点。
 *
 * 这个测试要求：一键成片下每条 API 路由，都必须能在仓库里找到路由自身之外的引用者。
 * 找不到就判红，逼迫要么接上调用方，要么把路由删掉。
 */
const apiRoot = resolve(process.cwd(), "src/app/api/one-click-film");

/**
 * 已知没有调用方的路由，等 UI 迁移接入（矩阵 P0）。
 *
 * 这份名单是"欠账清单"，不是豁免：新增的死路由不在名单里就会判红。
 * 每接上一条 UI，就要把对应项从这里删掉。
 */
const KNOWN_ORPHANS = new Set([
    "/projects/[id]/shots/[shotId]/frame-prompts/route.ts",
    "/projects/[id]/shots/[shotId]/frame-prompts/[frameType]/route.ts",
    "/projects/[id]/shots/[shotId]/insert-before/route.ts",
    "/projects/[id]/shots/[shotId]/split-by-audio/route.ts",
]);
const searchRoots = ["src/app", "src/lib", "src/components", "src/features"].map((dir) => resolve(process.cwd(), dir));

async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(full)));
        else out.push(full);
    }
    return out;
}

/** 由 route.ts 的物理路径推出它的 URL 片段，动态段用 :param 占位。 */
function routeSegments(routeFile: string) {
    const rel = routeFile
        .slice(apiRoot.length)
        .replace(/\\/g, "/")
        .replace(/\/route\.ts$/, "");
    return rel.split("/").filter(Boolean);
}

/** 取路由路径里最后一个静态段作为调用方必然出现的字面量。 */
function staticLeaf(segments: string[]) {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
        const segment = segments[index];
        if (!segment.startsWith("[")) return segment;
    }
    return "";
}

describe("one-click-film routes must have callers", () => {
    it("finds a caller for every one-click-film API route", async () => {
        const allFiles = (await Promise.all(searchRoots.map((root) => walk(root)))).flat();
        const routeFiles = allFiles.filter((file) => file.startsWith(apiRoot) && file.endsWith(`${join("", "route.ts")}`));
        expect(routeFiles.length).toBeGreaterThan(0);

        const candidates = allFiles.filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"));
        const sources = new Map<string, string>();
        for (const file of candidates) sources.set(file, await readFile(file, "utf8"));

        const orphans: string[] = [];
        for (const routeFile of routeFiles) {
            const segments = routeSegments(routeFile);
            const leaf = staticLeaf(segments);
            // 集合根路由（/projects）由 leaf 自身覆盖；深层路由用最后一个静态段匹配。
            const needle = leaf;
            const referenced = [...sources.entries()].some(([file, text]) => {
                if (file === routeFile) return false;
                // 只认"确实构造了 one-click-film 请求路径"的引用，避免同名词误判。
                return text.includes("one-click-film") && text.includes(needle) && /fetch|fetchInternalApi/.test(text);
            });
            if (!referenced) orphans.push(routeFile.slice(apiRoot.length).replace(/\\/g, "/"));
        }

        const unexpected = orphans.filter((route) => !KNOWN_ORPHANS.has(route));
        expect(unexpected, `以下一键成片路由没有任何调用方（新增死代码）：\n${unexpected.join("\n")}`).toEqual([]);

        // 欠账一旦还清就必须把名单收紧，否则这个守卫会慢慢失效。
        const staleAllowlist = [...KNOWN_ORPHANS].filter((route) => !orphans.includes(route));
        expect(staleAllowlist, `以下路由已有调用方，请从 KNOWN_ORPHANS 移除：\n${staleAllowlist.join("\n")}`).toEqual([]);
    });
});
