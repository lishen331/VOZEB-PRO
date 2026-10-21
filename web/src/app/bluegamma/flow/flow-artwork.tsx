import { AudioLines, FileText, Image as ImageIcon, Video } from "lucide-react";

import type { FlowStep, FlowStepKind } from "@/app/bluegamma/flow/flow-types";
import { cn } from "@/lib/utils";

/*
 * 演示产出的占位画面：不用无关的风格缩略图冒充结果，而是按步骤生成一张带标注的示意卡。
 * 接入真实生成后，这里换成结果图即可。
 */

export const KIND_ICON: Record<FlowStepKind, typeof FileText> = { text: FileText, image: ImageIcon, video: Video, audio: AudioLines };

const HUES = [214, 192, 232, 176, 256, 200, 168];

function hueOf(key: string) {
    let hash = 0;
    for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return HUES[hash % HUES.length];
}

export function FlowArtwork({ step, label, compact = false, className }: { step: FlowStep; label?: string; compact?: boolean; className?: string }) {
    const Icon = KIND_ICON[step.kind];
    const hue = hueOf(step.key);
    return (
        <span
            aria-hidden
            className={cn("relative block h-full w-full overflow-hidden", className)}
            style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 22%), hsl(${hue + 24} 80% 38%) 60%, hsl(${hue + 40} 85% 52%))` }}
        >
            {/* 细网格：像图纸 / 版面，暗示这是设计产出 */}
            <span
                className="absolute inset-0 opacity-25"
                style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)", backgroundSize: compact ? "8px 8px" : "16px 16px" }}
            />
            <span className="absolute -right-6 -bottom-8 size-28 rounded-full bg-white/15 blur-xl" />
            <span className={cn("absolute inset-0 flex flex-col justify-between text-white", compact ? "p-1.5" : "p-3")}>
                <Icon className={compact ? "size-3.5 opacity-80" : "size-5 opacity-80"} />
                {compact ? null : (
                    <span className="flex flex-col">
                        <span className="text-sm font-semibold drop-shadow">{step.name}</span>
                        {label ? <span className="text-[11px] opacity-80">{label} · 示意</span> : null}
                    </span>
                )}
            </span>
        </span>
    );
}
