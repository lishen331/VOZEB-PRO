export class DramaLabCollaborationError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "DramaLabCollaborationError";
    }

    static [Symbol.hasInstance](value: unknown) {
        return value instanceof Error && (value.name === "DramaLabCollaborationError" || value.constructor?.name === "DramaLabCollaborationError");
    }
}

export function isDramaLabCollaborationError(value: unknown): value is { status: number; message: string } {
    return value instanceof Error && (value.name === "DramaLabCollaborationError" || value.constructor?.name === "DramaLabCollaborationError");
}
