import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

/*
 * 课件转 PDF：PPTX / DOCX / XLSX 上传后，用本机的 LibreOffice 无头模式转一份 PDF，
 * 平台内的预览器只认 PDF，这样老师在备课页能直接翻页，而不是只看到一张文件卡片。
 *
 * 转不出来时不阻塞上传：调用方拿到 null 就按原样返回，预览降级成文件卡片。
 */

/** 支持转 PDF 的扩展名 */
export const CONVERTIBLE_EXTENSIONS = [".pptx", ".docx", ".xlsx"] as const;

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
 * 把 sourcePath 转成 PDF，返回 PDF 字节；转换失败返回 null。
 * outputDirectory 由调用方给（通常是上传用的临时目录），转换产物落在同目录。
 */
export function convertDocumentToPdf(sourcePath: string, outputDirectory: string): Buffer | null {
    const office = resolveOfficeCommand();
    if (!office) return null;
    const pdfPath = join(outputDirectory, `${basename(sourcePath, extname(sourcePath))}.pdf`);
    // 每次转换用独立 profile：默认 profile 被占用时 soffice 会静默挂起，转换永远不返回
    const profileDirectory = join(outputDirectory, "office-profile");
    const profileUrl = `file:///${profileDirectory.replace(/\\/g, "/")}`;
    try {
        execFileSync(office, ["--headless", "--norestore", `-env:UserInstallation=${profileUrl}`, "--convert-to", "pdf", "--outdir", outputDirectory, sourcePath], {
            stdio: "ignore",
            timeout: 180000,
        });
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
