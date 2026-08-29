import { redirect } from "next/navigation";

/** Agents is a Settings tab — it configures how the assistant reaches your data. */
export default function AgentsPage() {
  redirect("/settings/agents");
}
