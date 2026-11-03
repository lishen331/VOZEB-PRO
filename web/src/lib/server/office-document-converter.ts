import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

/*
 * 课件转 PDF：PPTX / DOCX / XLSX 上传后，用本机的 LibreOffice 无头模式转一份 PDF，
 * 平台内的预览器只认 PDF，这样老师在备课页能直接翻页，而不是只看到一张文件卡片。
 *
 * 转换是重活（单次 6~20 秒、吃 CPU），所以走异步队列：
 * - 上传接口不等待转换，先把文件存好、把状态标成 pending，立刻返回
 * - 这里用 spawn（不是 execFileSync）跑 soffice，不阻塞 Node 的事件循环
 * - 同时最多 MAX_CONCURRENT_CONVERSIONS 个，超出的排队，避免多人上传把机器拖死
 * 转不出来（服务器没装 LibreOffice / 文件本身有问题）就标 failed，不影响原文件。
 */

/** 支持转 PDF 的扩展名 */
export const CONVERTIBLE_EXTENSIONS = [".pptx", ".docx", ".xlsx"] as const;

/** 同时最多跑几个 soffice；LibreOffice 很吃内存，默认 2 */
const MAX_CONCURRENT_CONVERSIONS = Math.max(1, Number(process.env.VOZEB_PRO_PREVIEW_CONCURRENCY || 2));

/** 单次转换超时（毫秒） */
const CONVERSION_TIMEOUT_MS = 180_000;

export function canConvertToPdf(fileName: string) {
    const extension = extname(fileName).toLowerCase();
    return (CONVERTIBLE_EXTENSIONS as readonly string[]).includes(extension);
}

/** 找可用的 LibreOffice；镜像里装的是 libreoffice，开发机 Windows 上只有 soffice.exe */
function resolveOfficeCommand() {
    if (process.env.VOZEB_PRO_OFFICE_BINARY) return process.env.VOZEB_PRO_OFFICE_BINARY;
    if (commandExists("libreoffice")) return "libreoffice";
    if (commandExists("soffice")) return "soffice";
    if (process.platform === "win32") {
        // Windows 安装包不把 soffice 放进 PATH，按默认安装位置兜底
        for (const candidate of ["C:\\Program Files\\LibreOffice\\program\\soffice.exe", "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"]) {
            if (existsSync(candidate)) return candidate;
        }
    }
    return undefined;
}

function commandExists(command: string) {
    try {
        execFileSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore", timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * 把 PDF 字节转出来。异步执行、不阻塞事件循环。
 * 传的是**文件内容**而不是路径：上传的临时目录在请求结束时就被删掉了，
 * 排队期间文件可能已经不在了，所以调用方先把字节读进来交给队列。
 */
function convertBytesToPdf(input: { bytes: Buffer; fileName: string }): Promise<Buffer | null> {
    const office = resolveOfficeCommand();
    if (!office) return Promise.resolve(null);
    const extension = extname(input.fileName).toLowerCase();
    const workDirectory = mkdtempSync(join(tmpdir(), "vozeb-office-convert-"));
    return new Promise<Buffer | null>((resolve) => {
        let settled = false;
        const finish = (value: Buffer | null) => {
            if (settled) return;
            settled = true;
            try {
                rmSync(workDirectory, { recursive: true, force: true });
            } catch {
                // 清理失败不影响结果
            }
            resolve(value);
        };
        try {
            const sourcePath = join(workDirectory, `source${extension}`);
            writeFileSync(sourcePath, input.bytes);
            const pdfPath = join(workDirectory, "source.pdf");
            // 每次转换用独立 profile：默认 profile 被占用时 soffice 会静默挂起
            const profileUrl = `file:///${join(workDirectory, "office-profile").replace(/\\/g, "/")}`;
            execFile(office, ["--headless", "--norestore", `-env:UserInstallation=${profileUrl}`, "--convert-to", "pdf", "--outdir", workDirectory, sourcePath], { timeout: CONVERSION_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (error) => {
                if (error || !existsSync(pdfPath)) {
                    finish(null);
                    return;
                }
                try {
                    const pdf = readFileSync(pdfPath);
                    finish(pdf.length ? pdf : null);
                } catch {
                    finish(null);
                }
            });
        } catch {
            finish(null);
        }
    });
}

/* ===== 队列：限制并发、按提交顺序执行 ===== */

type QueueJob = { input: { bytes: Buffer; fileName: string }; resolve: (value: Buffer | null) => void };

const pending: QueueJob[] = [];
let running = 0;

function drain() {
    while (running < MAX_CONCURRENT_CONVERSIONS && pending.length) {
        const job = pending.shift();
        if (!job) break;
        running += 1;
        void convertBytesToPdf(job.input)
            .catch(() => null)
            .then((value) => {
                running -= 1;
                job.resolve(value);
                drain();
            });
    }
}

/** 把一次转换排进队列；返回的 Promise 在转换完成（或失败）时 resolve 成 PDF 字节或 null */
export function enqueuePdfConversion(input: { bytes: Buffer; fileName: string }): Promise<Buffer | null> {
    return new Promise<Buffer | null>((resolve) => {
        pending.push({ input, resolve });
        drain();
    });
}

/** 队列里还有多少在等（给健康检查 / 调试用） */
export function pdfConversionQueueDepth() {
    return { running, waiting: pending.length };
}

/** 同步转换，只给脚本 / 测试用；线上走 enqueuePdfConversion */
export function convertDocumentToPdfSync(sourcePath: string, outputDirectory: string): Buffer | null {
    const office = resolveOfficeCommand();
    if (!office) return null;
    const pdfPath = join(outputDirectory, `${basename(sourcePath, extname(sourcePath))}.pdf`);
    const profileUrl = `file:///${join(outputDirectory, "office-profile").replace(/\\/g, "/")}`;
    try {
        execFileSync(office, ["--headless", "--norestore", `-env:UserInstallation=${profileUrl}`, "--convert-to", "pdf", "--outdir", outputDirectory, sourcePath], { stdio: "ignore", timeout: CONVERSION_TIMEOUT_MS });
    } catch {
        return null;
    }
    if (!existsSync(pdfPath)) return null;
    try {
        const buffer = readFileSync(pdfPath);
        return buffer.length ? buffer : null;
    } catch {
        return null;
    }
}
