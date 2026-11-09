import { redirect } from "next/navigation";

export default function MyPromptsPageRoute() {
    redirect("/prompts?tab=mine");
}
