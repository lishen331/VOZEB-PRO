"use client";

import { useState } from "react";
import { Button, Modal } from "antd";
import { RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";

const CanvasPanoramaSurface = dynamic(() => import("@/app/(user)/canvas/components/canvas-panorama-surface").then((m) => ({ default: m.CanvasPanoramaSurface })), { ssr: false });

export function PracticePanoramaViewer({ url, title = "360°查看" }: { url: string; title?: string }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => setOpen(true)}>
                360°查看
            </Button>
            <Modal open={open} onCancel={() => setOpen(false)} footer={null} width="80vw" centered title={title} styles={{ body: { height: "70vh", padding: 0 } }}>
                {open ? <CanvasPanoramaSurface src={url} alt="360°全景图" /> : null}
            </Modal>
        </>
    );
}
