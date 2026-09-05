import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

const webRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(webRoot, "..");
const sourceRoot = join(webRoot, "src", "app", "(user)", "canvas");
const finalTargetRoot = join(webRoot, "src", "features", "drama-canvas-runtime");
const targetRoot = `${finalTargetRoot}.staging-${process.pid}`;
const manifestPath = join(targetRoot, "sync-manifest.json");

const topLevelFiles = new Set(["constants.ts", "export-types.ts", "types.ts", "use-canvas-local-agent-bridge.ts"]);
const excludedFiles = new Set(["canvas-project-card.tsx", "canvas-delete-projects-dialog.tsx", "page.tsx"]);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();

assertSourceTreeIsCommitted();

function shouldCopy(relativePath) {
    const normalized = relativePath.split(sep).join("/");
    const name = basename(normalized);
    if (/\.test\.[^.]+$/.test(name) || excludedFiles.has(name)) return false;
    if (!normalized.includes("/")) return topLevelFiles.has(name);
    return normalized.startsWith("components/") || normalized.startsWith("stores/") || normalized.startsWith("utils/") || normalized.startsWith("[id]/");
}

async function listFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map(async (entry) => {
            const path = join(directory, entry.name);
            return entry.isDirectory() ? listFiles(path) : [path];
        }),
    );
    return nested.flat();
}

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });

const sourceFiles = (await listFiles(sourceRoot))
    .map((path) => ({ path, relativePath: relative(sourceRoot, path) }))
    .filter(({ relativePath }) => shouldCopy(relativePath))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

const files = [];
for (const source of sourceFiles) {
    const destination = join(targetRoot, source.relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source.path, destination);
    const content = await readFile(destination);
    files.push({ path: source.relativePath.split(sep).join("/"), sha256: createHash("sha256").update(content).digest("hex") });
}

await applyDramaRuntimeAdapters();
try {
    await validateStagingRuntime();
} catch (error) {
    await rm(targetRoot, { recursive: true, force: true });
    throw error;
}
files.length = 0;
for (const path of await listFiles(targetRoot)) {
    const relativePath = relative(targetRoot, path).split(sep).join("/");
    if (relativePath === "sync-manifest.json") continue;
    const content = await readFile(path);
    files.push({ path: relativePath, sha256: createHash("sha256").update(content).digest("hex") });
}
files.sort((left, right) => left.path.localeCompare(right.path));

async function applyDramaRuntimeAdapters() {
    const storePath = join(targetRoot, "stores", "use-canvas-store.ts");
    let store = await readFile(storePath, "utf8");
    store = replaceRequired(
        store,
        'import { CanvasProjectRequestError, createCanvasProject, deleteCanvasProjects as deleteCanvasProjectsRequest, getCanvasProject, listCanvasProjectSummaries, saveCanvasProjectMutation } from "@/services/api/canvas-projects";',
        'import { CanvasProjectRequestError, createCanvasProject, deleteCanvasProjects as deleteCanvasProjectsRequest, getDramaLabCanvasProject as getCanvasProject, listCanvasProjectSummaries, saveDramaLabCanvasProjectMutation as saveCanvasProjectMutation } from "@/services/api/drama-lab-canvas-projects";',
        "drama canvas persistence API",
    );
    await writeFile(storePath, store, "utf8");

    const assistantPath = join(targetRoot, "components", "canvas-assistant-panel.tsx");
    let assistant = await readFile(assistantPath, "utf8");
    assistant = replaceRequired(
        assistant,
        'import { deleteCanvasAssistantConversations } from "@/services/api/canvas-projects";',
        'import { deleteDramaLabCanvasAssistantConversations as deleteCanvasAssistantConversations } from "@/services/api/drama-lab-canvas-projects";',
        "drama canvas assistant deletion API",
    );
    await writeFile(assistantPath, assistant, "utf8");

    const clientPath = join(targetRoot, "[id]", "canvas-client-page.tsx");
    let client = await readFile(clientPath, "utf8");
    client = replaceRequired(
        client,
        `                onOpenProject={(id) => {
                    void loadProject(id).catch(() => undefined);
                    router.push(\`/canvas/\${id}\`);
                }}`,
        '                onOpenProject={() => message.info("请使用顶部剧集选择器切换本剧画布")}',
        "ordinary project navigation",
    );
    client = replaceRequired(client, 'onOpenProjects={() => router.push("/canvas")}', 'onOpenProjects={() => message.info("请使用顶部剧集选择器切换本剧画布")}', "ordinary project list navigation");
    client = replaceRequired(client, "onCreateProject={createAndOpenProject}", 'onCreateProject={() => message.info("短剧画布按剧集自动创建")}', "canvas creation navigation");
    client = replaceRequired(client, "onDeleteProject={deleteCurrentProject}", 'onDeleteProject={() => message.info("短剧画布由剧集绑定管理")}', "canvas deletion navigation");
    client = replaceRequired(client, "        loadProject,\n", "", "canvas project loader binding");
    client = replaceRequired(client, "        createAndOpenProject,\n        deleteCurrentProject,\n", "", "canvas project mutation bindings");
    client = replaceRequired(
        client,
        '                    onWorkbench={() => router.push("/create")}',
        `                    onWorkbench={() => {
                        const dramaProjectId = searchParams.get("dramaProjectId") || "";
                        const episodeId = searchParams.get("episodeId") || "";
                        const shotId = searchParams.get("shotId") || "";
                        if (!dramaProjectId || !episodeId) {
                            router.push("/drama-lab");
                            return;
                        }
                        const query = new URLSearchParams({ episode: episodeId, stage: "storyboard" });
                        router.push(\`/drama-lab/\${encodeURIComponent(dramaProjectId)}/create?\${query.toString()}\${shotId ? \`#storyboard-shot-\${encodeURIComponent(shotId)}\` : ""}\`);
                    }}`,
        "drama workbench navigation",
    );
    if (!client.includes('const focusShotId = searchParams.get("shotId")')) {
        client = replaceRequired(client, 'import { useEffect, useMemo, useRef, useState } from "react";\n', 'import { useEffect, useMemo, useRef, useState } from "react";\nimport { useSearchParams } from "next/navigation";\n', "shot focus imports");
        client = replaceRequired(
            client,
            "    const controller = useCanvasPageController();\n",
            '    const controller = useCanvasPageController();\n    const searchParams = useSearchParams();\n    const focusShotId = searchParams.get("shotId") || "";\n    const focusedShotRef = useRef("");\n',
            "shot focus state",
        );
        client = replaceRequired(client, "        setSize,\n", "        size,\n        setSize,\n", "shot focus viewport size");
        const marker = "    } = controller;\n";
        const focusEffect = `    useEffect(() => {\n        if (!projectLoaded || !focusShotId || focusedShotRef.current === \`\${projectId}:\${focusShotId}\`) return;\n        const target = nodes.find((node) => node.id.endsWith(\`:shot:\${focusShotId}\`));\n        if (!target) return;\n        const k = Math.min(1, Math.max(0.45, viewport.k || 0.72));\n        setSelectedNodeIds(new Set([target.id]));\n        setViewport({ x: size.width / 2 - (target.position.x + target.width / 2) * k, y: size.height / 2 - (target.position.y + target.height / 2) * k, k });\n        focusedShotRef.current = \`\${projectId}:\${focusShotId}\`;\n    }, [focusShotId, nodes, projectId, projectLoaded, setSelectedNodeIds, setViewport, size.height, size.width, viewport.k]);\n`;
        if (!client.includes(marker)) throw new Error("Drama Canvas adapter marker missing: controller destructure");
        client = replaceRequired(client, marker, `${marker}${focusEffect}`, "shot focus effect insertion");
    }
    await writeFile(clientPath, client, "utf8");

    const persistencePath = join(targetRoot, "[id]", "use-canvas-persistence-effects.tsx");
    let persistence = await readFile(persistencePath, "utf8");
    persistence = persistence.replace('router.replace("/canvas")', 'router.replace("/drama-lab")');
    await writeFile(persistencePath, persistence, "utf8");
}

