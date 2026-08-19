import IpLibraryDetail from "../components/ip-library-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    return <IpLibraryDetail ipId={(await params).id} />;
}
