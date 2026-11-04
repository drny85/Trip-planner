"use client";

import "leaflet/dist/leaflet.css";
import type { Activity } from "@trip/backend/types";
import { getCategory } from "@trip/ui";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";

type Stop = Pick<Activity, "_id" | "title" | "address" | "category" | "startTime" | "isCompleted"> & { latitude: number; longitude: number };

/** Numbered pin built from HTML, so no marker image assets are needed. */
const pin = (n: number, color: string, done: boolean) =>
  L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
    html: `<div style="width:30px;height:30px;border-radius:9999px;display:grid;place-items:center;font:700 13px/1 system-ui;color:#fff;background:${done ? "#16a34a" : color};border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.25)">${done ? "✓" : n}</div>`,
  });

function FitBounds({ stops }: { stops: Stop[] }) {
  const map = useMap();
  const key = stops.map((s) => `${s.latitude},${s.longitude}`).join("|");
  useEffect(() => {
    if (stops.length === 0) return;
    const bounds = L.latLngBounds(stops.map((s) => [s.latitude, s.longitude]));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the stops change
  }, [map, key]);
  return null;
}

export default function DayMapLeaflet({ stops }: { stops: Stop[] }) {
  const first = stops[0]!;
  return (
    <MapContainer center={[first.latitude, first.longitude]} zoom={13} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Polyline positions={stops.map((s) => [s.latitude, s.longitude])} pathOptions={{ color: "#0e7c66", weight: 4, opacity: 0.7, dashArray: "6 8" }} />
      {stops.map((s, i) => (
        <Marker key={s._id} position={[s.latitude, s.longitude]} icon={pin(i + 1, getCategory(s.category).color, s.isCompleted)}>
          <Popup>
            <strong>{s.title}</strong>
            <br />
            {s.startTime ? `${s.startTime} · ` : ""}
            {s.address}
          </Popup>
        </Marker>
      ))}
      <FitBounds stops={stops} />
    </MapContainer>
  );
}

export type { Stop };
