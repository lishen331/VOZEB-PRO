import { InputNumber, Select, Switch } from "antd";
import type { PracticeModuleCapability, PracticeModuleInputField, PracticeModuleKind } from "@/lib/practice-domain";
import type { IpReference } from "@/lib/ip-library-domain";
import type { PracticeSession } from "@/services/api/practice";

export type PracticePanelProps = {
    capability: PracticeModuleCapability;
    ipReferences: IpReference[];
    onIpReferencesChange: (value: IpReference[]) => void;
    onCreated: (session: PracticeSession) => void;
};

export type PracticePanelModule = PracticeModuleKind;

export function workflowFieldDefaults(capability: PracticeModuleCapability) {
    return Object.fromEntries(capability.inputSchema.filter((field) => !field.required && field.defaultValue !== undefined).map((field) => [field.key, field.defaultValue]));
}

export function WorkflowOptionalFields({ capability, value, onChange }: { capability: PracticeModuleCapability; value: Record<string, unknown>; onChange: (key: string, next: unknown) => void }) {
    const fields = capability.inputSchema.filter((field) => !field.required && ["number", "enum", "boolean"].includes(field.type));
    if (!fields.length) return null;
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
                <WorkflowField key={field.key} field={field} value={value[field.key]} onChange={(next) => onChange(field.key, next)} />
            ))}
        </div>
    );
}

function WorkflowField({ field, value, onChange }: { field: PracticeModuleInputField; value: unknown; onChange: (value: unknown) => void }) {
    if (field.type === "number")
        return (
            <label className="block text-sm font-medium">
                {field.label}
                <InputNumber value={typeof value === "number" ? value : undefined} onChange={(next) => onChange(next ?? undefined)} className="!mt-2 !w-full" />{" "}
            </label>
        );
    if (field.type === "enum")
        return (
            <label className="block text-sm font-medium">
                {field.label}
                <Select value={typeof value === "string" ? value : undefined} onChange={onChange} options={(field.options || []).map((option) => ({ value: option, label: option }))} className="!mt-2 !w-full" />{" "}
            </label>
        );
    return (
        <label className="flex items-center justify-between gap-3 border border-border p-3 text-sm font-medium">
            {field.label}
            <Switch checked={value === true} onChange={onChange} />
        </label>
    );
}
