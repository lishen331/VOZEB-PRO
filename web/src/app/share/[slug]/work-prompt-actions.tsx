"use client";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Button } from "@/components/gamma-ui/gamma-ant";
import { Copy, Sparkles } from "lucide-react";
import Link from "next/link";

export function WorkPromptActions({ prompt, createHref }: { prompt: string; createHref: string }) {
    const { message } = App.useApp();

    const copyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(prompt);
            message.success("提示词已复制");
        } catch {
            message.error("复制失败，请手动选择提示词");
        }
    };

    return (
        <div className="mt-3 grid grid-cols-2 gap-2">
            <Button icon={<Copy className="size-4" />} onClick={() => void copyPrompt()}>
                复制提示词
            </Button>
            <Link
                href={createHref}
                className="inline-flex h-8 items-center justify-center gap-2 gm-btn-primary rounded-[var(--gm-radius-sm)] border border-transparent bg-[image:var(--gm-gradient)] px-3 text-sm font-medium !text-white shadow-[var(--gm-glow-blue)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
            >
                <Sparkles className="size-4" />
                做同款
            </Link>
        </div>
    );
}
