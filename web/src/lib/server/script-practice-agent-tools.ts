export const SCRIPT_AGENT_TOOL_NAMES = [
    "read_script",
    "read_outline",
    "read_entities",
    "read_scene",
    "read_selection",
    "rewrite_selection",
    "expand_selection",
    "polish_selection",
    "create_scene",
    "update_scene",
    "create_character",
    "update_character",
    "create_location",
    "update_location",
    "create_beat",
    "reorder_scenes",
    "validate_script_structure",
    "create_version",
] as const;
export type ScriptAgentToolName = (typeof SCRIPT_AGENT_TOOL_NAMES)[number];
export function isScriptAgentToolName(value: string): value is ScriptAgentToolName {
    return SCRIPT_AGENT_TOOL_NAMES.includes(value as ScriptAgentToolName);
}
