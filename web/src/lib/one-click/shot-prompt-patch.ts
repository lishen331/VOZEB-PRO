export function shotPromptPatch(input: { imagePrompt: string; polishedPrompt: string; videoPrompt: string }) {
    return { imagePrompt: input.imagePrompt, polishedPrompt: input.polishedPrompt, videoPrompt: input.videoPrompt };
}
