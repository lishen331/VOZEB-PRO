"use client";

import type { TableColumnsType } from "@/components/gamma-ui/gamma-ant-table";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Table } from "@/components/gamma-ui/gamma-ant-table";
import { Select } from "@/components/gamma-ui/gamma-ant-select";
import { Modal } from "@/components/gamma-ui/gamma-ant-modal";
import { Tooltip } from "@/components/gamma-ui/gamma-ant-overlay";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Button, Pagination, Segmented, Switch, Tag } from "@/components/gamma-ui/gamma-ant";
import { Ban, Check, Eye, FileSpreadsheet, Film, GalleryVerticalEnd, Pencil, Pin, PinOff, Plus, RefreshCw, RotateCcw, Search, Star, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Panel, PanelHeader } from "@/components/admin/admin-panel";
import { AdminAccountId, AdminUserIdentity } from "@/components/admin/admin-user-identity";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { cn } from "@/lib/utils";
import { displayWorkCount } from "@/lib/work-display-count";
import { workStatusToneClass } from "@/lib/work-publication-status";
import { setAdminWorkFeatured, setAdminWorkPullFilm, type AdminWorkPullFilmState } from "@/services/api/work-governance";
import {
    deleteAdminWorkPublication,
    listAdminWorkPublications,
    publishOfficialWork,
    relistOfficialWork,
    reviewAdminWorkPublication,
    takeDownAdminWorkPublication,
    updateAdminWorkPresentation,
    type WorkPublication,
    type WorkPublicationLifecycleStatus,
    type WorkPublicationModerationStatus,
    type WorkPublicationOrigin,
    type WorkPublicationVisibility,
} from "@/services/api/work-publications";
import { AdminWorkCasesSection } from "./admin-work-cases-section";
import { AdminOfficialWorkEditor } from "./admin-official-work-editor";
import { AdminOfficialWorkImport } from "./admin-official-work-import";
import { AdminWorkDisplayCounts } from "./admin-work-display-counts";

const PAGE_SIZE = 12;
const BATCH_WORK_ACTIONS = { "take-down": "批量下架作品", delete: "批量删除已下架作品" } as const;
type BatchWorkAction = keyof typeof BATCH_WORK_ACTIONS;
const STATUS_OPTIONS: Array<{ value: WorkPublicationModerationStatus | "all"; label: string }> = [
    { value: "all", label: "全部" },
    { value: "draft", label: "草稿" },
    { value: "pending", label: "待审核" },
    { value: "approved", label: "已通过" },
    { value: "rejected", label: "已驳回" },
    { value: "taken_down", label: "已下架" },
];

export function AdminWorksSection() {
    const [view, setView] = useState<"reviews" | "governance">("reviews");
    return (
        <div className="min-w-0 space-y-3">
            <div className="flex justify-end">
                <Segmented
                    value={view}
                    options={[
                        { value: "reviews", label: "作品审核" },
                        { value: "governance", label: "举报申诉" },
                    ]}
                    onChange={(value) => setView(value as typeof view)}
                />
            </div>
            {view === "reviews" ? <AdminWorkReviewSection /> : <AdminWorkCasesSection />}
        </div>
    );
}

