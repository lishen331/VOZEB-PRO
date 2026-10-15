"use client";

import { App, Button } from "antd";
import { GalleryVerticalEnd, Share2, Sparkles } from "lucide-react";
import Link from "next/link";

import { PublicWorkReportButton } from "@/components/works/public-work-report-button";

export function WorkGovernanceActions({ slug, createHref }: { slug: string; createHref?: string }) {
    const { message } = App.useApp();

    const share = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            message.success("分享链接已复制");
        } catch {
            message.error("复制失败，请从浏览器地址栏复制链接");
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {createHref ? (
                <Link href={createHref} className="inline-flex h-9 items-center gap-2 rounded-md !bg-foreground px-3 text-sm font-medium !text-background transition hover:opacity-80">
                    <Sparkles className="size-4" />
                    做同款
                </Link>
            ) : null}
            <Link href="/gallery" className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d6ddea] px-3 text-sm font-medium text-[#2d3443] transition hover:bg-[#f1f4f9] dark:border-[#323948] dark:text-[#e8ebf0] dark:hover:bg-[#141a28]">
                <GalleryVerticalEnd className="size-4" />
                <span className="hidden sm:inline">作品广场</span>
            </Link>
            <Button className="!h-9" icon={<Share2 className="size-4" />} onClick={() => void share()} aria-label="复制分享链接">
                <span className="hidden sm:inline">分享</span>
            </Button>
            <PublicWorkReportButton slug={slug} className="!h-9" />
        </div>
    );
}
