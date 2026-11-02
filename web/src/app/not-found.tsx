import { Home } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-[var(--gm-bg)] text-[var(--gm-text)]">
            <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-[var(--gm-bg)] bg-[radial-gradient(var(--gm-border-strong)_1px,transparent_1px)] px-6 py-10 text-[var(--gm-text)] [background-size:16px_16px]">
                <section className="w-full max-w-md text-center">
                    <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-lg border border-[var(--gm-border)] bg-[var(--gm-surface)] text-2xl font-semibold shadow-sm">404</div>
                    <h1 className="text-3xl font-semibold tracking-normal">页面不存在</h1>
                    <p className="mt-3 text-sm leading-6 text-[var(--gm-text-2)]">这个地址没有对应的页面，可能已经移动或被合并到其他入口。</p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-lg !bg-[var(--gm-blue)] px-4 text-sm font-medium !text-white transition hover:!bg-[var(--gm-blue-hover)]">
                            <Home className="size-4" />
                            返回首页
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
