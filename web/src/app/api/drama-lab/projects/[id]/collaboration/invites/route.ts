export { GET, POST, DELETE } from "../invite/route";

// Route segment config must be declared locally; Next.js does not allow
// re-exporting `dynamic` from another route module.
export const dynamic = "force-dynamic";
