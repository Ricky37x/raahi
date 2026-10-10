

"use client";

import { useEffect, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  ZoomControl,
  Marker,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

type LiveVehicle = {
  id: string;
  routeId: string | null;
  tripId: string | null;
  latitude: number;
  longitude: number;
  bearing: number | null;
  speed: number | null;
  timestamp: number | null;
};

type VehicleResponse = {
  count: number;
  fetchedAt: string;
  vehicles: LiveVehicle[];
  error?: string;
};

const busIcon = L.divIcon({
  className: "live-bus-icon-wrapper",
  html: '<div class="live-bus-marker" title="Live bus">🚌</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

export default function DelhiMap() {
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [feedStatus, setFeedStatus] = useState<
    "loading" | "live" | "error"
  >("loading");

  useEffect(() => {
    let active = true;

    async function loadVehicles() {
      try {
        const response = await fetch("/api/realtime/vehicles", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Vehicle feed request failed");
        }

        const data: VehicleResponse = await response.json();

        if (!active) return;

        setVehicles(data.vehicles ?? []);
        setLastUpdated(data.fetchedAt ?? new Date().toISOString());
        setFeedStatus("live");
      } catch {
        if (active) setFeedStatus("error");
      }
    }

    void loadVehicles();

    const interval = window.setInterval(() => {
      void loadVehicles();
    }, 30_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="map-shell">
      <MapContainer
        center={[28.6139, 77.209]}
        zoom={11}
        zoomControl={false}
        scrollWheelZoom={true}
        className="delhi-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {vehicles.map((vehicle) => (
          <Marker
            key={vehicle.id}
            position={[vehicle.latitude, vehicle.longitude]}
            icon={busIcon}
          >
            <Popup>
              <div className="vehicle-popup">
                <strong>Delhi bus</strong>
                <p>
                  Route: {vehicle.routeId ?? "Not provided"}
                </p>
                <p>
                  Vehicle: {vehicle.id}
                </p>
                {vehicle.speed != null && (
                  <p>
                    Speed: {(vehicle.speed * 3.6).toFixed(1)} km/h
                  </p>
                )}
                {vehicle.bearing != null && (
                  <p>Bearing: {Math.round(vehicle.bearing)}°</p>
                )}
                {vehicle.timestamp != null && (
                  <p>
                    Position time:{" "}
                    {new Date(vehicle.timestamp * 1000).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        <ZoomControl position="bottomright" />
      </MapContainer>

      <div className="map-location-label">
        <span className="live-dot" />
        DELHI NCR
      </div>

      <div className="map-live-status">
        <span
          className={`map-feed-indicator ${feedStatus}`}
        />
        {feedStatus === "loading"
          ? "Loading live buses…"
          : feedStatus === "error"
            ? "Live feed unavailable"
            : `${vehicles.length} buses received`}
        {feedStatus === "live" && lastUpdated && (
          <span className="map-feed-time">
            · Updated {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="map-attribution-note">
        Live vehicle feed · OpenStreetMap
      </div>
    </div>
  );
}
