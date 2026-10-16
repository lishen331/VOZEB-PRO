import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * 画布隔离边界。
 *
 * 画布（/canvas 与 /drama-canvas）的交互动效与 UI 已定稿，改版期间不动。
 * 这组测试把"互不侵入"固化下来，避免换组件时把画布改坏：
 *   1. 新设计系统（gamma-ui / bluegamma）不得被画布代码引用
 *   2. 画布代码不得使用 .gm 作用域的类或 --gm-* 变量
 *   3. 新设计系统不得引用画布代码或其全局样式表
 *   4. 画布依赖的共享组件清单被钉住——清单变化会让测试失败，提醒先验证画布
 */

const bluegammaRoot = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(bluegammaRoot, "../..");
const canvasRoots = [resolve(srcRoot, "app/(user)/canvas"), resolve(srcRoot, "app/(user)/drama-canvas")];

/** 画布当前复用的站内共享组件；新增或移除需同步本清单并确认画布仍可用 */
const CANVAS_SHARED_COMPONENTS = [
    "components/agent/agent-markdown",
    "components/agent/agent-media-preview",
    "components/agent/agent-message-actions",
    "components/agent/agent-message-format",
    "components/agent/compact-agent-generation-settings",
    "components/agent/creative-agent-controls",
    "components/audio-settings-panel",
    "components/canvas-image-reference-roles-popover",
    "components/creative-composer-popover",
    "components/creative-generation-preferences",
    "components/ip-library/ip-reference-picker",
    "components/layout/site-logo",
    "components/layout/user-status-actions",
    "components/model-picker",
    "components/school/school-project-billing-badge",
    "components/ui/animated-theme-toggler",
    "components/ui/dia-text-reveal",
    "components/ui/select",
] as const;

async function readSourceFiles(root: string) {
    const names = await readdir(root, { recursive: true });
    const sources = names.filter((name) => /\.(?:ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name));
    return Promise.all(sources.map(async (name) => ({ name, text: await readFile(resolve(root, name), "utf8") })));
}

describe("画布隔离边界", () => {
    it("画布不引用新设计系统（gamma-ui / bluegamma）", async () => {
        for (const root of canvasRoots) {
            const files = await readSourceFiles(root);
            expect(files.filter((file) => /gamma-ui|app\/bluegamma/.test(file.text)).map((file) => file.name)).toEqual([]);
        }
    });

    it("画布不使用 .gm 作用域类或 --gm-* 变量", async () => {
        for (const root of canvasRoots) {
            const files = await readSourceFiles(root);
            expect(files.filter((file) => /--gm-|\bgm-(?:glass|shimmer|flow|aurora|gradient-text|liquid)\b/.test(file.text)).map((file) => file.name)).toEqual([]);
        }
    });

    it("新设计系统不引用画布代码或其全局样式表", async () => {
        const files = [...(await readSourceFiles(resolve(srcRoot, "components/gamma-ui"))), ...(await readSourceFiles(bluegammaRoot))];
        expect(files.filter((file) => /\(user\)\/canvas|\(user\)\/drama-canvas|global-canvas/.test(file.text)).map((file) => file.name)).toEqual([]);
    });

    it("画布依赖的共享组件清单与实际引用一致", async () => {
        const referenced = new Set<string>();
        for (const root of canvasRoots) {
            const files = await readSourceFiles(root);
            for (const file of files) {
                for (const match of file.text.matchAll(/from "@\/((?:components|app)\/[^"]+)"/g)) {
                    const path = match[1];
                    if (!path.startsWith("app/(user)/canvas") && !path.startsWith("app/(user)/drama-canvas")) referenced.add(path);
                }
            }
        }
        // 清单变化说明画布的外部依赖面变了：先确认画布仍可用，再更新 CANVAS_SHARED_COMPONENTS
        expect([...referenced].sort()).toEqual([...CANVAS_SHARED_COMPONENTS].sort());
    });
});
