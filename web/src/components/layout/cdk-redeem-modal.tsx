"use client";

import { useState } from "react";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Gift } from "lucide-react";

import { Button } from "@/components/gamma-ui/gamma-ant";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Modal } from "@/components/gamma-ui/gamma-ant-modal";
import { formatCreditAmount } from "@/constant/credits";
import { useUserStore, type LocalUser } from "@/stores/use-user-store";

/** CDK 兑换积分（原顶栏积分弹层里的兑换入口，顶栏去掉后放进侧栏账户菜单） */
export function CdkRedeemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const setUser = useUserStore((state) => state.setUser);
    const [code, setCode] = useState("");
    const [redeeming, setRedeeming] = useState(false);

    const redeem = async () => {
        const value = code.trim();
        if (!value || redeeming) return;
        setRedeeming(true);
        try {
            const response = await fetch("/api/cdk/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: value }) });
            const payload = (await response.json()) as { user?: LocalUser; points?: number; error?: string };
            if (!response.ok || !payload.user) throw new Error(payload.error || "兑换失败");
            setUser(payload.user);
            setCode("");
            message.success(`兑换成功，获得 ${formatCreditAmount(payload.points || 0)} 积分`);
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "兑换失败");
        } finally {
            setRedeeming(false);
        }
    };

    return (
        <Modal
            centered
            open={open}
            width={400}
            onCancel={onClose}
            destroyOnHidden
            title={
                <span className="inline-flex items-center gap-2">
                    <Gift className="size-4 text-[var(--gm-accent)]" />
                    CDK 兑换
                </span>
            }
            footer={null}
        >
            <p className="mb-3 text-[13px] text-[var(--gm-text-3)]">输入兑换密钥，积分到账后余额自动刷新。</p>
            <div className="flex gap-2">
                <Input autoFocus value={code} onChange={(event) => setCode(event.target.value)} onPressEnter={() => void redeem()} placeholder="输入兑换密钥" aria-label="兑换密钥" />
                <Button type="primary" loading={redeeming} disabled={!code.trim()} onClick={() => void redeem()}>
                    兑换
                </Button>
            </div>
        </Modal>
    );
}
