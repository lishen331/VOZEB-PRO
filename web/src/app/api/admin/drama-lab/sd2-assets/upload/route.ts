import { authorizeDramaLabAdmin, legacyReadOnly } from "../../_lib";

export async function POST() {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;
    return legacyReadOnly();
}
