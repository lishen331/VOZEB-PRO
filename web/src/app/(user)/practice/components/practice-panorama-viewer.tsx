"use client";

import { useState } from "react";
import { Button, Modal } from "antd";
import { RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";

import { imagePreviewUrl } from "@/lib/media-image-url";

const CanvasPanoramaSurface = dynamic(() => import("@/app/(user)/canvas/components/canvas-panorama-surface").then((m) => ({ default: m.CanvasPanoramaSurface })), { ssr: false });

export function PracticePanoramaViewer({ url, title = "360°查看" }: { url: string; title?: string }) {
    const [open, setOpen] = useState(false);
    // 与画布端全景查看器一致：喂给 WebGL 的是有界的 webp 预览而非原始大图，避免超大全景解码/贴图失败悄悄回退成一张平面方图.
    const previewSrc = imagePreviewUrl(url, 1920);
    return (
        <>
            <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => setOpen(true)}>
                360°查看
            </Button>
            <Modal open={open} onCancel={() => setOpen(false)} footer={null} width="80vw" centered destroyOnHidden title={title} styles={{ body: { padding: 0 } }}>
                {open ? (
                    <div className="h-[70vh] min-h-[320px] overflow-hidden bg-black">
                        <CanvasPanoramaSurface src={previewSrc} alt="360°全景图" />
                    </div>
                ) : null}
            </Modal>
        </>
    );
}
