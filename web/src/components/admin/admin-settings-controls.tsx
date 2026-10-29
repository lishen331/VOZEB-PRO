import type { ReactNode } from "react";
import { Switch } from "@/components/gamma-ui/gamma-ant";

export function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
    return (
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--gm-text)]">
            <span className="admin-section-title-icon flex size-7 items-center justify-center rounded-md bg-[var(--gm-surface)] text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border)]">{icon}</span>
            <span>{title}</span>
        </div>
    );
}

export function LabeledControl({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-[var(--gm-text-3)]">{label}</span>
            {children}
        </label>
    );
}

export function SettingToggle({
    title,
    description,
    checked,
    checkedChildren,
    unCheckedChildren,
    onChange,
}: {
    title: string;
    description: string;
    checked: boolean;
    checkedChildren: string;
    unCheckedChildren: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--gm-text)]">{title}</div>
                <div className="mt-1 text-xs leading-5 text-[var(--gm-text-3)]">{description}</div>
            </div>
            <Switch className="shrink-0" checked={checked} checkedChildren={checkedChildren} unCheckedChildren={unCheckedChildren} onChange={onChange} />
        </div>
    );
}

export function SettingInlineToggle({ title, checked, checkedChildren, unCheckedChildren, onChange }: { title: string; checked: boolean; checkedChildren: string; unCheckedChildren: string; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex w-full items-center justify-between gap-4 rounded-md bg-[var(--gm-surface)] px-4 py-2.5 ring-1 ring-[var(--gm-border)] xl:w-auto">
            <div className="text-sm font-medium text-[var(--gm-text)]">{title}</div>
            <Switch className="shrink-0" checked={checked} checkedChildren={checkedChildren} unCheckedChildren={unCheckedChildren} onChange={onChange} />
        </div>
    );
}
