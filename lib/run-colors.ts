// Run colours for the dispatch map (docs/DESIGN.md §3.4). Raw hex because Leaflet can't read CSS
// variables. Every marker also shows its run number, so colour is never the only cue.
export const RUN_COLORS = [
  "#1F77B4",
  "#2CA02C",
  "#FF7F0E",
  "#9467BD",
  "#17BECF",
  "#8C564B",
  "#E377C2",
  "#BCBD22",
  "#0B3C5D",
  "#00A087",
  "#7F7F7F",
  "#D62728",
] as const;

/** Colour for Run n (1-based), cycling after 12. */
export function runColor(runNumber: number): string {
  return RUN_COLORS[(runNumber - 1) % RUN_COLORS.length];
}
