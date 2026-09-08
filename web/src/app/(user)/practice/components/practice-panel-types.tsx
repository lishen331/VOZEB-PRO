import { Input, InputNumber, Select, Switch } from "antd";
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
    return Object.fromEntries(capability.inputSchema.filter((field) => field.defaultValue !== undefined && !["prompt", "text"].includes(field.key) && !isDialogueSlotField(field.key)).map((field) => [field.key, field.defaultValue]));
}

export function workflowFormFields(capability: PracticeModuleCapability) {
    return capability.inputSchema.filter((field, index, fields) => {
        if (fields.findIndex((item) => item.key === field.key) !== index) return false;
        if (["prompt", "text", "referenceImage", "sceneImage", "characterPropImage1", "characterPropImage2", "characterPropImage3", "image", "audio"].includes(field.key)) return false;
        if (/^s\d+_/.test(field.key)) return false;
        return field.required || field.type === "text" || field.type === "textarea";
    });
}

export function WorkflowFormFields({ capability, value, onChange }: { capability: PracticeModuleCapability; value: Record<string, unknown>; onChange: (key: string, next: unknown) => void }) {
    const fields = workflowFormFields(capability);
    if (!fields.length) return null;
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
                <WorkflowField key={field.key} field={field} value={value[field.key]} onChange={(next) => onChange(field.key, next)} />
            ))}
        </div>
    );
}

export function WorkflowOptionalFields({ capability, value, onChange }: { capability: PracticeModuleCapability; value: Record<string, unknown>; onChange: (key: string, next: unknown) => void }) {
    const fields = capability.inputSchema.filter((field, index, fields) => fields.findIndex((item) => item.key === field.key) === index && !field.required && !isDialogueSlotField(field.key) && ["number", "enum", "boolean"].includes(field.type));
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
    if (field.type === "text" || field.type === "textarea")
        return (
            <label className="block text-sm font-medium">
                {field.label}
                {field.required ? " *" : ""}
                <Input.TextArea value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} autoSize={{ minRows: field.type === "textarea" ? 2 : 1, maxRows: 6 }} className="!mt-2" />
            </label>
        );
    if (field.type === "number")
        return (
            <label className="block text-sm font-medium">
                {field.label}
                {field.required ? " *" : ""}
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

function isDialogueSlotField(key: string) {
    return /^s\d+_/.test(key);
}

export function capabilityForWorkflow(capability: PracticeModuleCapability, code: string, modelId?: string): PracticeModuleCapability {
    const options = capability.models.find((model) => model.id === modelId)?.workflowOptions || capability.workflowOptions;
    const workflow = options?.find((option) => option.code === code);
    return { ...capability, available: capability.available && (!options?.length || Boolean(workflow)), inputSchema: workflow?.inputSchema || capability.inputSchema };
}
