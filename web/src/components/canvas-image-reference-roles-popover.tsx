"use client";

import { Tag } from "lucide-react";
import { Button, Dropdown } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { IMAGE_REFERENCE_ROLE_LABELS, imageReferenceRoleSummary, normalizeImageReferenceRoles, toggleImageReferenceRole, type ImageReferenceRole, type ImageReferenceRoles } from "@/lib/image-reference-roles";

type CanvasImageReference = {
    nodeId: string;
    kind: string;
    label: string;
    title: string;
};

type CanvasImageReferenceRolesPopoverProps = {
    references: readonly CanvasImageReference[];
    roles?: ImageReferenceRoles;
    onChange: (roles: ImageReferenceRoles) => void;
};

export function CanvasImageReferenceRolesPopover({ references, roles, onChange }: CanvasImageReferenceRolesPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const current = normalizeImageReferenceRoles(roles);
    const roleEntries = Object.entries(IMAGE_REFERENCE_ROLE_LABELS) as Array<[ImageReferenceRole, string]>;
    return (
        <Dropdown
            trigger={["click"]}
            placement="top"
            popupRender={() => (
                <div className="w-80 rounded-xl border p-2 shadow-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                    <div className="px-2 pb-1 text-[11px] font-semibold">参考图用途（可多选）</div>
                    <div className="mb-2 px-2 text-[10px] leading-4 opacity-60">默认是原始参考，不添加任何语义约束</div>
                    {references.length ? (
                        <div className="max-h-72 space-y-1 overflow-y-auto">
                            {references.map((reference) => {
                                const selected = current[reference.nodeId] || ["original"];
                                return (
                                    <div key={reference.nodeId} className="rounded-lg px-2 py-1.5" style={{ background: theme.toolbar.itemHover }}>
                                        <div className="mb-1 truncate text-xs font-medium">
                                            {reference.label} · {reference.title}
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                            {roleEntries.map(([value, label]) => (
                                                <label key={value} className="flex min-w-0 items-center gap-1 text-[11px] opacity-85">
                                                    <input type="checkbox" checked={selected.includes(value)} onChange={() => onChange({ ...current, [reference.nodeId]: toggleImageReferenceRole(selected, value) })} />
                                                    <span className="truncate">{label}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="mt-1 truncate text-[10px] opacity-55">当前：{imageReferenceRoleSummary(selected)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="px-2 py-2 text-[11px] opacity-60">暂无已连接图片</div>
                    )}
                </div>
            )}
        >
            <Button type="text" data-canvas-no-drag className="canvas-composer-settings !h-10 !min-w-[9rem] !max-w-full !flex-1 !justify-start !rounded-full !px-3" style={{ color: theme.node.muted }} aria-label="设置参考图用途">
                <Tag className="mr-1.5 size-3.5" />
                <span className="truncate text-xs">参考图用途</span>
            </Button>
        </Dropdown>
    );
}
