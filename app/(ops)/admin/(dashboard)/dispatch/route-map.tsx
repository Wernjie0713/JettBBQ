"use client";

// Dispatch map (docs/DESIGN.md §8): OneMap Grey basemap, the kitchen as a round Jett marker,
// numbered stops in run colours, and one polyline per run. Loaded with ssr:false (Leaflet needs window).

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLng } from "@/lib/routing/geo";

export type MapStop = {
  id: string;
  lat: number;
  lng: number;
  seq: number;
  label: string; // e.g. "JB100012 · 238872"
  detail?: string; // e.g. "ETA 5:42 PM"
  status: "pending" | "delivered" | "failed";
};
export type MapRun = { id: string; number: number; color: string; stops: MapStop[] };

const TILE_URL = "https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" style="height:20px;width:20px;display:inline"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
const SINGAPORE = L.latLngBounds([1.144, 103.535], [1.494, 104.102]);
const UNPLANNED_COLOR = "#7F7F7F";

// Colours come from the database (check-constrained to #RRGGBB); still only ever put a validated
// hex and a number into marker HTML.
const safeColor = (color: string) => (/^#[0-9A-Fa-f]{6}$/.test(color) ? color : UNPLANNED_COLOR);

function stopIcon(color: string, text: string, status: MapStop["status"]) {
  const fill = status === "pending" ? safeColor(color) : "#FFFFFF";
  const ink = status === "pending" ? "#FFFFFF" : status === "failed" ? "#B42318" : safeColor(color);
  const ring = status === "failed" ? "#B42318" : status === "delivered" ? safeColor(color) : "#FFFFFF";
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<span style="display:flex;width:26px;height:26px;align-items:center;justify-content:center;border-radius:9999px;background:${fill};color:${ink};border:2px solid ${ring};font:700 12px/1 var(--font-sans),sans-serif;box-sizing:border-box">${text}</span>`,
  });
}

const depotIcon = L.divIcon({
  className: "",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  html: '<img src="/images/logo.webp" alt="" style="width:40px;height:40px;border-radius:9999px;border:2px solid #fff;background:#fff;box-sizing:border-box"/>',
});

const markerText = (stop: MapStop) => (stop.status === "delivered" ? "✓" : stop.status === "failed" ? "!" : String(stop.seq));

/** Fit the map to the data when the slot or view changes, not on every live refresh. */
function FitBounds({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap();
  const latest = useRef(points);
  useEffect(() => {
    latest.current = points;
  });
  useEffect(() => {
    const pts = latest.current;
    if (pts.length > 0) map.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: 15 });
  }, [fitKey, map]);
  return null;
}

export function RouteMap({
  depot,
  depotName,
  runs,
  unplanned,
  selectedRunId,
  onSelectRun,
  dashed = false,
  fitKey,
}: {
  depot: LatLng;
  depotName: string;
  runs: MapRun[];
  unplanned: MapStop[];
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
  dashed?: boolean;
  fitKey: string;
}) {
  const points = useMemo<[number, number][]>(
    () => [
      [depot.lat, depot.lng],
      ...runs.flatMap((r) => r.stops.map((s): [number, number] => [s.lat, s.lng])),
      ...unplanned.map((s): [number, number] => [s.lat, s.lng]),
    ],
    [depot, runs, unplanned],
  );
  const opacity = (runId: string) => (selectedRunId === null || selectedRunId === runId ? 1 : 0.25);

  // With Cache Components, Next.js hides pages you navigate away from (React <Activity>) instead of
  // unmounting them. Hiding runs effect cleanups, so react-leaflet removes its Leaflet map, but it
  // never builds a new one when the page is shown again: markers then crash on the dead map. A new
  // key on every hide makes the page come back with a freshly created map.
  const [mapKey, setMapKey] = useState(0);
  useLayoutEffect(() => () => setMapKey((k) => k + 1), []);

  return (
    <MapContainer
      key={mapKey}
      bounds={SINGAPORE}
      maxBounds={SINGAPORE.pad(0.1)}
      minZoom={11}
      maxZoom={19}
      scrollWheelZoom
      className="h-full w-full bg-muted"
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} detectRetina />
      <FitBounds points={points} fitKey={fitKey} />

      {runs.map((run) => (
        <Polyline
          key={`line-${run.id}`}
          positions={[[depot.lat, depot.lng], ...run.stops.map((s): [number, number] => [s.lat, s.lng])]}
          pathOptions={{
            color: safeColor(run.color),
            weight: 4,
            opacity: 0.85 * opacity(run.id),
            dashArray: dashed ? "6 8" : undefined,
          }}
          eventHandlers={{ click: () => onSelectRun(run.id) }}
        />
      ))}

      {runs.flatMap((run) =>
        run.stops.map((stop) => (
          <Marker
            key={`${run.id}-${stop.id}`}
            position={[stop.lat, stop.lng]}
            icon={stopIcon(run.color, markerText(stop), stop.status)}
            opacity={opacity(run.id)}
            zIndexOffset={selectedRunId === run.id ? 1000 : 0}
            eventHandlers={{ click: () => onSelectRun(run.id) }}
          >
            <Tooltip direction="top" offset={[0, -12]}>
              <strong>
                Run {run.number} · stop {stop.seq}
              </strong>
              <br />
              {stop.label}
              {stop.detail && (
                <>
                  <br />
                  {stop.detail}
                </>
              )}
            </Tooltip>
          </Marker>
        )),
      )}

      {unplanned.map((stop) => (
        <Marker key={`unplanned-${stop.id}`} position={[stop.lat, stop.lng]} icon={stopIcon(UNPLANNED_COLOR, "?", "pending")}>
          <Tooltip direction="top" offset={[0, -12]}>
            <strong>Not planned</strong>
            <br />
            {stop.label}
          </Tooltip>
        </Marker>
      ))}

      <Marker position={[depot.lat, depot.lng]} icon={depotIcon} zIndexOffset={2000}>
        <Tooltip direction="top" offset={[0, -20]}>
          Kitchen: {depotName}
        </Tooltip>
      </Marker>
    </MapContainer>
  );
}
