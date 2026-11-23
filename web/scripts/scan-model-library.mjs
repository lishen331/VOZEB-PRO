/**
 * 扫描 web/public/models/library/<categoryId>/ 下的模型文件，生成 3D 导演台的内置模型库清单。
 *
 * 用法：在 web/ 目录执行 `npm run models:scan`（或 `node scripts/scan-model-library.mjs`）。
 *
 * 目录约定：
 *   public/models/library/convenience/*.fbx|*.obj
 *   public/models/library/home/*
 *   public/models/library/outdoor/*
 *   public/models/library/tools/*
 * 缩略图为同名 .png/.jpg/.jpeg/.webp（放在模型同目录即可）。
 *
 * 模型文件不随本仓库分发，放入后重新执行本脚本，模型库面板即会显示对应条目。
 */
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const libraryRoot = path.join(webRoot, "public", "models", "library");
const manifestPath = path.join(
    webRoot,
    "src",
    "app",
    "(user)",
    "practice",
    "director-desk",
    "editor",
    "modelLibrary",
    "model-library-manifest.json"
);

const CATEGORY_IDS = ["convenience", "home", "outdoor", "tools"];
const MODEL_EXTENSIONS = new Set([".fbx", ".obj"]);
const THUMBNAIL_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function listFiles(directory) {
    try {
        return await readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
}

async function scanCategory(categoryId) {
    const categoryRoot = path.join(libraryRoot, categoryId);
    const entries = await listFiles(categoryRoot);
    const thumbnails = new Map();

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const extension = path.extname(entry.name).toLowerCase();
        if (!THUMBNAIL_EXTENSIONS.has(extension)) continue;
        thumbnails.set(path.basename(entry.name, extension).toLowerCase(), entry.name);
    }

    const models = [];
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const extension = path.extname(entry.name).toLowerCase();
        if (!MODEL_EXTENSIONS.has(extension)) continue;

        const thumbnail = thumbnails.get(path.basename(entry.name, extension).toLowerCase());
        models.push({
            categoryId,
            fileName: entry.name,
            url: `/models/library/${categoryId}/${encodeURIComponent(entry.name)}`,
            ...(thumbnail ? { thumbUrl: `/models/library/${categoryId}/${encodeURIComponent(thumbnail)}` } : {}),
        });
    }

    return models;
}

const manifest = [];
for (const categoryId of CATEGORY_IDS) {
    manifest.push(...(await scanCategory(categoryId)));
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const summary = CATEGORY_IDS.map((id) => `${id}=${manifest.filter((item) => item.categoryId === id).length}`).join(" ");
console.log(`模型库清单已生成：${manifest.length} 个模型（${summary}）`);
console.log(`输出：${path.relative(webRoot, manifestPath)}`);
