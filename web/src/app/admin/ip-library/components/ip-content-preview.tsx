"use client";

import { Alert, Tag } from "antd";

import type { IpContentFileRecord } from "@/lib/server/database/repository-types";
import { adminIpLibraryApi } from "@/services/api/admin-ip-library";

export function IpContentPreview({ ipId, file, compact = false }: { ipId: string; file?: IpContentFileRecord; compact?: boolean }) {
    if (!file) return null;
    if (file.status === "failed") return <Alert type="error" showIcon message={file.errorMessage || "文件处理失败"} />;
    if (file.status !== "ready") return <Tag color="gold">处理中</Tag>;
    const src = adminIpLibraryApi.fileUrl(ipId, file.id, file.kind === "image" ? { width: compact ? 320 : 960 } : {});
    if (file.kind === "text") {
        return (
            <pre className={`${compact ? "max-h-32" : "max-h-72"} overflow-auto whitespace-pre-wrap break-words rounded-md bg-zinc-50 p-3 text-xs leading-5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200`}>{file.extractedText || "文本内容为空"}</pre>
        );
    }
    if (file.kind === "image") return <img src={src} alt={file.originalName} className={`${compact ? "max-h-40" : "max-h-[420px]"} max-w-full rounded-md object-contain`} />;
    if (file.kind === "audio") return <audio src={src} controls preload="metadata" className="w-full max-w-full" />;
    return <video src={src} controls preload="metadata" className={`${compact ? "max-h-48" : "max-h-[420px]"} max-w-full rounded-md`} />;
}
