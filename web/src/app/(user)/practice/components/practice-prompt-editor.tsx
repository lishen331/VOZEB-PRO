"use client";

import { App, Button, Input } from "antd";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { optimizePrompt } from "@/services/api/prompt-optimization";

export function PracticePromptEditor({
    label,
    briefLabel,
    placeholder,
    value,
    onChange,
    mode = "image",
    disabled,
    children,
}: {
    label: string;
    briefLabel: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    mode?: "image" | "video";
    disabled?: boolean;
    children?: ReactNode;
}) {
    const { message } = App.useApp();
    const [brief, setBrief] = useState("");
    const [busy, setBusy] = useState(false);
    const revision = useRef(0);
    const pending = useRef(false);
    useEffect(
        () => () => {
            revision.current += 1;
        },
        [],
    );
    useEffect(() => {
        if (disabled) revision.current += 1;
    }, [disabled]);
    const generate = async () => {
        if (pending.current || disabled || !(brief.trim() || value.trim())) return;
        pending.current = true;
        setBusy(true);
        const current = revision.current;
        try {
            const prompt = await optimizePrompt({ requestId: crypto.randomUUID(), prompt: brief.trim() || value.trim(), mode });
            if (revision.current === current) onChange(prompt);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "生成提示词失败");
        } finally {
            pending.current = false;
            setBusy(false);
        }
    };
    return (
        <div className="space-y-4">
            <label className="block text-sm font-medium">
                {briefLabel}
                <Input.TextArea
                    aria-label={briefLabel}
                    value={brief}
                    onChange={(event) => {
                        revision.current += 1;
                        setBrief(event.target.value);
                    }}
                    autoSize={{ minRows: 2, maxRows: 5 }}
                    placeholder={placeholder}
                    className="!mt-2"
                />
            </label>
            {children}
            <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    <Button size="small" icon={<Sparkles className="size-3.5" />} loading={busy} disabled={disabled || !(brief.trim() || value.trim())} onClick={() => void generate()}>
                        生成提示词
                    </Button>
                </div>
                <Input.TextArea
                    aria-label={label}
                    value={value}
                    onChange={(event) => {
                        revision.current += 1;
                        onChange(event.target.value);
                    }}
                    autoSize={{ minRows: 4, maxRows: 10 }}
                    placeholder="可直接输入提示词，或根据上方设定生成后编辑"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">提示词生成使用后台文本模型；编辑确认后再提交生成。</p>
            </div>
        </div>
    );
}
