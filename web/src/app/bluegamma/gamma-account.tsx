"use client";

import { Check, LogOut, Settings, UserRound } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaMenu, GammaModal } from "@/components/gamma-ui/gamma-overlays";
import { cn } from "@/lib/utils";

/** 顶栏头像菜单 */
export function GammaAccountMenu({ onNotice }: { onNotice: (message: string) => void }) {
    return (
        <GammaMenu
            label="账户菜单"
            trigger={(open) => <span className={cn("block size-9 rounded-full bg-[image:var(--gm-gradient)] ring-2 transition-shadow", open ? "ring-[var(--gm-accent)]" : "ring-transparent")} />}
            items={[
                { key: "profile", label: "个人主页", icon: <UserRound />, onSelect: () => onNotice("个人主页设计中") },
                { key: "settings", label: "账户设置", icon: <Settings />, onSelect: () => onNotice("设置页设计中") },
                { key: "logout", label: "退出登录", icon: <LogOut />, danger: true, onSelect: () => onNotice("演示页不会真的退出") },
            ]}
        />
    );
}

const UPGRADE_PERKS = ["每月 20,000 积分，用不完可结转", "视频生成 1080P，无水印下载", "优先排队，平均出片快 3 倍"];

export function GammaUpgradeModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void }) {
    return (
        <GammaModal
            open={open}
            title="升级布鲁伽马创作者年卡"
            description="12 个专业不限次数生成、作品集一键排版、工作室空间与作品共享。"
            onClose={onClose}
            footer={
                <>
                    <GammaButton variant="ghost" onClick={onClose}>
                        再想想
                    </GammaButton>
                    <GammaButton shine onClick={onConfirm}>
                        ¥ 699 / 年 立即开通
                    </GammaButton>
                </>
            }
        >
            <ul className="grid gap-2.5 text-[13px] text-[var(--gm-text-2)]">
                {UPGRADE_PERKS.map((line) => (
                    <li key={line} className="flex items-center gap-2">
                        <span className="grid size-5 place-items-center rounded-full bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]">
                            <Check className="size-3" />
                        </span>
                        {line}
                    </li>
                ))}
            </ul>
        </GammaModal>
    );
}
