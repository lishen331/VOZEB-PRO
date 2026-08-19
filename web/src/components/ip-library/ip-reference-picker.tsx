"use client";

import { App, Button, Checkbox, Empty, Input, Modal, Segmented, Spin, Tag } from "antd";
import { BookOpen, ImageIcon, LibraryBig, Music2, Plus, Search, Trash2, Video } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { IpReference } from "@/lib/ip-library-domain";
import type { IpDetail, IpSummary } from "@/lib/server/ip-library-service";
import { ipLibraryApi } from "@/services/api/ip-library";

type ResolvedReference = { reference: IpReference; detail?: IpDetail; error?: string };

export function IpReferencePicker({ value, onChange, compact = false }: { value: IpReference[]; onChange: (references: IpReference[]) => void; compact?: boolean }) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    const [scope, setScope] = useState<"public" | "school">("public");
    const [keyword, setKeyword] = useState("");
    const [submittedKeyword, setSubmittedKeyword] = useState("");
    const [items, setItems] = useState<IpSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<IpDetail>();
    const [selecting, setSelecting] = useState(false);
    const [selectionMode, setSelectionMode] = useState<"all" | "items">("all");
    const [itemIds, setItemIds] = useState<string[]>([]);
    const [resolved, setResolved] = useState<ResolvedReference[]>([]);
    const listRequest = useRef(0);
    const resolveRequest = useRef(0);
    const valueKey = useMemo(() => JSON.stringify(value), [value]);

    useEffect(() => {
        const requestId = ++resolveRequest.current;
        const references = JSON.parse(valueKey) as IpReference[];
        if (!references.length) {
            setResolved([]);
            return;
        }
        void Promise.all(
            references.map(async (reference) => {
                try {
                    return { reference, detail: await ipLibraryApi.get(reference.id, reference.versionId) };
                } catch (error) {
                    return { reference, error: error instanceof Error ? error.message : "IP 授权已失效" };
                }
            }),
        ).then((next) => resolveRequest.current === requestId && setResolved(next));
    }, [valueKey]);

    const load = useCallback(
        async (nextScope: "public" | "school", nextKeyword: string) => {
            const requestId = ++listRequest.current;
            setLoading(true);
            try {
                const result = await ipLibraryApi.list({ scope: nextScope, page: 1, pageSize: 20, keyword: nextKeyword || undefined });
                if (listRequest.current === requestId) setItems(result.items);
            } catch (error) {
                if (listRequest.current !== requestId) return;
                setItems([]);
                message.error(error instanceof Error ? error.message : "IP 库加载失败");
            } finally {
                if (listRequest.current === requestId) setLoading(false);
            }
        },
        [message],
    );

    useEffect(() => {
        if (open && !selected) void load(scope, submittedKeyword);
    }, [load, open, scope, selected, submittedKeyword]);

    const choose = async (summary: IpSummary) => {
        setSelecting(true);
        try {
            const detail = await ipLibraryApi.get(summary.id, summary.currentVersionId);
            setSelected(detail);
            setSelectionMode("all");
            setItemIds([]);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "IP 详情加载失败");
        } finally {
            setSelecting(false);
        }
    };

    const confirm = () => {
        if (!selected) return;
        try {
            const reference: IpReference = {
                type: "ip",
                id: selected.id,
                versionId: selected.version.id,
                itemIds: selectedIpItemIds(
                    selectionMode,
                    itemIds,
                    selected.version.items.map((item) => item.id),
                ),
            };
            onChange(upsertIpReference(value, reference));
            setOpen(false);
            setSelected(undefined);
            message.success("IP 引用已加入项目");
        } catch (error) {
            message.warning(error instanceof Error ? error.message : "请选择 IP 内容");
        }
    };

    return (
        <section className={compact ? "min-w-0" : "border-t border-border pt-4"} data-ip-reference-picker>
            <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold">引用 IP</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">固定到已发布版本，移除只解除当前项目关系。</p>
                </div>
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => setOpen(true)}>
                    添加
                </Button>
            </div>
            {resolved.length ? (
                <div className="mt-3 grid gap-2">
                    {resolved.map(({ reference, detail, error }) => (
                        <article key={`${reference.id}:${reference.versionId}`} className="flex min-w-0 items-center gap-2 border border-border bg-background p-2">
                            <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden bg-muted/50">
                                {detail?.coverPreviewUrl ? <Image fill sizes="48px" src={detail.coverPreviewUrl} alt={detail.title} className="object-cover" /> : <LibraryBig className="size-4 text-muted-foreground" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{detail?.title || "IP 授权已失效"}</p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail ? `${detail.version.title} · ${reference.itemIds.length ? `${reference.itemIds.length} 项内容` : "完整版本"}` : error}</p>
                            </div>
                            <Button type="text" danger icon={<Trash2 className="size-3.5" />} aria-label="移除 IP 引用" onClick={() => onChange(value.filter((item) => item.id !== reference.id || item.versionId !== reference.versionId))} />
                        </article>
                    ))}
                </div>
            ) : (
                <p className="mt-3 text-xs text-muted-foreground">尚未引用 IP 内容</p>
            )}

            <Modal
                title={selected ? "选择引用内容" : "引用 IP"}
                open={open}
                width={720}
                style={{ maxWidth: "calc(100vw - 16px)" }}
                destroyOnHidden
                okText="确认引用"
                cancelText="取消"
                okButtonProps={{ disabled: !selected }}
                onOk={confirm}
                onCancel={() => {
                    setOpen(false);
                    setSelected(undefined);
                }}
            >
                {selected ? (
                    <div className="min-w-0">
                        <button type="button" className="mb-3 text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(undefined)}>
                            返回 IP 列表
                        </button>
                        <div className="flex min-w-0 items-center gap-3 border-b border-border pb-3">
                            <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden bg-muted/50">
                                {selected.coverPreviewUrl ? <Image fill sizes="56px" src={selected.coverPreviewUrl} alt={selected.title} className="object-cover" /> : <LibraryBig className="size-5" />}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate font-medium">{selected.title}</p>
                                <p className="mt-1 truncate text-xs text-muted-foreground">{selected.version.title}</p>
                            </div>
                        </div>
                        <div className="mt-3">
                            <Segmented
                                block
                                value={selectionMode}
                                options={[
                                    { label: "完整版本", value: "all" },
                                    { label: "选择内容项", value: "items" },
                                ]}
                                onChange={(mode) => setSelectionMode(mode as "all" | "items")}
                            />
                        </div>
                        {selectionMode === "items" ? (
                            <div className="mt-3 max-h-[42vh] overflow-y-auto" aria-label="IP 内容项">
                                <Checkbox.Group value={itemIds} onChange={(ids) => setItemIds(ids.map(String))} className="!block !w-full">
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {selected.version.items.map((item) => (
                                            <label key={item.id} className="flex min-w-0 cursor-pointer items-center gap-2 border border-border p-2 hover:bg-muted/30">
                                                <Checkbox value={item.id} />
                                                <IpKindIcon kind={item.kind} />
                                                <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                                            </label>
                                        ))}
                                    </div>
                                </Checkbox.Group>
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-muted-foreground">将引用这个已发布版本的全部 {selected.version.items.length} 项内容。</p>
                        )}
                    </div>
                ) : (
                    <div className="min-w-0">
                        <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)]">
                            <Segmented
                                block
                                value={scope}
                                options={[
                                    { label: "公共 IP", value: "public" },
                                    { label: "本校 IP", value: "school" },
                                ]}
                                onChange={(next) => {
                                    setScope(next as "public" | "school");
                                    setKeyword("");
                                    setSubmittedKeyword("");
                                    setItems([]);
                                }}
                            />
                            <Input.Search allowClear value={keyword} prefix={<Search className="size-3.5" />} placeholder="搜索 IP" onChange={(event) => setKeyword(event.target.value)} onSearch={(next) => setSubmittedKeyword(next.trim())} />
                        </div>
                        {loading || selecting ? (
                            <div className="grid min-h-48 place-items-center">
                                <Spin />
                            </div>
                        ) : items.length ? (
                            <div className="mt-3 grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2">
                                {items.map((item) => (
                                    <button key={item.id} type="button" className="flex min-w-0 items-center gap-3 border border-border p-2 text-left hover:border-foreground/40 hover:bg-muted/30" onClick={() => void choose(item)}>
                                        <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden bg-muted/50">
                                            {item.coverPreviewUrl ? <Image fill sizes="56px" src={item.coverPreviewUrl} alt={item.title} className="object-cover" /> : <LibraryBig className="size-5 text-muted-foreground" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{item.title}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                版本 {item.versionNumber} · {item.itemCount} 项
                                            </p>
                                            {item.isExclusive ? <Tag className="!mt-1 !mr-0">独家授权</Tag> : null}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可引用的 IP" className="!my-10" />
                        )}
                    </div>
                )}
            </Modal>
        </section>
    );
}

export function ipReferenceFromQuery(params: Pick<URLSearchParams, "get">): IpReference | undefined {
    const id = params.get("ipId")?.trim();
    const versionId = params.get("versionId")?.trim();
    return id && versionId ? { type: "ip", id, versionId, itemIds: [] } : undefined;
}

export function selectedIpItemIds(mode: "all" | "items", selected: string[], available: string[]) {
    if (mode === "all") return [];
    const allowed = new Set(available);
    const itemIds = Array.from(new Set(selected.filter((id) => allowed.has(id))));
    if (!itemIds.length) throw new Error("至少选择一个 IP 内容项");
    return itemIds;
}

export function upsertIpReference(references: IpReference[], next: IpReference) {
    return [...references.filter((item) => item.id !== next.id || item.versionId !== next.versionId), next];
}

function IpKindIcon({ kind }: { kind: "text" | "image" | "audio" | "video" }) {
    const Icon = kind === "text" ? BookOpen : kind === "image" ? ImageIcon : kind === "audio" ? Music2 : Video;
    return <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}
