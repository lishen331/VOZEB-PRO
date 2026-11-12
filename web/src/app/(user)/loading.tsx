import { GammaDetailSkeleton } from "@/components/gamma-ui/gamma-data";

/*
 * 工作空间的路由级加载态。
 *
 * 侧栏点一下要等服务端把新路由的 RSC 数据送回来，这期间旧页面会整块冻结；
 * 没有这层 loading，用户看到的只是「点了一点反应都没有」，然后反复点。
 * 图形统一用项目现有的骨架（gm-shimmer），与各页自己的骨架视觉一致。
 */
export default function Loading() {
    return (
        <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)]">
            <GammaDetailSkeleton label="正在打开页面" />
        </main>
    );
}
