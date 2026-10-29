import { cn } from "@/lib/utils";

export const GAMMA_BRAND = {
    name: "蓝色伽马",
    nameEn: "BlueGamma",
    mark: "/brand/bluegamma-mark.png",
} as const;

/** 品牌标识：圆形 γ 标 + 中英文字标 */
export function GammaLogo({ size = 32, showText = true, stacked = false, className }: { size?: number; showText?: boolean; stacked?: boolean; className?: string }) {
    return (
        <span className={cn("inline-flex items-center gap-2.5", stacked && "flex-col gap-1.5", className)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 静态品牌资源 */}
            <img src={GAMMA_BRAND.mark} alt={GAMMA_BRAND.name} width={size} height={size} className="shrink-0 rounded-full shadow-[0_0_0_1px_rgba(40,235,250,0.25),0_6px_20px_rgba(0,80,245,0.45)]" />
            {showText ? (
                <span className={cn("flex flex-col leading-none", stacked && "items-center")}>
                    <span className="text-[15px] font-semibold tracking-[0.06em] text-[var(--gm-text)]">{GAMMA_BRAND.name}</span>
                    <span className="mt-1 text-[10px] font-medium tracking-[0.22em] text-[var(--gm-accent)] uppercase">{GAMMA_BRAND.nameEn}</span>
                </span>
            ) : null}
        </span>
    );
}
