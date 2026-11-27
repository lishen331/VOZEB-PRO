import { respondToReversePromptHistory } from "../history-response";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    return respondToReversePromptHistory(request, (await context.params).id);
}
