
import "server-only";

import { parse } from "csv-parse/sync";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type Mode = "bus" | "metro";

export type IndexedStop = {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
};

export type IndexedTrip = {
  tripId: string;
  routeId: string;
  mode: Mode;
  stops: IndexedStop[];
};

export type IndexedRoute = {
  routeId: string;
  shortName: string;
  longName: string;
  color: string;
  mode: Mode;
  stops: IndexedStop[];
  trips: IndexedTrip[];
};

type RawStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
};

type RawRoute = {
  route_id: string;
  route_short_name?: string;
  route_long_name?: string;
  route_color?: string;
};

type RawTrip = {
  route_id: string;
  trip_id: string;
};

type RawStopTime = {
  trip_id: string;
  stop_id: string;
  stop_sequence: string;
};

const DATA_DIR = path.join(process.cwd(), "data");

async function readCsv<T>(
  mode: Mode,
  filename: string
): Promise<T[]> {
  const filePath = path.join(DATA_DIR, mode, filename);
  const contents = await readFile(filePath, "utf8");

  return parse(contents, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
  }) as T[];
}

let indexPromise: Promise<IndexedRoute[]> | null = null;

export function getRouteIndex(): Promise<IndexedRoute[]> {
  if (!indexPromise) {
    indexPromise = buildRouteIndex().catch((error) => {
      indexPromise = null;
      throw error;
    });
  }

  return indexPromise;
}

async function buildRouteIndex(): Promise<IndexedRoute[]> {
  const result: IndexedRoute[] = [];

  for (const mode of ["bus", "metro"] as const) {
    const [rawStops, rawRoutes, rawTrips, rawStopTimes] =
      await Promise.all([
        readCsv<RawStop>(mode, "stops.txt"),
        readCsv<RawRoute>(mode, "routes.txt"),
        readCsv<RawTrip>(mode, "trips.txt"),
        readCsv<RawStopTime>(mode, "stop_times.txt"),
      ]);

    const stopMap = new Map<string, IndexedStop>();

    for (const stop of rawStops) {
      const lat = Number(stop.stop_lat);
      const lon = Number(stop.stop_lon);

      if (
        !stop.stop_id ||
        !stop.stop_name ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      ) {
        continue;
      }

      stopMap.set(stop.stop_id, {
        stopId: stop.stop_id,
        stopName: stop.stop_name,
        lat,
        lon,
      });
    }

    const routeMap = new Map(
      rawRoutes.map((route) => [route.route_id, route])
    );

    const tripMap = new Map(
      rawTrips.map((trip) => [trip.trip_id, trip])
    );

    const timesByTrip = new Map<string, RawStopTime[]>();

    for (const row of rawStopTimes) {
      if (!row.trip_id || !row.stop_id) continue;

      const rows = timesByTrip.get(row.trip_id) ?? [];
      rows.push(row);
      timesByTrip.set(row.trip_id, rows);
    }

    const tripsByRoute = new Map<string, IndexedTrip[]>();
    const stopsByRoute = new Map<string, Map<string, IndexedStop>>();

    for (const [tripId, rows] of timesByTrip) {
      const trip = tripMap.get(tripId);
      if (!trip || !routeMap.has(trip.route_id)) continue;

      const orderedStops = rows
        .map((row) => ({
          stop: stopMap.get(row.stop_id),
          sequence: Number(row.stop_sequence),
        }))
        .filter(
          (
            item
          ): item is { stop: IndexedStop; sequence: number } =>
            Boolean(item.stop) && Number.isFinite(item.sequence)
        )
        .sort((a, b) => a.sequence - b.sequence)
        .map((item) => item.stop);

      if (orderedStops.length < 2) continue;

      const indexedTrip: IndexedTrip = {
        tripId,
        routeId: trip.route_id,
        mode,
        stops: orderedStops,
      };

      const routeTrips = tripsByRoute.get(trip.route_id) ?? [];
      routeTrips.push(indexedTrip);
      tripsByRoute.set(trip.route_id, routeTrips);

      const routeStops =
        stopsByRoute.get(trip.route_id) ?? new Map<string, IndexedStop>();

      for (const stop of orderedStops) {
        routeStops.set(stop.stopId, stop);
      }

      stopsByRoute.set(trip.route_id, routeStops);
    }

    for (const [routeId, trips] of tripsByRoute) {
      const route = routeMap.get(routeId);
      if (!route) continue;

      result.push({
        routeId,
        shortName: route.route_short_name || routeId,
        longName: route.route_long_name || "",
        color: route.route_color
          ? `#${route.route_color}`
          : mode === "metro"
            ? "#64748b"
            : "#0d9488",
        mode,
        stops: [...(stopsByRoute.get(routeId)?.values() ?? [])],
        trips,
      });
    }
  }

  return result;
}
