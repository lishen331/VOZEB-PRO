"use client";

import { App, Button, Input, Select, Tooltip, Upload } from "antd";
import { FileText, Trash2, Upload as UploadIcon, X } from "lucide-react";
import { useState } from "react";

import type { IpAssetKind } from "@/lib/ip-library-domain";
import type { IpContentFileRecord } from "@/lib/server/database/repository-types";
import { adminIpLibraryApi } from "@/services/api/admin-ip-library";
import { IpContentPreview } from "./ip-content-preview";

const ACCEPT: Record<IpAssetKind, string> = {
    text: ".txt,.md,text/plain,text/markdown",
    image: ".jpg,.jpeg,.png,.webp,.gif,.avif,image/jpeg,image/png,image/webp,image/gif,image/avif",
    audio: ".mp3,.wav,.ogg,.opus,.aac,.flac,.m4a,audio/*",
    video: ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime",
};

export function IpContentUpload({
    variant = "default",
    ipId,
    subIpId,
    kind,
    files,
    value,
    onChange,
    onUploaded,
    onDeleted,
    disabled = false,
}: {
    variant?: "default" | "cover";
    ipId: string;
    subIpId: string;
    kind: IpAssetKind;
    files: IpContentFileRecord[];
    value?: string;
    onChange?: (value?: string) => void;
    onUploaded: (file: IpContentFileRecord) => void;
    onDeleted?: (fileId: string) => void;
    disabled?: boolean;
}) {
    const { message } = App.useApp();
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [manualText, setManualText] = useState("");
    const selected = files.find((file) => file.id === value);
    const upload = async (file: File) => {
        setUploading(true);
        try {
            const record = await adminIpLibraryApi.uploadFile(ipId, subIpId, kind, file);
            onUploaded(record);
            onChange?.(record.id);
            message.success("IP 文件已上传");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "IP 文件上传失败");
        } finally {
            setUploading(false);
        }
    };
    const deleteFile = async () => {
        if (!selected) return;
        setDeleting(true);
        try {
            await adminIpLibraryApi.deleteFile(ipId, selected.id);
            onChange?.(undefined);
            onDeleted?.(selected.id);
            message.success("未引用的 IP 原文件已删除");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除 IP 原文件失败");
        } finally {
            setDeleting(false);
        }
    };
    return (
        <div className={variant === "cover" ? "w-full max-w-[30rem] space-y-3" : "space-y-2"}>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Select
                    allowClear
                    disabled={disabled}
                    value={value}
                    placeholder="选择已上传的 IP 文件"
                    options={files.filter((file) => file.kind === kind).map((file) => ({ value: file.id, label: `${file.originalName}${file.status === "ready" ? "" : ` · ${file.status === "failed" ? "失败" : "处理中"}`}` }))}
                    onChange={onChange}
                />
                <Upload
                    accept={ACCEPT[kind]}
                    maxCount={1}
                    showUploadList={false}
                    disabled={disabled}
                    beforeUpload={(file) => {
                        void upload(file);
                        return Upload.LIST_IGNORE;
                    }}
                >
                    <Button icon={<UploadIcon className="size-4" />} disabled={disabled} loading={uploading}>
                        上传原文件
                    </Button>
                </Upload>
            </div>
            {kind === "text" ? (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Input.TextArea value={manualText} rows={3} placeholder="手工录入正文" onChange={(event) => setManualText(event.target.value)} />
                    <Button icon={<FileText className="size-4" />} disabled={disabled || !manualText.trim()} loading={uploading} onClick={() => void upload(new File([manualText], "手工正文.txt", { type: "text/plain;charset=utf-8" }))}>
                        保存正文
                    </Button>
                </div>
            ) : null}
            {selected ? (
                <div className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
                        <span className="min-w-0 truncate" title={selected.originalName}>
                            {selected.originalName}
                        </span>
                        <div className="flex items-center">
                            <Tooltip title="取消选择">
                                <Button type="text" size="small" disabled={disabled || deleting} icon={<X className="size-3.5" />} aria-label="取消选择当前文件" onClick={() => onChange?.(undefined)} />
                            </Tooltip>
                            <Tooltip title="删除未引用原文件">
                                <Button type="text" danger size="small" disabled={disabled} loading={deleting} icon={<Trash2 className="size-3.5" />} aria-label="删除未引用原文件" onClick={() => void deleteFile()} />
                            </Tooltip>
                        </div>
                    </div>
                    <div className={variant === "cover" && selected.kind === "image" ? "flex aspect-[4/3] w-full max-w-[22rem] items-center justify-center overflow-hidden rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900" : undefined}>
                        <IpContentPreview ipId={ipId} file={selected} compact />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
