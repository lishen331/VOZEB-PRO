type DramaScriptTaskRequestInput = {
    projectId: string;
    episodeId?: string;
    prompt: string;
    requestId: string;
};

export function createDramaScriptTaskRequest({ projectId, episodeId, prompt, requestId }: DramaScriptTaskRequestInput) {
    return {
        context: {
            surface: "drama" as const,
            projectId,
            episodeId,
            clientRequestId: requestId,
        },
        messages: [
            {
                role: "user" as const,
                content: prompt,
            },
        ],
    };
}
