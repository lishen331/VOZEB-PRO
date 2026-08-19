import { NextResponse } from "next/server";

export function schoolApiOk<T>(data: T) {
    return NextResponse.json({ code: 0, data, msg: "ok" });
}

export function schoolApiError(status: number, msg: string) {
    return NextResponse.json({ code: status, data: null, msg }, { status });
}

export function schoolApiFailure(error: unknown, fallback: string) {
    const status = schoolApiErrorStatus(error);
    if (status === 500) console.error(fallback, { errorType: error instanceof Error ? error.name : typeof error });
    return schoolApiError(status, status === 500 ? fallback : error instanceof Error ? error.message : fallback);
}

export function schoolApiErrorStatus(error: unknown) {
    const status = error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

export function isSchoolApiObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function positiveInteger(value: string | null, fallback: number) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
