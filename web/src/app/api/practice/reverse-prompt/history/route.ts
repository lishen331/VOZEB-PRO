import { respondToReversePromptHistory } from "./history-response";

export function GET(request: Request) {
    return respondToReversePromptHistory(request);
}
