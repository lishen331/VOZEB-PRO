"use client";

import { useEffect, useState } from "react";

import { VozebProCanvasPage } from "@/app/(user)/canvas/[id]/canvas-client-page";
import { CanvasRefreshShell } from "@/app/(user)/canvas/[id]/canvas-page-elements";

/** 复用正式画布编辑器，只多传一个练习档案；正式画布的默认导出不受影响。 */
export default function PracticeCanvasClientPage() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return <CanvasRefreshShell />;
    return <VozebProCanvasPage executionProfile="open-source-practice" />;
}
