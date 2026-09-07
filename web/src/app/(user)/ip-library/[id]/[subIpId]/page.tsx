import IpLibraryDetail from "../../components/ip-library-detail";

export default async function Page({ params }: { params: Promise<{ id: string; subIpId: string }> }) {
    const { id, subIpId } = await params;
    return <IpLibraryDetail ipId={id} subIpId={subIpId} />;
}
