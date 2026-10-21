import type { GammaSubject } from "@/components/gamma-ui/gamma-subjects";
import { cn } from "@/lib/utils";

/*
 * 课程封面（演示用）：专业色渐变 + 专业图标做底纹，不用与专业无关的风格缩略图。
 * 正式接入后换成课程真实封面图即可，组件外形不变。
 */

const HUES: Record<GammaSubject["accent"], [number, number]> = {
    blue: [222, 196],
    cyan: [192, 172],
    indigo: [236, 210],
    teal: [176, 150],
    violet: [262, 228],
    sky: [204, 182],
};

export function CourseCover({ subject, className, iconScale = 1 }: { subject: GammaSubject; className?: string; iconScale?: number }) {
    const [a, b] = HUES[subject.accent];
    const Icon = subject.icon;
    return (
        <span aria-hidden className={cn("relative block h-full w-full overflow-hidden", className)} style={{ background: `linear-gradient(135deg, hsl(${a} 78% 18%), hsl(${a} 82% 34%) 55%, hsl(${b} 90% 52%))` }}>
            {/* 网格 + 光斑：给纯色底一点设计稿的质感 */}
            <span className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
            <span className="absolute -top-1/4 -left-1/4 size-3/4 rounded-full bg-white/15 blur-3xl" />
            <Icon className="absolute -right-[6%] -bottom-[14%] text-white/20" strokeWidth={1.2} style={{ width: `${56 * iconScale}%`, height: "auto" }} />
        </span>
    );
}