function AdminWorkReviewSection() {
    const { message, modal } = App.useApp();
    const requestIdRef = useRef(0);
    const [items, setItems] = useState<WorkPublication[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<WorkPublicationModerationStatus | "all">("all");
    const [lifecycleStatus, setLifecycleStatus] = useState<WorkPublicationLifecycleStatus | "all">("all");
    const [origin, setOrigin] = useState<WorkPublicationOrigin | "all">("all");
    const [pinnedOnly, setPinnedOnly] = useState(false);
    const [adjustedOnly, setAdjustedOnly] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [debouncedKeyword, setDebouncedKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [actionId, setActionId] = useState("");
    const [reasonAction, setReasonAction] = useState<{ work: WorkPublication; kind: "reject" | "take-down" }>();
    const [reason, setReason] = useState("");
    const [adjustingWork, setAdjustingWork] = useState<WorkPublication>();
    const [viewingWork, setViewingWork] = useState<WorkPublication>();
    const [editingOfficialWork, setEditingOfficialWork] = useState<WorkPublication | null>();
    const [officialEditorOpen, setOfficialEditorOpen] = useState(false);
    const [selectedWorkIds, setSelectedWorkIds] = useState<string[]>([]);
    const [bulkImportOpen, setBulkImportOpen] = useState(false);
    const [bulkPublishing, setBulkPublishing] = useState(false);
    const [batchAction, setBatchAction] = useState<{ kind: BatchWorkAction; targets: WorkPublication[] }>();
    const [batchReason, setBatchReason] = useState("");
    const [batchWorking, setBatchWorking] = useState(false);
    const [batchResult, setBatchResult] = useState<{ title: string; succeeded: number; failures: Array<{ id: string; title: string; reason: string }> }>();
    const [batchPublishFailures, setBatchPublishFailures] = useState<Array<{ title: string; message: string }>>([]);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedKeyword(keyword.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [keyword]);

    const load = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setError("");
        try {
            const result = await listAdminWorkPublications({
                page,
                pageSize: PAGE_SIZE,
                status: status === "all" ? undefined : status,
                lifecycleStatus: lifecycleStatus === "all" ? undefined : lifecycleStatus,
                origin: origin === "all" ? undefined : origin,
                pinnedOnly: pinnedOnly ? "true" : undefined,
                adjustedOnly: adjustedOnly ? "true" : undefined,
                keyword: debouncedKeyword || undefined,
            });
            if (requestId !== requestIdRef.current) return;
            if (page > 1 && !result.items.length) {
                setPage(page - 1);
                return;
            }
            setItems(result.items);
            setTotal(result.total);
        } catch (loadError) {
            if (requestId !== requestIdRef.current) return;
            setItems([]);
            setTotal(0);
            setError(loadError instanceof Error ? loadError.message : "作品审核列表加载失败");
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, [adjustedOnly, debouncedKeyword, lifecycleStatus, origin, page, pinnedOnly, status]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        setSelectedWorkIds([]);
    }, [page, status, lifecycleStatus, origin, debouncedKeyword, pinnedOnly, adjustedOnly]);

    const selectionDisabled = loading || bulkPublishing || batchWorking || Boolean(actionId);
    const selectableWorks = items.filter(canSelectWork);
    const selectedWorks = selectableWorks.filter((work) => selectedWorkIds.includes(work.id));
    const publishableDrafts = selectedWorks.filter(isPublishableOfficialDraft);
    const onlineWorks = selectedWorks.filter(canTakeDownWork);
    const takenDownWorks = selectedWorks.filter(canDeleteTakenDownWork);

    const startBatchAction = (kind: BatchWorkAction, targets: WorkPublication[]) => {
        setBatchReason("");
        setBatchAction({ kind, targets });
    };

    const submitBatchAction = async () => {
        if (!batchAction || batchWorking) return;
        const { kind, targets } = batchAction;
        const reason = batchReason.trim();
        if (kind === "take-down" && !reason) return;
        setBatchWorking(true);
        setBatchResult(undefined);
        const succeeded: string[] = [];
        const failures: NonNullable<typeof batchResult>["failures"] = [];
        try {
            for (const work of targets) {
                try {
                    if (kind === "take-down") await takeDownAdminWorkPublication(work.id, reason, work.publishedVersionId);
                    else await deleteAdminWorkPublication(work.id, work.updatedAt);
                    succeeded.push(work.id);
                } catch (error) {
                    failures.push({ id: work.id, title: work.currentVersion?.title || work.id, reason: error instanceof Error ? error.message : "操作失败" });
                }
            }
            setSelectedWorkIds((current) => current.filter((id) => !succeeded.includes(id)));
            setBatchResult({ title: BATCH_WORK_ACTIONS[kind], succeeded: succeeded.length, failures });
            setBatchAction(undefined);
            await load();
        } finally {
            setBatchWorking(false);
        }
    };
    const publishSelectedDrafts = () => {
        const targets = publishableDrafts.map((work) => ({ work, version: work.currentVersion! }));
        if (!targets.length || selectionDisabled) return;
        modal.confirm({
            title: "分批发布官方作品",
            content: (
                <div>
                    <p>确认后，审核校验通过的作品将立即进入广场。</p>
                    <ul className="mt-2 max-h-[35vh] list-disc overflow-y-auto pl-5">
                        {targets.map(({ work, version }) => (
                            <li key={work.id} className="break-words">
                                {version.title}
                            </li>
                        ))}
                    </ul>
                </div>
            ),
            okText: "确认发布 " + targets.length + " 条作品",
            cancelText: "取消",
            onOk: async () => {
                setBulkPublishing(true);
                setBatchPublishFailures([]);
                const succeeded: string[] = [];
                const failures: Array<{ title: string; message: string }> = [];
                for (const target of targets) {
                    try {
                        const published = await publishOfficialWork(target.work.id, target.version.id, target.version.updatedAt);
                        setItems((current) => current.map((item) => (item.id === published.id ? published : item)));
                        succeeded.push(target.work.id);
                    } catch (error) {
                        failures.push({ title: target.work.currentVersion?.title || target.work.id, message: error instanceof Error ? error.message : "发布失败" });
                    }
                }
                setSelectedWorkIds((current) => current.filter((id) => !succeeded.includes(id)));
                setBatchPublishFailures(failures);
                setBulkPublishing(false);
                if (failures.length) message.warning("已发布 " + succeeded.length + " 条，失败 " + failures.length + " 条；失败项仍保留为草稿");
                else message.success("已发布 " + succeeded.length + " 条，失败 0 条");
                await load();
            },
        });
    };

    const approve = (work: WorkPublication) => {
        const version = work.currentVersion;
        if (!version) return;
        modal.confirm({
            title: "通过这个发布版本？",
            content: "审核通过后将原子切换为当前公开版本；已有线上版本会被替换，但历史审核证据仍保留。",
            okText: "通过审核",
            cancelText: "取消",
            onOk: async () => {
                setActionId(work.id);
                try {
                    await reviewAdminWorkPublication(work.id, { versionId: version.id, decision: "approved" });
                    message.success("作品已通过审核");
                    await load();
                } catch (approveError) {
                    message.error(approveError instanceof Error ? approveError.message : "审核失败");
                    throw approveError;
                } finally {
                    setActionId("");
                }
            },
        });
    };

    const submitReasonAction = async () => {
        const action = reasonAction;
        const value = reason.trim();
        if (!action || !value) return message.warning(action?.kind === "reject" ? "请填写驳回原因" : "请填写下架原因");
        const version = action.work.currentVersion;
        if (!version) return;
        setActionId(action.work.id);
        try {
            if (action.kind === "reject") await reviewAdminWorkPublication(action.work.id, { versionId: version.id, decision: "rejected", reason: value });
            else await takeDownAdminWorkPublication(action.work.id, value);
            message.success(action.kind === "reject" ? "作品已驳回" : "作品已下架");
            setReasonAction(undefined);
            setReason("");
            await load();
        } catch (actionError) {
            message.error(actionError instanceof Error ? actionError.message : "操作失败");
        } finally {
            setActionId("");
        }
    };

    const togglePinned = async (work: WorkPublication) => {
        setActionId(work.id);
        try {
            const updated = await updateAdminWorkPresentation(work.id, { action: "pin", pinned: !work.pinnedAt });
            message.success(updated.pinnedAt ? "作品已置顶" : "作品已取消置顶");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新置顶失败");
        } finally {
            setActionId("");
        }
    };

    const toggleFeatured = async (work: WorkPublication) => {
        setActionId(work.id);
        try {
            await setAdminWorkFeatured(work.id, !work.isFeatured);
            message.success(work.isFeatured ? "作品已取消精选" : "作品已设为精选");
            await load();
        } catch (featureError) {
            message.error(featureError instanceof Error ? featureError.message : "更新精选状态失败");
        } finally {
            setActionId("");
        }
    };

    const togglePullFilm = async (work: WorkPublication) => {
        const enabled = work.publishedVersion?.pullFilmEnabled !== true;
        setActionId(work.id);
        try {
            const result = await setAdminWorkPullFilm(work.id, enabled);
            const update = (item: WorkPublication) => applyPullFilmState(item, result);
            setItems((current) => current.map((item) => (item.id === work.id ? update(item) : item)));
            setViewingWork((current) => (current?.id === work.id ? update(current) : current));
            message.success(enabled ? "作品已设为拉片项目" : "作品已取消拉片项目");
        } catch (pullFilmError) {
            message.error(pullFilmError instanceof Error ? pullFilmError.message : "更新拉片项目状态失败");
        } finally {
            setActionId("");
        }
    };

    const remove = (work: WorkPublication) => {
        modal.confirm({
            title: "永久删除这个作品？",
            content: "作品主记录、全部版本快照、发布媒体关联和互动记录会被永久删除，用户原始素材与项目不受影响。此操作无法撤销。",
            okText: "永久删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                setActionId(work.id);
                try {
                    await deleteAdminWorkPublication(work.id);
                    message.success("作品已永久删除");
                    await load();
                } catch (deleteError) {
                    message.error(deleteError instanceof Error ? deleteError.message : "删除失败");
                    throw deleteError;
                } finally {
                    setActionId("");
                }
            },
        });
    };

    const relist = async (work: WorkPublication) => {
        setActionId(work.id);
        try {
            await relistOfficialWork(work.id);
            message.success("官方作品已重新上架");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "重新上架失败");
        } finally {
            setActionId("");
        }
    };

    const clearFilters = () => {
        setStatus("all");
        setLifecycleStatus("all");
        setOrigin("all");
        setPinnedOnly(false);
        setAdjustedOnly(false);
        setKeyword("");
        setSelectedWorkIds([]);
        setPage(1);
    };

    const renderActions = (work: WorkPublication) => {
        const version = work.currentVersion;
        if (!version) return null;
        const busy = actionId === work.id;
        const pending = work.lifecycleStatus === "active" && version.moderationStatus === "pending";
        const shareable = work.lifecycleStatus === "active" && Boolean(work.publishedVersionId) && work.publishedVersion?.visibility !== "private";
        const canFeature = shareable && work.publishedVersion?.visibility === "public";
        const canPullFilm =
            work.lifecycleStatus === "active" &&
            (work.sourceType === "canvas" || work.sourceType === "drama") &&
            work.publishedVersion?.moderationStatus === "approved" &&
            work.publishedVersion.visibility === "public" &&
            work.publishedVersion.id === work.publishedVersionId;
        const pullFilmEnabled = work.publishedVersion?.pullFilmEnabled === true;
        const canDelete = canDeleteTakenDownWork(work);
        return (
            <div className="flex flex-wrap items-center justify-end gap-0.5">
                <Button type="link" size="small" icon={<Eye className="size-3.5" />} onClick={() => setViewingWork(work)}>
                    详情
                </Button>
                {shareable ? (
                    <Tooltip title="打开公开页面">
                        <Button type="text" size="small" aria-label="打开公开页面" icon={<Eye className="size-3.5" />} onClick={() => window.open(`/share/${encodeURIComponent(work.slug)}`, "_blank", "noopener,noreferrer")} />
                    </Tooltip>
                ) : null}
                {canFeature ? (
                    <Tooltip title={work.isFeatured ? "取消精选" : "设为精选"}>
                        <Button type="text" size="small" aria-label={work.isFeatured ? "取消精选" : "设为精选"} icon={<Star className={`size-3.5 ${work.isFeatured ? "fill-current" : ""}`} />} onClick={() => void toggleFeatured(work)} loading={busy} />
                    </Tooltip>
                ) : null}
                {canFeature || work.pinnedAt ? (
                    <Tooltip title={work.pinnedAt ? "取消置顶" : "置顶作品"}>
                        <Button type="text" size="small" aria-label={work.pinnedAt ? "取消置顶" : "置顶作品"} icon={work.pinnedAt ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />} loading={busy} onClick={() => void togglePinned(work)} />
                    </Tooltip>
                ) : null}
                <Button type="link" size="small" onClick={() => setAdjustingWork(work)} disabled={busy}>
                    {hasAdjustedDisplayCounts(work) ? "查看展示调整" : "调整展示数据"}
                </Button>
                {canPullFilm ? (
                    <Tooltip title={pullFilmEnabled ? "取消拉片" : "设为拉片"}>
                        <Button type="text" size="small" aria-label={pullFilmEnabled ? "取消拉片" : "设为拉片"} icon={<Film className={`size-3.5 ${pullFilmEnabled ? "fill-current" : ""}`} />} onClick={() => void togglePullFilm(work)} loading={busy} />
                    </Tooltip>
                ) : null}
                {work.publicationOrigin === "official" ? (
                    <Button
                        type="link"
                        size="small"
                        icon={<Pencil className="size-3.5" />}
                        onClick={() => {
                            setEditingOfficialWork(work);
                            setOfficialEditorOpen(true);
                        }}
                    >
                        编辑
                    </Button>
                ) : null}
                {work.publicationOrigin === "official" && work.lifecycleStatus === "revoked" ? (
                    <Button type="link" size="small" icon={<RotateCcw className="size-3.5" />} loading={busy} onClick={() => void relist(work)}>
                        重新上架
                    </Button>
                ) : null}
                {work.publicationOrigin !== "official" && pending ? (
                    <>
                        <Button
                            type="link"
                            size="small"
                            danger
                            icon={<X className="size-3.5" />}
                            disabled={busy}
                            onClick={() => {
                                setReason("");
                                setReasonAction({ work, kind: "reject" });
                            }}
                        >
                            驳回
                        </Button>
                        <Button type="link" size="small" icon={<Check className="size-3.5" />} loading={busy} onClick={() => approve(work)}>
                            通过
                        </Button>
                    </>
                ) : null}
                {work.lifecycleStatus === "active" && work.publishedVersionId ? (
                    <Button
                        type="link"
                        size="small"
                        danger
                        icon={<Ban className="size-3.5" />}
                        disabled={busy}
                        onClick={() => {
                            setReason("");
                            setReasonAction({ work, kind: "take-down" });
                        }}
                    >
                        下架
                    </Button>
                ) : null}
                {canDelete ? (
                    <Button type="link" size="small" danger icon={<Trash2 className="size-3.5" />} loading={busy} onClick={() => remove(work)}>
                        删除
                    </Button>
                ) : null}
            </div>
        );
    };

    const columns: TableColumnsType<WorkPublication> = [
        {
            title: "更新时间",
            dataIndex: "updatedAt",
            width: 156,
            render: (value: string) => <span className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">{formatAdminTime(value)}</span>,
        },
        {
            title: "作品",
            key: "work",
            width: 330,
            render: (_, work) => <AdminWorkIdentity work={work} showMetrics />,
        },
        {
            title: "用户",
            key: "owner",
            width: 210,
            render: (_, work) => <AdminUserIdentity displayName={work.ownerDisplayName} username={work.ownerUsername} accountId={work.ownerAccountId} fallback="用户信息不可用" />,
        },
        {
            title: "发布来源",
            dataIndex: "publicationOrigin",
            width: 100,
            render: (value: WorkPublication["publicationOrigin"]) => (value === "official" ? <Tag color="blue">官方</Tag> : <Tag>用户投稿</Tag>),
        },
        {
            title: "来源",
            dataIndex: "sourceType",
            width: 100,
            render: (value: WorkPublication["sourceType"]) => <span className="text-xs text-zinc-600 dark:text-zinc-300">{sourceTypeLabel(value)}</span>,
        },
        {
            title: "版本 / 可见性",
            key: "version",
            width: 130,
            render: (_, work) => (
                <div className="text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                    <div>v{work.currentVersion?.versionNumber || 1}</div>
                    <div className="text-zinc-500 dark:text-zinc-400">{visibilityLabel(work.currentVersion?.visibility)}</div>
                </div>
            ),
        },
        {
            title: "状态",
            key: "status",
            width: 112,
            render: (_, work) => <AdminWorkStatus work={work} />,
        },

        {
            title: "操作",
            key: "actions",
            fixed: "right",
            width: 286,
            render: (_, work) => renderActions(work),
        },
    ];

    return (
        <Panel>
            <PanelHeader
                title="作品管理"
                description="管理用户投稿审核与平台官方作品；官方作品确认发布后立即进入广场。"
                actions={
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button icon={<FileSpreadsheet className="size-4" />} onClick={() => setBulkImportOpen(true)}>
                            批量导入草稿
                        </Button>
                        {publishableDrafts.length ? (
                            <Button type="primary" disabled={selectionDisabled} loading={bulkPublishing} onClick={publishSelectedDrafts}>
                                分批发布（{publishableDrafts.length}）
                            </Button>
                        ) : null}
                        {onlineWorks.length ? (
                            <Button danger disabled={selectionDisabled} onClick={() => startBatchAction("take-down", onlineWorks)}>
                                批量下架作品（{onlineWorks.length}）
                            </Button>
                        ) : null}
                        {takenDownWorks.length ? (
                            <Button danger disabled={selectionDisabled} onClick={() => startBatchAction("delete", takenDownWorks)}>
                                批量删除已下架作品（{takenDownWorks.length}）
                            </Button>
                        ) : null}
                        <Button
                            type="primary"
                            icon={<Plus className="size-4" />}
                            onClick={() => {
                                setEditingOfficialWork(null);
                                setOfficialEditorOpen(true);
                            }}
                        >
                            发布官方作品
                        </Button>
                    </div>
                }
            />
            <div className="min-w-0 space-y-3 p-3 sm:p-5">
                <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(110px,140px))_auto_auto_auto] md:items-center" data-testid="admin-work-filters">
                    <Input
                        className="col-span-2 min-w-0 md:col-span-1"
                        allowClear
                        prefix={<Search className="size-4 text-zinc-400" />}
                        placeholder="搜索作品标题、用户、用户 ID 或作品链接"
                        value={keyword}
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            setPage(1);
                        }}
                    />
                    <Select
                        className="min-w-0"
                        value={status}
                        options={STATUS_OPTIONS}
                        onChange={(value) => {
                            setStatus(value);
                            if (value === "taken_down") setLifecycleStatus("all");
                            setPage(1);
                        }}
                    />
                    <Select
                        className="min-w-0"
                        value={lifecycleStatus}
                        options={[
                            { value: "all", label: "全部" },
                            { value: "active", label: "有效作品" },
                            { value: "revoked", label: "用户已下架" },
                        ]}
                        onChange={(value) => {
                            setLifecycleStatus(value);
                            setPage(1);
                        }}
                    />
                    <Select
                        className="min-w-0"
                        value={origin}
                        options={[
                            { value: "all", label: "全部来源" },
                            { value: "user_submission", label: "用户投稿" },
                            { value: "official", label: "官方作品" },
                        ]}
                        onChange={(value) => {
                            setOrigin(value);
                            setPage(1);
                        }}
                    />
                    <span className="col-span-2 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 md:col-span-1">共 {total} 条</span>
                    <Button className="w-full md:w-auto" icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load()}>
                        刷新
                    </Button>
                    <Button className="w-full md:w-auto" onClick={clearFilters}>
                        清除筛选
                    </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    {selectableWorks.length ? (
                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                className="gm-checkbox"
                                disabled={selectionDisabled}
                                checked={selectableWorks.every((work) => selectedWorkIds.includes(work.id))}
                                onChange={(event) => setSelectedWorkIds(event.target.checked ? selectableWorks.map((work) => work.id) : [])}
                            />
                            全选本页可操作作品
                        </label>
                    ) : null}
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2" role="group" aria-label="作品展示筛选">
                        <label className="inline-flex items-center gap-2 text-sm">
                            <Switch
                                size="small"
                                checked={pinnedOnly}
                                aria-label="已置顶"
                                onChange={(checked) => {
                                    setPinnedOnly(checked);
                                    setPage(1);
                                    setSelectedWorkIds([]);
                                }}
                            />
                            已置顶
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm">
                            <Switch
                                size="small"
                                checked={adjustedOnly}
                                aria-label="展示已调整"
                                onChange={(checked) => {
                                    setAdjustedOnly(checked);
                                    setPage(1);
                                    setSelectedWorkIds([]);
                                }}
                            />
                            展示已调整
                        </label>
                    </div>
                </div>

                {batchResult ? (
                    <div role={batchResult.failures.length ? "alert" : "status"} className="rounded-md border border-[var(--gm-border)] p-3 text-sm">
                        <p className="font-medium">
                            {batchResult.title}：成功 {batchResult.succeeded} 条，失败 {batchResult.failures.length} 条
                        </p>
                        {batchResult.failures.map((failure) => (
                            <p key={failure.id}>
                                {failure.title}：{failure.reason}
                            </p>
                        ))}
                    </div>
                ) : null}
                {batchPublishFailures.length ? (
                    <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        <p className="font-medium">以下草稿发布失败，可保留选择后重试：</p>
                        {batchPublishFailures.map((failure) => (
                            <p key={failure.title}>
                                {failure.title}：{failure.message}
                            </p>
                        ))}
                    </div>
                ) : null}
                {error ? (
                    <div className="grid min-h-40 place-items-center border-y border-rose-200 px-4 text-center text-sm text-rose-700 dark:border-rose-900/60 dark:text-rose-300">{error}</div>
                ) : (
                    <>
                        <div className="space-y-2 md:hidden">
                            {items.map((work) => (
                                <div key={work.id} className="flex min-w-0 items-start gap-2">
                                    {canSelectWork(work) ? (
                                        <input
                                            type="checkbox"
                                            aria-label={(isPublishableOfficialDraft(work) ? "选择草稿：" : "选择作品：") + (work.currentVersion?.title || work.id)}
                                            checked={selectedWorkIds.includes(work.id)}
                                            disabled={selectionDisabled}
                                            onChange={(event) => setSelectedWorkIds((current) => (event.target.checked ? [...current, work.id] : current.filter((id) => id !== work.id)))}
                                            className="gm-checkbox mt-4"
                                        />
                                    ) : null}
                                    <div className="min-w-0 flex-1">
                                        <AdminWorkMobileCard work={work} actions={renderActions(work)} />
                                    </div>
                                </div>
                            ))}
                            {!items.length && !loading ? <AdminWorksEmpty /> : null}
                            {loading && !items.length ? <div className="grid min-h-36 place-items-center text-sm text-zinc-500 dark:text-zinc-400">正在加载作品...</div> : null}
                            {total > PAGE_SIZE ? <Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} size="small" onChange={setPage} /> : null}
                        </div>
                        <div className="hidden min-w-0 md:block">
                            <Table
                                className="admin-work-table"
                                rowKey="id"
                                columns={columns}
                                dataSource={items}
                                loading={loading}
                                pagination={{
                                    current: page,
                                    pageSize: PAGE_SIZE,
                                    total,
                                    showSizeChanger: false,
                                    showTotal: (count, range) => `${range[0]}-${range[1]} / ${count} 条`,
                                    onChange: setPage,
                                }}
                                locale={{ emptyText: <AdminWorksEmpty /> }}
                                scroll={{ x: 1464 }}
                                size="middle"
                                tableLayout="fixed"
                                rowSelection={{
                                    selectedRowKeys: selectedWorkIds,
                                    onChange: (keys) => setSelectedWorkIds(keys.map(String)),
                                    getCheckboxProps: (work) => ({ disabled: selectionDisabled || !canSelectWork(work) }),
                                }}
                            />
                        </div>
                    </>
                )}
            </div>

            <Modal
                title={batchAction ? BATCH_WORK_ACTIONS[batchAction.kind] : undefined}
                open={Boolean(batchAction)}
                okText={`${batchAction?.kind === "delete" ? "永久删除" : "确认下架"} ${batchAction?.targets.length ?? 0} 条作品`}
                okButtonProps={{ danger: true, disabled: batchAction?.kind === "take-down" && !batchReason.trim() }}
                cancelButtonProps={{ disabled: batchWorking }}
                closable={!batchWorking}
                keyboard={!batchWorking}
                maskClosable={!batchWorking}
                confirmLoading={batchWorking}
                onOk={submitBatchAction}
                onCancel={() => setBatchAction(undefined)}
            >
                <p>{batchAction?.kind === "delete" ? "将永久删除选中作品的记录、版本及互动，无法恢复。" : "下架后，选中作品的公开链接将失效。"}</p>
                <ul className="my-3 max-h-[35vh] list-disc overflow-y-auto pl-5">
                    {batchAction?.targets.map((work) => (
                        <li key={work.id} className="break-words">
                            {work.currentVersion?.title || work.id}
                        </li>
                    ))}
                </ul>
                {batchAction?.kind === "take-down" ? (
                    <Input.TextArea aria-label="下架原因" placeholder="填写本批作品的下架原因" rows={3} maxLength={500} disabled={batchWorking} value={batchReason} onChange={(event) => setBatchReason(event.target.value)} />
                ) : null}
            </Modal>

            {bulkImportOpen ? <AdminOfficialWorkImport onClose={() => setBulkImportOpen(false)} onSaved={() => void load()} /> : null}

            <Modal
                title={reasonAction?.kind === "reject" ? "驳回发布版本" : "下架公开作品"}
                open={Boolean(reasonAction)}
                okText={reasonAction?.kind === "reject" ? "确认驳回" : "确认下架"}
                cancelText="取消"
                confirmLoading={Boolean(reasonAction && actionId === reasonAction.work.id)}
                okButtonProps={{ danger: true, disabled: !reason.trim() }}
                onOk={() => void submitReasonAction()}
                onCancel={() => {
                    setReasonAction(undefined);
                    setReason("");
                }}
            >
                <p className="mb-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{reasonAction?.kind === "reject" ? "原因会显示给投稿用户，需说明可执行的修改方向。" : "下架后公开链接和媒体会立即返回 404，请填写可审计原因。"}</p>
                <Input.TextArea
                    value={reason}
                    rows={4}
                    maxLength={500}
                    showCount
                    placeholder={reasonAction?.kind === "reject" ? "例如：封面包含不可公开的个人信息，请替换后重新提交" : "例如：收到权利方通知，等待运营复核"}
                    onChange={(event) => setReason(event.target.value)}
                />
            </Modal>
            <AdminOfficialWorkEditor
                open={officialEditorOpen}
                work={editingOfficialWork || undefined}
                onClose={() => {
                    setOfficialEditorOpen(false);
                    setEditingOfficialWork(null);
                }}
                onSaved={(work) => {
                    setEditingOfficialWork(work);
                    void load();
                }}
            />
            {adjustingWork ? (
                <AdminWorkDisplayCounts
                    work={adjustingWork}
                    onClose={() => setAdjustingWork(undefined)}
                    onSaved={(updated) => {
                        const update = (work: WorkPublication) =>
                            work.id === updated.id ? { ...work, viewCount: updated.viewCount, likeCount: updated.likeCount, displayViewOffset: updated.displayViewOffset, displayLikeOffset: updated.displayLikeOffset, updatedAt: updated.updatedAt } : work;
                        setItems((current) => current.map(update));
                        setViewingWork((current) => (current ? update(current) : current));
                        void load();
                    }}
                />
            ) : null}
            <Modal title="作品详情" open={Boolean(viewingWork)} width={760} footer={null} destroyOnHidden onCancel={() => setViewingWork(undefined)}>
                {viewingWork ? <AdminWorkDetail work={viewingWork} busy={actionId === viewingWork.id} onTogglePullFilm={() => void togglePullFilm(viewingWork)} /> : null}
            </Modal>
        </Panel>
    );
}