function assertSourceTreeIsCommitted() {
    const sourcePath = relative(repoRoot, sourceRoot).split(sep).join("/");
    const dirty = execFileSync("git", ["status", "--porcelain", "--", sourcePath], { cwd: repoRoot, encoding: "utf8" }).trim();
    if (dirty) throw new Error(`Canvas source has uncommitted changes; commit and validate it before syncing:\n${dirty}`);
}

async function validateStagingRuntime() {
    const configPath = join(webRoot, `tsconfig.drama-canvas-runtime-${process.pid}.json`);
    const stagingPath = relative(webRoot, targetRoot).split(sep).join("/");
    const config = {
        extends: "./tsconfig.json",
        compilerOptions: { incremental: false, noEmit: true },
        include: ["next-env.d.ts", `${stagingPath}/**/*.ts`, `${stagingPath}/**/*.tsx`],
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 4)}\n`, "utf8");
    try {
        execFileSync(process.execPath, [join(webRoot, "node_modules", "typescript", "bin", "tsc"), "-p", configPath, "--pretty", "false"], {
            cwd: webRoot,
            stdio: "inherit",
        });
    } finally {
        await rm(configPath, { force: true });
    }
}

function replaceRequired(source, search, replacement, label) {
    if (!source.includes(search)) throw new Error(`Drama Canvas adapter target missing: ${label}`);
    return source.replace(search, replacement);
}

const manifest = {
    schemaVersion: 1,
    source: "src/app/(user)/canvas",
    target: "src/features/drama-canvas-runtime",
    sourceCommit,
    syncedAt: new Date().toISOString(),
    exclusions: ["tests", "ordinary canvas project list", "ordinary canvas project list components"],
    adapterPatches: ["dedicated Drama Lab persistence API", "episode shot deep-link focus", "disable ordinary Canvas project navigation", "return workbench navigation to Drama Lab"],
    files,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`, "utf8");

const backupRoot = `${finalTargetRoot}.backup-${process.pid}`;
let hasBackup = false;
try {
    await rm(backupRoot, { recursive: true, force: true });
    try {
        await cp(finalTargetRoot, backupRoot, { recursive: true, force: true });
        hasBackup = true;
    } catch (error) {
        if (error?.code !== "ENOENT") throw error;
    }
    await rm(finalTargetRoot, { recursive: true, force: true });
    await mkdir(finalTargetRoot, { recursive: true });
    await cp(targetRoot, finalTargetRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
    if (hasBackup) await rm(backupRoot, { recursive: true, force: true });
} catch (error) {
    await rm(targetRoot, { recursive: true, force: true }).catch(() => undefined);
    await rm(finalTargetRoot, { recursive: true, force: true }).catch(() => undefined);
    if (hasBackup) await cp(backupRoot, finalTargetRoot, { recursive: true, force: true }).catch(() => undefined);
    await rm(backupRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
}

console.log(`Synced ${files.length} Canvas runtime files from ${sourceCommit}.`);
