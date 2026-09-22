export type ReviewAction = "accept-result" | "allow-retry";
type Reviewable = { userId: string; status: string; result?: { url?: string; text?: string }; diagnostics?: Record<string, unknown> };
export function reviewBindingVerification<T extends Reviewable>(run: T, action: ReviewAction, userId: string, confirmed: boolean) {
    if (run.userId !== userId || confirmed !== true) throw new Error("需要本人明确确认此操作");
    if (action === "accept-result" && (!(run.status === "needs_review" || run.status === "passed") || !(run.result?.url || run.result?.text?.trim()) || !run.diagnostics?.requestDigest)) throw new Error("没有可人工验收的真实生成结果");
    return { ...run, status: action === "accept-result" ? "passed" : run.status, diagnostics: { ...run.diagnostics, ...(action === "allow-retry" ? { retryAuthorized: true } : {}), manualReview: { action, userId, at: Date.now() } } };
}