function canTakeDownWork(work: WorkPublication) {
    return work.lifecycleStatus === "active" && Boolean(work.publishedVersionId);
}

function canDeleteTakenDownWork(work: WorkPublication) {
    return !work.publishedVersionId && work.adminCanDelete === true;
}

function canSelectWork(work: WorkPublication) {
    return isPublishableOfficialDraft(work) || canTakeDownWork(work) || canDeleteTakenDownWork(work);
}

function isPublishableOfficialDraft(work: WorkPublication) {
    return work.publicationOrigin === "official" && work.lifecycleStatus === "active" && !work.publishedVersionId && work.currentVersion?.moderationStatus === "draft";
}

function AdminWorkIdentity({ work, showMetrics = false }: { work: WorkPublication; showMetrics?: boolean }) {
    const version = work.currentVersion;
    if (!version) return <span className="text-xs text-zinc-500">版本不可用</span>;
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <AdminWorkThumbnail work={work} />
            <div className="min-w-0 flex-1">
                <Tooltip title={version.title} placement="topLeft">
                    <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">{version.title}</div>
                </Tooltip>
                {showMetrics ? <AdminWorkMetrics work={work} className="max-xl:flex-col max-xl:items-start" /> : null}
                <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{version.description || "未填写作品说明"}</div>
                <div className="mt-0.5 truncate text-[11px] text-zinc-400 dark:text-zinc-500" title={work.slug}>
                    {work.slug}
                </div>
            </div>
        </div>
    );
}

