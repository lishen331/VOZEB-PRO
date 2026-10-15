"use client";

import { Dropdown, Input, Modal } from "antd";
import { Button, Checkbox } from "@/components/gamma-ui/gamma-ant";
import { Check, CheckSquare2, Clock3, MessagesSquare, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { CreativeConversation } from "@/lib/creative-runtime-contract";
import { cn } from "@/lib/utils";

type Props = {
    items: CreativeConversation[];
    activeId?: string;
    loading: boolean;
    onNew: () => void;
    onOpen: (id: string) => void;
    onRename: (id: string, title: string) => Promise<void>;
    onDelete: (ids: string[]) => Promise<void>;
    hasMore?: boolean;
    loadingMore?: boolean;
    onLoadMore?: () => void;
};

export function CreativeConversationList({ items, activeId, loading, onNew, onOpen, onRename, onDelete, hasMore, loadingMore, onLoadMore }: Props) {
    const [managing, setManaging] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [renaming, setRenaming] = useState<CreativeConversation>();
    const [deleteIds, setDeleteIds] = useState<string[]>([]);
    const [title, setTitle] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
    const allSelected = Boolean(items.length) && selectedIds.length === items.length;

    useEffect(() => {
        const visibleIds = new Set(items.map((item) => item.id));
        setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
    }, [items]);

    const leaveManage = () => {
        setManaging(false);
        setSelectedIds([]);
    };

    const remove = async (ids: string[]) => {
        if (!ids.length || submitting) return false;
        setSubmitting(true);
        try {
            await onDelete(ids);
            if (ids.length > 1) leaveManage();
            return true;
        } catch {
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const saveTitle = async () => {
        const value = title.trim();
        if (!renaming || !value || submitting) return;
        setSubmitting(true);
        try {
            await onRename(renaming.id, value);
            setRenaming(undefined);
        } catch {
            return;
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-white dark:bg-[#111724]">
            <div className="shrink-0 border-b border-[#e7eaef] px-3 py-3 dark:border-[#282f3e]">
                <button
                    type="button"
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#1b212f] !bg-[#1b212f] px-3 text-sm font-medium !text-white transition hover:border-[#323948] hover:!bg-[#323948] dark:border-[#f2f5fa] dark:!bg-[#f2f5fa] dark:!text-[#1b212f] dark:hover:border-white dark:hover:!bg-white"
                    onClick={onNew}
                >
                    <Plus className="size-4 text-current" /> 新建对话
                </button>
            </div>

            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[#edf0f5] px-3 dark:border-[#212836]">
                {managing ? (
                    <Checkbox checked={allSelected} indeterminate={selectedIds.length > 0 && !allSelected} onChange={(event) => setSelectedIds(event.target.checked ? items.map((item) => item.id) : [])}>
                        全选
                    </Checkbox>
                ) : (
                    <span className="text-xs text-[#8993a9] dark:text-[#7e889d]">{items.length} 条对话</span>
                )}
                <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[#687287] transition hover:bg-[#f0f3f8] hover:text-[#1b212f] dark:text-[#a8aebb] dark:hover:bg-[#212836] dark:hover:text-white"
                    onClick={() => (managing ? leaveManage() : setManaging(true))}
                >
                    {managing ? <X className="size-3.5" /> : <CheckSquare2 className="size-3.5" />}
                    {managing ? "退出管理" : "批量管理"}
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {loading ? <div className="py-10 text-center text-sm text-stone-400">正在读取...</div> : null}
                {!loading && !items.length ? <div className="py-10 text-center text-sm text-stone-400">暂无创作会话</div> : null}
                <div className="space-y-1.5">
                    {items.map((item) => {
                        const checked = selected.has(item.id);
                        return (
                            <div
                                key={item.id}
                                className={cn(
                                    "group flex min-h-13 items-center gap-1 rounded-lg border px-1 transition",
                                    activeId === item.id ? "border-[#d4dae8] bg-[#eff2f7] dark:border-[#394154] dark:bg-[#212836]" : "border-transparent hover:border-[#e5e8ed] hover:bg-[#f5f8fe] dark:hover:border-[#2e3544] dark:hover:bg-[#1b212f]",
                                )}
                            >
                                {renaming?.id === item.id ? (
                                    <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2">
                                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eef1f6] text-[#667085] dark:bg-[#282f3d] dark:text-[#b1b8c5]">
                                            <MessagesSquare className="size-4" />
                                        </span>
                                        <Input
                                            value={title}
                                            maxLength={120}
                                            autoFocus
                                            className="min-w-0 flex-1"
                                            aria-label="对话标题"
                                            onChange={(event) => setTitle(event.target.value)}
                                            onPressEnter={() => void saveTitle()}
                                            onKeyDown={(event) => {
                                                if (event.key === "Escape") setRenaming(undefined);
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="grid size-8 shrink-0 place-items-center rounded-md text-[#566074] transition hover:bg-[#e9ebf1] hover:text-[#1b212f] dark:text-[#b9bfcd] dark:hover:bg-[#2f3645] dark:hover:text-white"
                                            aria-label="保存标题"
                                            title="保存标题"
                                            onClick={() => void saveTitle()}
                                        >
                                            <Check className="size-4" />
                                        </button>
                                        <button
                                            type="button"
                                            className="grid size-8 shrink-0 place-items-center rounded-md text-[#8993a9] transition hover:bg-[#e9ebf1] hover:text-[#1b212f] dark:text-[#8e98ae] dark:hover:bg-[#2f3645] dark:hover:text-white"
                                            aria-label="取消修改"
                                            title="取消修改"
                                            onClick={() => setRenaming(undefined)}
                                        >
                                            <X className="size-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {managing ? (
                                            <Checkbox className="ml-2 shrink-0" checked={checked} aria-label={`选择${item.title}`} onChange={() => setSelectedIds((current) => (checked ? current.filter((id) => id !== item.id) : [...current, item.id]))} />
                                        ) : null}
                                        <button
                                            type="button"
                                            className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left"
                                            onClick={() => (managing ? setSelectedIds((current) => (checked ? current.filter((id) => id !== item.id) : [...current, item.id])) : onOpen(item.id))}
                                        >
                                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eef1f6] text-[#667085] dark:bg-[#282f3d] dark:text-[#b1b8c5]">
                                                <MessagesSquare className="size-4" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-stone-800 dark:text-stone-100">{item.title}</span>
                                                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-400 dark:text-stone-500">
                                                    <Clock3 className="size-3" /> {formatConversationTime(item.lastMessageAt)}
                                                </span>
                                            </span>
                                        </button>
                                        {!managing ? (
                                            <Dropdown
                                                trigger={["click"]}
                                                menu={{
                                                    items: [{ key: "rename", icon: <Pencil className="size-3.5" />, label: "重命名" }, { type: "divider" }, { key: "delete", danger: true, icon: <Trash2 className="size-3.5" />, label: "删除" }],
                                                    onClick: ({ key }) => {
                                                        if (key === "rename") {
                                                            setRenaming(item);
                                                            setTitle(item.title);
                                                        } else {
                                                            setDeleteIds([item.id]);
                                                        }
                                                    },
                                                }}
                                            >
                                                <button
                                                    type="button"
                                                    className="grid size-8 shrink-0 place-items-center rounded-md text-stone-400 opacity-100 transition hover:bg-white hover:text-stone-950 sm:opacity-0 sm:group-hover:opacity-100 dark:text-stone-500 dark:hover:bg-stone-700 dark:hover:text-white"
                                                    aria-label={`管理${item.title}`}
                                                    title="管理对话"
                                                >
                                                    <MoreHorizontal className="size-4" />
                                                </button>
                                            </Dropdown>
                                        ) : null}
                                    </>
                                )}
                            </div>
                        );
                    })}
                    {hasMore ? (
                        <Button type="text" block loading={loadingMore} onClick={onLoadMore}>
                            加载更多对话
                        </Button>
                    ) : null}
                </div>
            </div>

            {managing ? (
                <div className="flex shrink-0 items-center gap-3 border-t border-[#e7eaef] bg-white px-4 py-3 dark:border-[#282f3e] dark:bg-[#111724]">
                    <span className="min-w-0 flex-1 text-xs text-[#8993a9] dark:text-[#7e889d]">已选择 {selectedIds.length} 条</span>
                    <Button danger icon={<Trash2 className="size-3.5" />} disabled={!selectedIds.length} loading={submitting} onClick={() => setDeleteIds(selectedIds)}>
                        批量删除
                    </Button>
                </div>
            ) : null}

            <Modal
                title={deleteIds.length > 1 ? `删除 ${deleteIds.length} 条对话？` : "删除这条对话？"}
                open={Boolean(deleteIds.length)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                confirmLoading={submitting}
                onOk={() =>
                    void remove(deleteIds).then((success) => {
                        if (success) setDeleteIds([]);
                    })
                }
                onCancel={() => setDeleteIds([])}
            >
                <p className="text-sm text-[#687287] dark:text-[#a8aebb]">将永久删除消息、生成记录和仅由这些对话使用的媒体；仍被素材库、画布、短剧或作品引用的媒体会保留。</p>
            </Modal>
        </div>
    );
}

function formatConversationTime(value: number) {
    const date = new Date(value);
    const today = new Date();
    return date.toDateString() === today.toDateString() ? date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
