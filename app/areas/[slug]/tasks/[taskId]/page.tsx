import TaskScreen from "@/components/momentum/task/task-screen";

export const dynamic = "force-dynamic";

export default async function AreaTaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; taskId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug, taskId } = await params;
  const { from } = await searchParams;
  return <TaskScreen type="area" slug={slug} taskId={taskId} from={from} />;
}