function AdminWorkStatus({ work }: { work: WorkPublication }) {
    const version = work.currentVersion;
    if (!version) return <Tag className="m-0">未知</Tag>;
    const moderationSignal = version.moderationStatus === "pending" ? moderationSignalText(version.moderationProvider, version.moderationSignal) : "";
    const tag = (
        <span className={`inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium leading-none ${workStatusToneClass(work.lifecycleStatus === "revoked" ? "revoked" : version.moderationStatus)}`}>
            {work.lifecycleStatus === "revoked" && work.publicationOrigin !== "official" ? "用户已下架" : adminStatusLabel(canDeleteTakenDownWork(work) ? "taken_down" : version.moderationStatus)}
        </span>
    );
    return (
        <div className="flex flex-col items-start gap-1">
            {moderationSignal ? <Tooltip title={moderationSignal}>{tag}</Tooltip> : tag}
            {work.pinnedAt ? <Tag color="blue">已置顶</Tag> : null}
            {work.isFeatured ? <Tag color="gold">精选</Tag> : null}
            {work.publishedVersion?.pullFilmEnabled ? <Tag color="cyan">拉片项目</Tag> : null}
            {work.publishedVersion && work.publishedVersion.id !== version.id ? <span className="text-[11px] text-zinc-500 dark:text-zinc-400">线上 v{work.publishedVersion.versionNumber}</span> : null}
        </div>
    );
}

