import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * 画布隔离边界。
 *
 * 画布（/canvas 与 /drama-canvas）的交互动效与 UI 已定稿，改版期间不动；/canvas 列表页除外（见 CANVAS_LIST_PAGE_FILES）。
 * 这组测试把"互不侵入"固化下来，避免换组件时把画布改坏：
 *   1. 新设计系统（gamma-ui / bluegamma）不得被画布代码引用
 *   2. 画布代码不得使用 .gm 作用域的类或 --gm-* 变量
 *   3. 新设计系统不得引用画布代码或其全局样式表
 *   4. 画布依赖的共享组件清单被钉住——清单变化会让测试失败，提醒先验证画布
 */

const bluegammaRoot = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(bluegammaRoot, "../..");
const canvasRoots = [resolve(srcRoot, "app/(user)/canvas"), resolve(srcRoot, "app/(user)/drama-canvas")];

/**
 * 画布列表页（/canvas，不是 /canvas/[id] 编辑器）不挂编辑器主题，html.gm-app 生效，
 * 2026-10-28 起按用户要求与其他列表页统一换成 gamma-ui；编辑器内部仍受下面四条约束。
 * 路径相对 app/(user)/canvas，只放列表页独占的文件。
 */
const CANVAS_LIST_PAGE_FILES = new Set(["page.tsx", "components/canvas-project-card.tsx", "components/canvas-delete-projects-dialog.tsx"]);

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

/** 画布源码，排除已换成 gamma-ui 的列表页文件 */
async function readCanvasSourceFiles(root: string) {
    const files = await readSourceFiles(root);
    if (root !== canvasRoots[0]) return files;
    return files.filter((file) => !CANVAS_LIST_PAGE_FILES.has(file.name.replaceAll("\\", "/")));
}

describe("画布隔离边界", () => {
    it("画布不引用新设计系统（gamma-ui / bluegamma）", async () => {
        for (const root of canvasRoots) {
            const files = await readCanvasSourceFiles(root);
            expect(files.filter((file) => /gamma-ui|app\/bluegamma/.test(file.text)).map((file) => file.name)).toEqual([]);
        }
    });

    it("画布不使用 .gm 作用域类或 --gm-* 变量", async () => {
        for (const root of canvasRoots) {
            const files = await readCanvasSourceFiles(root);
            expect(files.filter((file) => /--gm-|\bgm-(?:glass|shimmer|flow|aurora|gradient-text|liquid)\b/.test(file.text)).map((file) => file.name)).toEqual([]);
        }
    });

    it("画布列表页只用 gamma-ui，不再直接引用 antd", async () => {
        const files = (await readSourceFiles(canvasRoots[0])).filter((file) => CANVAS_LIST_PAGE_FILES.has(file.name.replaceAll("\\", "/")));
        expect(files.map((file) => file.name.replaceAll("\\", "/")).sort()).toEqual([...CANVAS_LIST_PAGE_FILES].sort());
        expect(files.filter((file) => /from "antd"/.test(file.text)).map((file) => file.name)).toEqual([]);
    });

    it("新设计系统不引用画布代码或其全局样式表", async () => {
        const files = [...(await readSourceFiles(resolve(srcRoot, "components/gamma-ui"))), ...(await readSourceFiles(bluegammaRoot))];
        expect(files.filter((file) => /\(user\)\/canvas|\(user\)\/drama-canvas|global-canvas/.test(file.text)).map((file) => file.name)).toEqual([]);
    });

    it("画布依赖的共享组件清单与实际引用一致", async () => {
        const referenced = new Set<string>();
        for (const root of canvasRoots) {
            const files = await readCanvasSourceFiles(root);
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
