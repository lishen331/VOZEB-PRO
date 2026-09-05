import InviteRequestClient from "./invite-request-client";

/** Public invite preview. Joining still requires the existing platform login. */
export default async function DramaLabInvitePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    return <InviteRequestClient token={token} />;
}