function AdminWorkThumbnail({ work }: { work: WorkPublication }) {
    const [failed, setFailed] = useState(false);
    const asset = work.currentPreview;
    const url = asset?.previewUrl || "";
    const imageUrl = imagePreviewUrl(url, 256);
    useEffect(() => setFailed(false), [url]);
    return (
        <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
            <img src="/logo.svg" alt="" className="absolute inset-0 size-full object-contain p-3 opacity-45" />
            {!failed && url && asset?.mediaType === "video" ? <video src={url} muted playsInline preload="metadata" className="relative size-full object-cover" onError={() => setFailed(true)} /> : null}
            {!failed && imageUrl && asset?.mediaType === "image" ? <img src={imageUrl} alt={work.currentVersion?.title || "作品预览"} loading="lazy" className="relative size-full object-cover" onError={() => setFailed(true)} /> : null}
        </div>
    );
}

function hasAdjustedDisplayCounts(work: WorkPublication) {
    return displayWorkCount(work.viewCount, work.displayViewOffset) !== work.viewCount || displayWorkCount(work.likeCount, work.displayLikeOffset) !== work.likeCount;
}

function AdminWorkMetrics({ work, className }: { work: WorkPublication; className?: string }) {
    return (
        <div role="group" aria-label="作品互动数据" className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-[var(--gm-text-3)]", className)}>
            <span className="break-all">观看 {displayWorkCount(work.viewCount, work.displayViewOffset)}</span>
            <span className="break-all">点赞 {displayWorkCount(work.likeCount, work.displayLikeOffset)}</span>
            {hasAdjustedDisplayCounts(work) ? (
                <Tag className="m-0" color="blue">
                    展示已调整
                </Tag>
            ) : null}
        </div>
    );
}

