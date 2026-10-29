"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { Drawer } from "@/components/gamma-ui/gamma-ant-modal";
import { GammaAppSidebar } from "@/components/layout/gamma-app-sidebar";
import type { FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import { useSchoolContextStore } from "@/stores/use-school-context-store";

type MobileNavDrawerProps = {
    open: boolean;
    featureModules: FeatureModuleSettings;
    menuPermissions: readonly UserNavigationMenuPermission[];
    onClose: () => void;
};

/** 小屏导航：从左侧滑出与桌面一致的布鲁伽马侧栏（展开态），切换页面后自动收起 */
export function MobileNavDrawer({ open, featureModules, menuPermissions, onClose }: MobileNavDrawerProps) {
    const pathname = usePathname();
    const previousPathnameRef = useRef(pathname);
    const schoolContext = useSchoolContextStore((state) => state.context);

    useEffect(() => {
        if (previousPathnameRef.current === pathname) return;
        previousPathnameRef.current = pathname;
        onClose();
    }, [onClose, pathname]);

    return (
        <Drawer aria-label="导航菜单" placement="left" size={208} open={open} onClose={onClose} closable={false} rootClassName="lg:hidden" styles={{ header: { display: "none" }, body: { padding: 0, background: "var(--gm-bg-elevated)" } }}>
            <GammaAppSidebar collapsed={false} onToggle={onClose} featureModules={featureModules} menuPermissions={menuPermissions} schoolContext={schoolContext} showTheme />
        </Drawer>
    );
}
