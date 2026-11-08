import { Suspense } from "react";

import { AssetsHub } from "./assets-hub";

export default function AssetsPage() {
    return (
        <Suspense>
            <AssetsHub />
        </Suspense>
    );
}
