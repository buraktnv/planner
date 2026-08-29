import { redirect } from "next/navigation";

/** The Dashboard's charts live on /review — one weekly place to look. */
export default function InsightsPage() {
  redirect("/review");
}
