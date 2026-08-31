import { listNotes } from "@/lib/core/knowledge";
import { listCharters } from "@/lib/core/store";
import { readCanvas } from "@/lib/core/canvas";
import { buildNoteCanvas } from "@/lib/view/canvas";
import CanvasView from "@/components/momentum/canvas/canvas-view";
import CanvasFilters from "@/components/momentum/canvas/canvas-filters";
import { buildCanvasTabs, type TabCharter } from "@/lib/view/canvas-tabs";
import {
  applyCanvasFilter,
  canvasFacets,
  charterMap,
  compareBands,
  isFiltered,
  parseCanvasFilter,
  statusOf,
  type BandCharter,
} from "@/lib/view/canvas-filter";
import { hueOf } from "@/lib/ui/momentum";

export const dynamic = "force-dynamic";

function tabCharters(
  projects: { id: string; name: string }[],
  areas: { id: string; name: string }[],
): TabCharter[] {
  return [
    ...projects.map((p) => ({
      id: p.id,
      name: p.name,
      type: "project" as const,
      color: hueOf(p.id).color,
    })),
    ...areas.map((a) => ({
      id: a.id,
      name: a.name,
      type: "area" as const,
      color: hueOf(a.id).color,
    })),
  ];
}

export default async function CanvasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [notes, projects, areas, file, params] = await Promise.all([
    listNotes(),
    listCharters("project"),
    listCharters("area"),
    readCanvas({ kind: "knowledge" }),
    searchParams,
  ]);

  const charterNames: Record<string, string> = {};
  for (const p of projects) charterNames[p.id] = p.name;
  for (const a of areas) charterNames[`area:${a.id}`] = a.name;

  // A note's band key is its first scope: a bare slug for a project, prefixed
  // for an area. The status behind that key is what orders the bands.
  const bands: BandCharter[] = [
    ...projects.map((p) => ({ key: p.id, name: p.name, status: p.status })),
    ...areas.map((a) => ({ key: `area:${a.id}`, name: a.name, status: a.status })),
  ];
  const charters = charterMap(bands);

  const filter = parseCanvasFilter(params);
  // Filtering has to happen before the model is built: the band rectangles and
  // the viewport bounds are computed from this list.
  const visible = applyCanvasFilter(notes, charters, filter);
  const facets = canvasFacets(notes, charters, filter);

  const model = buildNoteCanvas(visible, file, {
    charterNames,
    bandCompare: (a, b) => compareBands(a, b, charters),
    bandStatus: (key) => statusOf(key, charters),
  });

  return (
    <div className="h-full">
      <CanvasView
        model={model}
        surface={{ kind: "knowledge" }}
        title="Canvas"
        tabs={buildCanvasTabs(tabCharters(projects, areas), "system")}
        filters={<CanvasFilters facets={facets} filter={filter} />}
        emptyNote={
          isFiltered(filter) && notes.length > 0
            ? `No notes match this filter. ${notes.length} note${
                notes.length === 1 ? "" : "s"
              } in the base — clear the filter to see them.`
            : undefined
        }
      />
    </div>
  );
}
