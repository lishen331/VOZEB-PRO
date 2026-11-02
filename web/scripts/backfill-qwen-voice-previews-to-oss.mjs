// Uploads the Qwen basic-voice preview wavs from the official zip to object storage.
//   node scripts/backfill-qwen-voice-previews-to-oss.mjs [--zip 基础音色试听音频包.zip] [--dry-run]
// OSS config: DATABASE_URL (+ VOZEB_PRO_ENCRYPTION_KEY) or PROMPT_IMAGES_OSS_* env vars, same as backfill-prompt-images-to-oss.mjs.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { unzipSync } from "fflate";

import { loadDisasterObjectStorageConfig } from "./disaster-object-storage.mjs";

const ZIP_URL = "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260720/tuuuqo/%E5%9F%BA%E7%A1%80%E9%9F%B3%E8%89%B2%E8%AF%95%E5%90%AC%E9%9F%B3%E9%A2%91%E5%8C%85.zip";
const CONCURRENCY = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const zipIndex = process.argv.indexOf("--zip");
const zipPath = zipIndex > 0 ? process.argv[zipIndex + 1] : undefined;

const catalog = JSON.parse(await readFile(path.resolve(scriptDir, "../src/lib/qwen-voice-catalog.json"), "utf8"));
const wanted = new Set(catalog.basic.voices.map((voice) => `${voice.slug}.wav`));

console.log(zipPath ? `读取 ${zipPath}` : `下载官方试听包（约 214MB）：${ZIP_URL}`);
const zipBytes = zipPath ? await readFile(zipPath) : await download(ZIP_URL);
const files = new Map();
const entries = unzipSync(new Uint8Array(zipBytes), { filter: (file) => wanted.has(file.name.split("/").pop()) && file.originalSize <= MAX_FILE_BYTES });
for (const [name, bytes] of Object.entries(entries)) files.set(name.split("/").pop(), bytes);
const missing = [...wanted].filter((file) => !files.has(file));
console.log(`目录 ${wanted.size} 个，试听包里找到 ${files.size} 个${missing.length ? `，缺少 ${missing.length} 个：${missing.slice(0, 10).join("、")}` : ""}`);
if (dryRun) {
    if (missing.length) process.exitCode = 1;
} else {
    await upload();
}

async function upload() {
    const config = await readConfig();
    const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint || undefined,
        forcePathStyle: config.forcePathStyle,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
    });
    const queue = [...files];
    const counts = { uploaded: 0, existing: 0 };
    const failures = [];
    let done = 0;
    const worker = async () => {
        while (queue.length) {
            const [file, bytes] = queue.shift();
            // Must match qwenVoicePreviewObjectKey in src/app/api/public/qwen-voice-previews/[file]/route.ts.
            const key = `${config.prefix ? `${config.prefix}/` : ""}qwen-voice-previews/${file}`;
            try {
                if (await objectExists(client, config.bucket, key)) counts.existing += 1;
                else {
                    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes, ContentLength: bytes.length, ContentType: "audio/wav", CacheControl: "public, max-age=31536000, immutable" }));
                    counts.uploaded += 1;
                }
            } catch (error) {
                failures.push({ file, message: error instanceof Error ? error.message : String(error) });
            }
            done += 1;
            if (done % 100 === 0) console.log(`进度 ${done}/${files.size}`);
        }
    };
    try {
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } finally {
        client.destroy();
    }
    console.log(`共 ${files.size} 个：已上传 ${counts.uploaded}，已存在 ${counts.existing}，失败 ${failures.length}`);
    for (const failure of failures) console.warn(`失败 ${failure.file}：${failure.message}`);
    if (failures.length || missing.length) process.exitCode = 1;
}

async function objectExists(client, bucket, key) {
    try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    } catch (error) {
        if (error?.name === "NotFound" || error?.Code === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return false;
        throw error;
    }
}

async function download(url) {
    const response = await fetch(url, { headers: { "User-Agent": "VOZEB-PRO voice preview backfill" }, signal: AbortSignal.timeout(600_000) });
    if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
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
    const missingConfig = ["bucket", "accessKeyId", "secretAccessKey"].filter((name) => !value[name]);
    if (missingConfig.length) throw new Error(`缺少对象存储配置：${missingConfig.join("、")}`);
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
