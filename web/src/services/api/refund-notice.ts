/**
 * 生成失败时后端会自动退回扣掉的积分，但用户此前只能看到余额悄悄上涨。
 * 这里把实际退回数量拼进失败提示，让用户明确知道「这次的积分退回来了」。
 */
export function withRefundNotice(message: string, refundedPoints?: number) {
    if (typeof refundedPoints !== "number" || !Number.isFinite(refundedPoints) || refundedPoints <= 0) return message;
    return `${message}（本次扣除的 ${formatPoints(refundedPoints)} 积分已退回）`;
}

function formatPoints(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
