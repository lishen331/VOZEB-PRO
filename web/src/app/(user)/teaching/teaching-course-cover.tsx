import { BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * 课程封面：有封面图就用图，没有就按课程 id 取一个品牌蓝青区间的渐变（同一门课颜色固定），
 * 版式与预览页 /bluegamma/courses 的 CourseCover 一致。
 */

function hueOf(seed: string) {
    let hash = 0;
    for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return 196 + (hash % 44); // 196–240：青到蓝
}

export function TeachingCourseCover({ seed, coverUrl, className }: { seed: string; coverUrl?: string; className?: string }) {
    if (coverUrl) {
        // eslint-disable-next-line @next/next/no-img-element -- 课程封面走鉴权路由，尺寸由容器决定
        return <img src={coverUrl} alt="" className={cn("block h-full w-full object-cover", className)} />;
    }
    const hue = hueOf(seed);
    return (
        <span aria-hidden className={cn("relative block h-full w-full overflow-hidden", className)} style={{ background: `linear-gradient(135deg, hsl(${hue} 78% 18%), hsl(${hue} 82% 34%) 55%, hsl(${hue - 24} 90% 52%))` }}>
            <span className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
            <span className="absolute -top-1/4 -left-1/4 size-3/4 rounded-full bg-white/15 blur-3xl" />
            <BookOpen className="absolute -right-[6%] -bottom-[14%] h-auto w-[52%] text-white/20" strokeWidth={1.2} />
        </span>
    );
}
