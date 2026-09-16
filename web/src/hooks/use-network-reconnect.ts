"use client";

import { useEffect, useRef } from "react";

/**
 * Shows an Ant Design message toast when the browser goes offline or comes
 * back online.
 *
 * Fixes BUG-10: after ERR_NETWORK_CHANGED / ERR_CONNECTION_CLOSED the user
 * had no feedback and had to manually refresh.
 */
export function useNetworkReconnect() {
    const wasOfflineRef = useRef(false);

    useEffect(() => {
        function handleOffline() {
            wasOfflineRef.current = true;
            import("antd").then(({ message }) => {
                void message.warning("网络连接已断开，正在重连…", 0);
            });
        }

        function handleOnline() {
            if (!wasOfflineRef.current) return;
            wasOfflineRef.current = false;
            import("antd").then(({ message }) => {
                message.destroy();
                void message.success("网络已恢复，你可以继续操作。");
            });
        }

        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);
        return () => {
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("online", handleOnline);
        };
    }, []);
}
