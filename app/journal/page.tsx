import { redirect } from "next/navigation";

/** The journal feed lives at /settings/activity. */
export default function JournalPage() {
  redirect("/settings/activity");
}
