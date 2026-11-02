import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { loadDisasterObjectStorageConfig } from "./disaster-object-storage.mjs";

const REPOSITORY = "tigerowo/awesome-gpt-image-2-prompts";
const SAFE_IMAGE_PATH = /^images\/[a-z0-9_-]+_case\d+\/[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i;
const MAX_SOURCE_BYTES = 24 * 1024 * 1024;
const CONCURRENCY = 4;
const CONTENT_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const sourceDir = process.env.AWESOME_GPT_IMAGE_2_SOURCE_DIR?.trim();
// Commit must match the server module, otherwise the server reads different keys.
const commit = (await readFile(path.resolve(scriptDir, "../src/lib/server/public-prompt-image.ts"), "utf8")).match(/const COMMIT = "([a-f0-9]{40})"/)?.[1];
if (!commit) throw new Error("无法从 public-prompt-image.ts 读取 COMMIT");

const seeds = JSON.parse(await readFile(path.resolve(scriptDir, "../src/lib/prompts/original-author-seeds.json"), "utf8"));
const imagePaths = [...new Set(seeds.map((seed) => new URL(seed.coverUrl, "http://local").searchParams.get("path") || ""))].filter((value) => SAFE_IMAGE_PATH.test(value));
if (!imagePaths.length) throw new Error("没有找到提示词示例图路径");

const config = dryRun ? null : await readConfig();
const client = config
    ? new S3Client({
          region: config.region,
          endpoint: config.endpoint || undefined,
          forcePathStyle: config.forcePathStyle,
          credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
          requestChecksumCalculation: "WHEN_REQUIRED",
          responseChecksumValidation: "WHEN_REQUIRED",
      })
    : null;

const counts = { uploaded: 0, existing: 0, checked: 0 };
const failures = [];
let next = 0;
let done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
client?.destroy();

console.log(`共 ${imagePaths.length} 张：${dryRun ? `源图可读 ${counts.checked}` : `已上传 ${counts.uploaded}，已存在 ${counts.existing}`}，失败 ${failures.length}`);
for (const failure of failures) console.warn(`失败 ${failure.imagePath}：${failure.message}`);
if (failures.length) process.exitCode = 1;

async function worker() {
    while (next < imagePaths.length) {
        const imagePath = imagePaths[next++];
        try {
            await processImage(imagePath);
        } catch (error) {
            failures.push({ imagePath, message: error instanceof Error ? error.message : String(error) });
        }
        done += 1;
        if (done % 50 === 0) console.log(`进度 ${done}/${imagePaths.length}`);
    }
}

async function processImage(imagePath) {
    const key = `${config?.prefix ? `${config.prefix}/` : ""}prompt-images/${commit}/${imagePath}`;
    if (client && (await objectExists(key))) {
        counts.existing += 1;
        return;
    }
    const image = await readSourceImage(imagePath);
    if (!client) {
        counts.checked += 1;
        return;
    }
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: image.bytes, ContentLength: image.bytes.length, ContentType: image.contentType }));
    counts.uploaded += 1;
}

async function objectExists(key) {
    try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return true;
    } catch (error) {
        if (error?.name === "NotFound" || error?.Code === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return false;
        throw error;
    }
}

async function readSourceImage(imagePath) {
    const extension = imagePath.split(".").pop().toLowerCase();
    if (sourceDir) return checkedImage(await readFile(path.join(sourceDir, imagePath)), CONTENT_TYPES[extension]);
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await fetchFromGitHub(imagePath);
        } catch (error) {
            if (attempt >= 3 || error?.permanent) throw error;
            await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
        }
    }
}

async function fetchFromGitHub(imagePath) {
    const response = await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${imagePath}`, {
        headers: { Accept: "image/*", "User-Agent": "VOZEB-PRO prompt image backfill" },
        signal: AbortSignal.timeout(60_000),
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (response.status === 404) throw Object.assign(new Error("GitHub 上不存在该文件"), { permanent: true });
    if (!response.ok || !contentType.startsWith("image/")) throw new Error(`GitHub 返回 HTTP ${response.status} ${contentType}`);
    return checkedImage(Buffer.from(await response.arrayBuffer()), contentType);
}

function checkedImage(bytes, contentType) {
    if (!bytes.length) throw new Error("图片为空");
    if (bytes.length > MAX_SOURCE_BYTES) throw new Error("图片超过大小限制");
    return { bytes, contentType: contentType || "application/octet-stream" };
}

async function readConfig() {
    const env = (name) => process.env[name]?.trim() || "";
    const value = env("DATABASE_URL")
        ? await loadDisasterObjectStorageConfig({ databaseUrl: env("DATABASE_URL"), encryptionKey: env("VOZEB_PRO_ENCRYPTION_KEY") })
        : {
              endpoint: env("PROMPT_IMAGES_OSS_ENDPOINT"),
              region: env("PROMPT_IMAGES_OSS_REGION") || "us-east-1",
              bucket: env("PROMPT_IMAGES_OSS_BUCKET"),
              prefix: env("PROMPT_IMAGES_OSS_PREFIX"),
              accessKeyId: env("PROMPT_IMAGES_OSS_ACCESS_KEY_ID"),
              secretAccessKey: env("PROMPT_IMAGES_OSS_SECRET_ACCESS_KEY"),
              forcePathStyle: env("PROMPT_IMAGES_OSS_FORCE_PATH_STYLE") === "true",
          };
    const missing = ["bucket", "accessKeyId", "secretAccessKey"].filter((name) => !value[name]);
    if (missing.length) throw new Error(`缺少对象存储配置：${missing.join("、")}`);
    // Same normalization as normalizeObjectStoragePrefix on the server.
    const prefix =
        value.prefix
            .replace(/\\/g, "/")
            .split("/")
            .map((segment) => segment.trim())
            .filter(Boolean)
            .join("/") || "vozeb-pro";
    console.log(`对象存储：${value.endpoint || "AWS"} / ${value.bucket} / ${prefix}${value.enabled === false ? "（后台未启用，线上不会读取）" : ""}`);
    return { ...value, prefix };
}
