import { authorizeDramaLabAdmin, legacyReadOnly } from "../../_lib";

export async function PUT() {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;
    return legacyReadOnly();
}

export async function DELETE() {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;
    return legacyReadOnly();
}