function AdminWorkMobileCard({ work, actions }: { work: WorkPublication; actions: ReactNode }) {
    return (
        <article className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <AdminWorkIdentity work={work} />
                </div>
                <AdminWorkStatus work={work} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{work.ownerDisplayName || work.ownerUsername || "用户信息不可用"}</span>
                    <AdminAccountId accountId={work.ownerAccountId} className="shrink-0" />
                </span>
                <span>{sourceTypeLabel(work.sourceType)}</span>
                <span>{formatAdminTime(work.updatedAt)}</span>
            </div>
            <div className="mt-2">
                <AdminWorkMetrics work={work} />
            </div>
            <div className="mt-2 flex flex-wrap justify-end gap-0.5 border-t border-zinc-200 pt-2 dark:border-zinc-800">{actions}</div>
        </article>
    );
}

function AdminWorksEmpty() {
    return (
        <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-4 text-center">
            <GalleryVerticalEnd className="size-5 text-zinc-400" />
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">当前筛选下没有作品</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">切换审核状态或清除筛选后再查看。</div>
        </div>
    );
}

function AdminWorkDetail({ work, busy, onTogglePullFilm }: { work: WorkPublication; busy: boolean; onTogglePullFilm: () => void }) {
    const version = work.currentVersion;
    if (!version) return null;
    const asset = work.currentPreview;
    const url = asset?.previewUrl || "";
    const imageUrl = imagePreviewUrl(url, 1920);
    const pullFilmEnabled = work.publishedVersion?.pullFilmEnabled === true;
    const canPullFilm =
        work.lifecycleStatus === "active" &&
        (work.sourceType === "canvas" || work.sourceType === "drama") &&
        work.publishedVersion?.moderationStatus === "approved" &&
        work.publishedVersion.visibility === "public" &&
        work.publishedVersion.id === work.publishedVersionId;
    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[240px_minmax(0,1fr)]">
                <div className="relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                    <img src="/logo.svg" alt="" className="absolute inset-0 size-full object-contain p-16 opacity-40" />
                    {url && asset?.mediaType === "video" ? <video src={url} controls playsInline preload="metadata" className="relative size-full object-contain" /> : null}
                    {imageUrl && asset?.mediaType === "image" ? <img src={imageUrl} alt={version.title} loading="lazy" className="relative size-full object-contain" /> : null}
                </div>
                <div className="min-w-0 space-y-3">
                    <div>
                        <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-100">{version.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{version.description || "未填写作品说明"}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-zinc-200 py-3 text-xs dark:border-zinc-800">
                        <DetailValue label="用户" value={`${work.ownerDisplayName || work.ownerUsername || "用户信息不可用"}${work.ownerAccountId ? ` · ID：${work.ownerAccountId}` : ""}`} />
                        <DetailValue label="来源" value={sourceTypeLabel(work.sourceType)} />
                        <DetailValue label="版本" value={`v${version.versionNumber}`} />
                        <DetailValue label="可见性" value={visibilityLabel(version.visibility)} />
                        <DetailValue label="更新时间" value={formatAdminTime(work.updatedAt)} />
                        <DetailValue label="作品链接" value={work.slug} />
                    </div>
                    <AdminWorkMetrics work={work} />
                    <div className="flex flex-wrap gap-1.5">
                        <AdminWorkStatus work={work} />
                        {version.tags.map((tag) => (
                            <Tag key={tag} className="m-0">
                                {tag}
                            </Tag>
                        ))}
                    </div>
                </div>
            </div>
            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <div className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">公开提示词</div>
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800 dark:text-zinc-200">{version.publicPrompt || "未填写提示词"}</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">拉片项目</div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{pullFilmEnabled ? "当前公开版本已提供只读制作流程，可复制到无限练习。" : "仅当前公开且已通过审核的画布或短剧作品可启用。"}</div>
                </div>
                {canPullFilm ? (
                    <Button icon={<Film className="size-4" />} loading={busy} onClick={onTogglePullFilm}>
                        {pullFilmEnabled ? "取消拉片" : "设为拉片"}
                    </Button>
                ) : (
                    <Tag className="m-0">当前版本不可设置</Tag>
                )}
            </div>
            {version.rejectionReason ? <div className="border-l-2 border-rose-400 pl-3 text-sm leading-6 text-rose-700 dark:text-rose-300">处理原因：{version.rejectionReason}</div> : null}
        </div>
    );
}

