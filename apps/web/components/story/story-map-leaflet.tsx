"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { dayColor, type RouteDay } from "./day-colors";

const pin = (label: string, color: string) =>
  L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -12],
    html: `<div style="width:28px;height:28px;border-radius:9999px;display:grid;place-items:center;font:700 11px/1 system-ui;color:#fff;background:${color};border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.25)">${label}</div>`,
  });

function FitBounds({ days }: { days: RouteDay[] }) {
  const map = useMap();
  const points = days.flatMap((d) => d.stops.map((s) => [s.latitude, s.longitude] as [number, number]));
  const key = points.join("|");
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the stops change
  }, [map, key]);
  return null;
}

/** The whole trip's route: each day's stops joined in order, a color per day. */
export default function StoryMapLeaflet({ days }: { days: RouteDay[] }) {
  const first = days.find((d) => d.stops.length)!.stops[0]!;
  return (
    <MapContainer center={[first.latitude, first.longitude]} zoom={12} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {days.map((d) => (
        <Polyline key={`line-${d.dayNumber}`} positions={d.stops.map((s) => [s.latitude, s.longitude])} pathOptions={{ color: dayColor(d.dayNumber), weight: 4, opacity: 0.75 }} />
      ))}
      {days.flatMap((d) =>
        d.stops.map((s, i) => (
          <Marker key={s._id} position={[s.latitude, s.longitude]} icon={pin(i === 0 ? `D${d.dayNumber}` : String(i + 1), dayColor(d.dayNumber))}>
            <Popup>
              <strong>{s.title}</strong>
              <br />
              Day {d.dayNumber} · {s.address}
            </Popup>
          </Marker>
        )),
      )}
      <FitBounds days={days} />
    </MapContainer>
  );
}
