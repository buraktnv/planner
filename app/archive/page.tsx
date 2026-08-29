import { redirect } from "next/navigation";

/** Archived charters are listed on /done — finished work and retired work are one question. */
export default function ArchivePage() {
  redirect("/done");
}
