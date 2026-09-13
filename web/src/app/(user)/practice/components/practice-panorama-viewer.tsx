"use client";

import { useState, type ReactNode } from "react";
import { Button, Modal } from "antd";
import { RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";

const CanvasPanoramaSurface = dynamic(() => import("@/app/(user)/canvas/components/canvas-panorama-surface").then((m) => ({ default: m.CanvasPanoramaSurface })), { ssr: false });

export function PracticePanoramaViewer({ url, title = "360°查看", children }: { url: string; title?: string; children?: ReactNode }) {
    const [open, setOpen] = useState(false);
    // Demo 直接把 2:1 等距柱状原图交给 Photo Sphere Viewer；不能套用普通图片预览或 1:1 变换。
    return (
        <>
            {children ? (
                <div
                    role="button"
                    tabIndex={0}
                    aria-label="点击查看 360° 全景"
                    className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => setOpen(true)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setOpen(true);
                        }
                    }}
                >
                    {children}
                </div>
            ) : (
                <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => setOpen(true)}>
                    360°查看
                </Button>
            )}
            <Modal open={open} onCancel={() => setOpen(false)} footer={null} width="100vw" centered destroyOnHidden title={title} styles={{ body: { padding: 0 }, header: { marginBottom: 0 } }}>
                {open ? (
                    <div className="h-[calc(100vh-88px)] min-h-[320px] overflow-hidden bg-black">
                        <CanvasPanoramaSurface src={url} alt="360°全景图" />
                    </div>
                ) : null}
            </Modal>
        </>
    );
}
