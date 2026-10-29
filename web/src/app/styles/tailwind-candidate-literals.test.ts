import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Tailwind 会把源码里（含注释）所有像类名的字符串都当候选生成 CSS。
// 任意值里出现省略号（如 var 或 url 后面跟三个点的占位写法）会生成非法 CSS，
// 导致整份 globals.css 解析失败、全站无样式（2026-10-28 分页注释踩过）。
const PLACEHOLDER_ARBITRARY = /\b[a-z-]+-\[[^\]\s]*\.\.\.[^\]\s]*\]/g;

async function walk(dir: string, out: string[] = []): Promise<string[]> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full, out);
        else if (/\.(tsx?|jsx?|mdx?|css)$/.test(entry.name)) out.push(full);
    }
    return out;
}

describe("tailwind candidate literals", () => {
    it("has no arbitrary-value class with an ellipsis placeholder anywhere in src", async () => {
        const root = resolve(process.cwd(), "src");
        const files = (await walk(root)).filter((file) => !file.endsWith("tailwind-candidate-literals.test.ts"));
        const hits = (await Promise.all(files.map(async (file) => [...(await readFile(file, "utf8")).matchAll(PLACEHOLDER_ARBITRARY)].map((match) => `${relative(root, file)}: ${match[0]}`)))).flat();
        expect(hits).toEqual([]);
    });
});
