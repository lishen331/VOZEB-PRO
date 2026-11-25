"use client";

import { saveAs } from "file-saver";
import { FileSpreadsheet, ImagePlus, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/gamma-ui/gamma-ant";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Modal } from "@/components/gamma-ui/gamma-ant-modal";
import { Select } from "@/components/gamma-ui/gamma-ant-select";
import { creativeUploadLimitMessage, creativeUploadMaxBytes } from "@/lib/creative-upload";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { matchOfficialWorkImportFiles, OFFICIAL_WORK_IMPORT_CSV_TEMPLATE, parseOfficialWorkImportCsvBytes, type OfficialWorkImportRow } from "@/lib/official-work-import";
import { WORK_CATEGORY_OPTIONS } from "@/lib/work-publication-options";
import { createOfficialWork, uploadOfficialWorkMedia, type OfficialWorkMedia } from "@/services/api/work-publications";
import { AdminOfficialWorkMediaPicker } from "./admin-official-work-media-picker";

type ImportRow = OfficialWorkImportRow & { importKey: string; saved?: boolean; error?: string };
type MediaSource = { name: string; type: string } & ({ file: File; asset?: never } | { file?: never; asset: OfficialWorkMedia });

export function AdminOfficialWorkImport({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [sources, setSources] = useState<MediaSource[]>([]);
    const [previewUrls, setPreviewUrls] = useState<Map<File, string>>(new Map());
    const [readableMedia, setReadableMedia] = useState<Set<MediaSource>>(new Set());
    const [brokenMedia, setBrokenMedia] = useState<Set<MediaSource>>(new Set());
    const [manifestError, setManifestError] = useState("");
    const [reading, setReading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const uploaded = useRef(new Map<File, OfficialWorkMedia>());
    const inFlight = useRef(false);

    useEffect(() => {
        const urls = new Map(sources.flatMap(({ file }) => (file ? [[file, URL.createObjectURL(file)] as const] : [])));
        setPreviewUrls(urls);
        return () => urls.forEach((url) => URL.revokeObjectURL(url));
    }, [sources]);

    const pending = rows.filter((row) => !row.saved);
    const matches = new Map(pending.map((row) => [row.row, matchOfficialWorkImportFiles([row], sources)]));
    const signatures = new Set<string>();
    const duplicates = new Set<number>();
    for (const row of rows) {
        const signature = JSON.stringify([row.title.trim(), row.coverFile, [...row.mediaFiles].sort()]);
        if (signatures.has(signature)) duplicates.add(row.row);
        signatures.add(signature);
    }
    const rowError = (row: ImportRow) => {
        if (row.saved) return "";
        if (!row.title.trim()) return "请填写作品标题";
        if (row.title.length > 100 || row.description.length > 2000 || row.publicPrompt.length > 8000 || row.authorName.length > 80) return "标题、简介、公开提示词或作者名超过长度限制";
        if (row.authorDisplay === "custom" && !row.authorName.trim()) return "请填写作者名";
        if (duplicates.has(row.row)) return "导入清单中存在重复作品";
        const match = matches.get(row.row)!;
        if (!match.ok) return match.message;
        const assets = [match.rows[0].coverFileObject, ...match.rows[0].mediaFileObjects];
        const broken = assets.find((source) => brokenMedia.has(source));
        if (broken) return `无法预览媒体“${broken.name}”，请替换文件`;
        for (const { file, type, name } of assets) {
            if (!file) continue;
            const kind = type.startsWith("image/") ? "image" : "video";
            if (!file.size) return `媒体“${name}”为空文件`;
            if (file.size > creativeUploadMaxBytes(kind)) return `${name}：${creativeUploadLimitMessage(kind)}`;
        }
        return "";
    };
    const ready = pending.filter((row) => {
        const match = matches.get(row.row);
        return match?.ok && !rowError(row) && [match.rows[0].coverFileObject, ...match.rows[0].mediaFileObjects].every((source) => readableMedia.has(source));
    });
    const hasResults = rows.some((row) => row.saved || row.error);
    const savedCount = rows.filter((row) => row.saved).length;
    const failedCount = rows.filter((row) => row.error).length;

    async function readManifest(file: File) {
        setReading(true);
        setManifestError("");
        setRows([]);
        try {
            const parsed = parseOfficialWorkImportCsvBytes(await file.arrayBuffer());
            if (parsed.ok) setRows(parsed.rows.map((row) => ({ ...row, importKey: crypto.randomUUID() })));
            else setManifestError((parsed.row ? `第 ${parsed.row} 条记录：` : "") + parsed.message);
        } catch {
            setManifestError("无法读取 CSV 清单");
        } finally {
            setReading(false);
        }
    }

    async function importDrafts() {
        if (inFlight.current || ready.length === 0) return;
        inFlight.current = true;
        setBusy(true);
        const uploadErrors = new Map<File, Error>();
        const ensureMedia = async (source: MediaSource) => {
            if (source.asset) return source.asset;
            if (uploadErrors.has(source.file)) throw uploadErrors.get(source.file);
            const existing = uploaded.current.get(source.file);
            if (existing) return existing;
            try {
                const result = await uploadOfficialWorkMedia(source.file);
                uploaded.current.set(source.file, result);
                return result;
            } catch (error) {
                const failure = new Error(`${source.name}：${error instanceof Error ? error.message : "媒体上传失败"}`);
                uploadErrors.set(source.file, failure);
                throw failure;
            }
        };
        let savedAny = false;
        try {
            for (const row of ready) {
                const match = matches.get(row.row);
                if (!match?.ok) continue;
                let result: Pick<ImportRow, "saved" | "error">;
                try {
                    const { coverFileObject, mediaFileObjects } = match.rows[0];
                    const cover = await ensureMedia(coverFileObject);
                    const keys = [];
                    for (const source of mediaFileObjects) keys.push((await ensureMedia(source)).storageKey);
                    await createOfficialWork({
                        importKey: row.importKey,
                        title: row.title,
                        description: row.description,
                        publicPrompt: row.publicPrompt,
                        category: row.category,
                        tags: row.tags,
                        authorDisplay: row.authorDisplay,
                        authorName: row.authorDisplay === "custom" ? row.authorName : undefined,
                        coverStorageKey: cover.storageKey,
                        assetStorageKeys: keys,
                    });
                    result = { saved: true, error: undefined };
                    savedAny = true;
                } catch (error) {
                    result = { saved: false, error: error instanceof Error ? error.message : "草稿保存失败" };
                }
                setRows((current) => current.map((item) => (item.row === row.row ? { ...item, ...result } : item)));
            }
        } finally {
            inFlight.current = false;
            setBusy(false);
            if (savedAny) onSaved();
        }
    }

    return (
        <>
            <Modal
                title="批量导入官方作品草稿"
                open
                width="min(900px, calc(100vw - 24px))"
                confirmLoading={busy}
                onCancel={() => {
                    if (!busy && !reading) onClose();
                }}
                okText={rows.length && !pending.length ? "关闭" : `${hasResults ? "重试导入" : "导入"} ${ready.length} 条草稿`}
                okButtonProps={{ disabled: reading || (ready.length === 0 && (rows.length === 0 || pending.length > 0)) }}
                onOk={() => {
                    if (rows.length && !pending.length) onClose();
                    else void importDrafts();
                }}
            >
                <p className="mb-3 text-sm text-zinc-500">按 CSV 中的文件名选择对应媒体。预览并确认后保存为草稿。多个媒体或标签用 | 分隔。</p>
                <div className="flex flex-wrap gap-2">
                    <Button icon={<FileSpreadsheet className="size-4" />} onClick={() => saveAs(new Blob([OFFICIAL_WORK_IMPORT_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }), "官方作品批量导入模板.csv")}>
                        下载 CSV 模板
                    </Button>
                    <label className="gm-btn inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--gm-border)] px-3 py-1.5 text-sm has-[:disabled]:cursor-not-allowed">
                        <Upload className="size-4" />
                        上传 CSV 清单
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            className="sr-only"
                            disabled={busy || reading || hasResults}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (file) void readManifest(file);
                            }}
                        />
                    </label>
                    <label className="gm-btn inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--gm-border)] px-3 py-1.5 text-sm has-[:disabled]:cursor-not-allowed">
                        <ImagePlus className="size-4" />
                        选择图片和视频
                        <input
                            type="file"
                            multiple
                            accept="image/*,video/*"
                            className="sr-only"
                            disabled={busy}
                            onChange={(event) => {
                                const files = [...(event.target.files ?? [])];
                                event.target.value = "";
                                setSources((current) => [...current, ...files.map((file) => ({ name: file.name, type: file.type, file }))]);
                            }}
                        />
                    </label>
                    <Button disabled={busy} onClick={() => setPickerOpen(true)}>
                        选择已有媒体
                    </Button>
                </div>
                {sources.length ? (
                    <ul className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="已选媒体">
                        {sources.map((source, index) => (
                            <li key={index} className="inline-flex max-w-full items-center gap-1 rounded border border-[var(--gm-border)] pl-2">
                                <span className="truncate">{source.name}</span>
                                <Button type="text" size="small" disabled={busy} aria-label={`移除媒体 ${source.name}`} onClick={() => setSources((current) => current.filter((item) => item !== source))}>
                                    移除
                                </Button>
                            </li>
                        ))}
                    </ul>
                ) : null}
                {manifestError ? (
                    <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-300">
                        {manifestError}
                    </p>
                ) : null}
                {hasResults ? (
                    <p role="status" className="mt-3 text-sm">
                        {savedCount} 条草稿已创建，{failedCount} 条失败
                    </p>
                ) : null}
                <div className="mt-3 max-h-[50vh] min-w-0 space-y-2 overflow-y-auto">
                    {rows.map((row) => {
                        const match = matches.get(row.row);
                        const error = rowError(row) || row.error;
                        const update = (patch: Partial<OfficialWorkImportRow>) => setRows((current) => current.map((item) => (item.row === row.row ? { ...item, ...patch, error: undefined } : item)));
                        return (
                            <article key={row.row} data-testid="official-work-import-row" className="min-w-0 rounded-md border border-[var(--gm-border)] p-2.5">
                                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                    <h3 className="min-w-0 break-all text-sm font-medium">{row.title || `第 ${row.row} 条作品`}</h3>
                                    {row.saved ? (
                                        <span className="text-xs">已保存为草稿</span>
                                    ) : (
                                        <Button size="small" type="text" disabled={busy} onClick={() => setRows((current) => current.filter((item) => item.row !== row.row))}>
                                            移除作品
                                        </Button>
                                    )}
                                </div>
                                <p className="mt-1 break-all text-xs text-zinc-500">
                                    {row.category} · {row.tags.join("、") || "无标签"} · {row.authorDisplay === "hidden" ? "隐藏署名" : row.authorName}
                                </p>
                                {row.description ? <p className="mt-1 break-words text-sm">{row.description}</p> : null}
                                {match?.ok ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {[...new Set([match.rows[0].coverFileObject, ...match.rows[0].mediaFileObjects])].map((source) => {
                                            const src = source.file ? previewUrls.get(source.file) : source.asset.previewUrl;
                                            if (!src) return null;
                                            const onError = () => setBrokenMedia((current) => new Set(current).add(source));
                                            const onReady = () => setReadableMedia((current) => (current.has(source) ? current : new Set(current).add(source)));
                                            return source.type.startsWith("image/") ? (
                                                <img key={source.name} src={imagePreviewUrl(src, 480)} alt={source.name} onLoad={onReady} onError={onError} className="h-24 max-w-full rounded object-contain" />
                                            ) : (
                                                <video key={source.name} src={src} title={source.name} muted controls preload="metadata" onLoadedMetadata={onReady} onError={onError} className="h-24 max-w-full rounded" />
                                            );
                                        })}
                                    </div>
                                ) : null}
                                {!row.saved && !busy ? (
                                    <details className="mt-2 text-sm">
                                        <summary className="cursor-pointer">修改作品信息</summary>
                                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                            <label>
                                                标题
                                                <Input value={row.title} maxLength={100} onChange={(event) => update({ title: event.target.value })} />
                                            </label>
                                            <div>
                                                分类
                                                <Select aria-label="分类" className="w-full" value={row.category} options={WORK_CATEGORY_OPTIONS} onChange={(category) => update({ category })} />
                                            </div>
                                            <label>
                                                标签（用 | 分隔）
                                                <Input
                                                    defaultValue={row.tags.join("|")}
                                                    onChange={(event) =>
                                                        update({
                                                            tags: event.target.value
                                                                .split("|")
                                                                .map((tag) => tag.trim())
                                                                .filter(Boolean),
                                                        })
                                                    }
                                                />
                                            </label>
                                            <label>
                                                作者
                                                <Input disabled={row.authorDisplay === "hidden"} value={row.authorName} onChange={(event) => update({ authorName: event.target.value })} />
                                            </label>
                                            <label className="flex items-center gap-2">
                                                <input type="checkbox" className="gm-checkbox" checked={row.authorDisplay === "hidden"} onChange={(event) => update({ authorDisplay: event.target.checked ? "hidden" : "custom" })} />
                                                隐藏署名
                                            </label>
                                            <label>
                                                封面文件名
                                                <Input value={row.coverFile} onChange={(event) => update({ coverFile: event.target.value })} />
                                            </label>
                                            <label className="sm:col-span-2">
                                                媒体文件名（用 | 分隔）
                                                <Input
                                                    defaultValue={row.mediaFiles.join("|")}
                                                    onChange={(event) =>
                                                        update({
                                                            mediaFiles: [
                                                                ...new Set(
                                                                    event.target.value
                                                                        .split("|")
                                                                        .map((name) => name.trim())
                                                                        .filter(Boolean),
                                                                ),
                                                            ],
                                                        })
                                                    }
                                                />
                                            </label>
                                            <label className="sm:col-span-2">
                                                简介
                                                <Input.TextArea value={row.description} onChange={(event) => update({ description: event.target.value })} />
                                            </label>
                                            <label className="sm:col-span-2">
                                                公开提示词
                                                <Input.TextArea value={row.publicPrompt} onChange={(event) => update({ publicPrompt: event.target.value })} />
                                            </label>
                                        </div>
                                    </details>
                                ) : null}
                                {error ? (
                                    <p role="alert" className="mt-2 break-words text-sm text-rose-600 dark:text-rose-300">
                                        {error}
                                    </p>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            </Modal>
            {pickerOpen ? (
                <AdminOfficialWorkMediaPicker
                    open
                    selected={sources.flatMap((source) => (source.asset ? [source.asset.storageKey] : []))}
                    imagesAndVideosOnly
                    onClose={() => setPickerOpen(false)}
                    onSelect={(asset) => setSources((current) => [...current, { name: asset.originalName, type: asset.mimeType, asset }])}
                />
            ) : null}
        </>
    );
}
