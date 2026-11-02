import { channelWorkspaceStatusLabel, type ChannelWorkspaceStatus } from "./admin-channel-workspace-model";

const statusTone: Record<ChannelWorkspaceStatus, string> = {
    enabled: "border-[color-mix(in_srgb,var(--gm-success)_40%,transparent)] bg-[color-mix(in_srgb,var(--gm-success)_10%,transparent)] text-[var(--gm-success)]",
    draft: "border-[var(--gm-border)] bg-[var(--gm-wash)] text-[var(--gm-text-2)]",
    disabled: "border-[var(--gm-border)] bg-[var(--gm-wash-strong)] text-[var(--gm-text-2)]",
};

export function ChannelStatusBadge({ status }: { status: ChannelWorkspaceStatus }) {
    return <span className={`inline-flex h-6 shrink-0 items-center rounded border px-2 text-xs font-medium ${statusTone[status]}`}>{channelWorkspaceStatusLabel(status)}</span>;
}