function applyPullFilmState(work: WorkPublication, state: AdminWorkPullFilmState): WorkPublication {
    const updateVersion = (version: WorkPublication["publishedVersion"]) =>
        version && (!state.processVersionId || version.id === state.processVersionId) ? { ...version, pullFilmEnabled: state.hasProcess, pullFilmEnabledAt: state.hasProcess ? state.updatedAt : undefined } : version;
    return {
        ...work,
        publishedVersion: updateVersion(work.publishedVersion),
        currentVersion: work.currentVersion?.id === work.publishedVersionId ? updateVersion(work.currentVersion) : work.currentVersion,
    };
}

function DetailValue({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <div className="text-zinc-400 dark:text-zinc-500">{label}</div>
            <div className="mt-0.5 truncate text-zinc-700 dark:text-zinc-200" title={value}>
                {value}
            </div>
        </div>
    );
}

function sourceTypeLabel(value: WorkPublication["sourceType"]) {
    return value === "canvas" ? "画布" : value === "drama" ? "短剧" : "素材";
}

function visibilityLabel(value: WorkPublicationVisibility | undefined) {
    return value === "public" ? "公开" : value === "unlisted" ? "持链接可见" : "仅自己可见";
}

function formatAdminTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
}

function adminStatusLabel(status: WorkPublicationModerationStatus) {
    return status === "pending" ? "待审核" : status === "approved" ? "已通过" : status === "rejected" ? "已驳回" : status === "taken_down" ? "已下架" : "草稿";
}

function moderationSignalText(provider: string | undefined, value: unknown) {
    if (!provider || provider === "manual") return "等待人工审核";
    if (!value || typeof value !== "object") return "";
    const signal = value as { riskLevel?: unknown; summary?: unknown };
    const summary = typeof signal.summary === "string" ? signal.summary : "";
    if (!summary) return "";
    const level = signal.riskLevel === "safe" ? "低风险" : signal.riskLevel === "block" ? "高风险" : "需复核";
    return `${provider} / ${level} / ${summary}`;
}
