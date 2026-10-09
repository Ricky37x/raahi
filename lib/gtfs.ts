
import "server-only";

import { parse } from "csv-parse/sync";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

export type GtfsStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
};

export type GtfsRoute = {
  route_id: string;
  route_short_name?: string;
  route_long_name?: string;
  route_type: string;
};

async function readGtfsFile<T>(
  mode: "bus" | "metro",
  filename: string
): Promise<T[]> {
  const filePath = path.join(DATA_DIR, mode, filename);

  const content = await readFile(filePath, "utf8");

  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }) as T[];
}

export async function loadStops(mode: "bus" | "metro") {
  return readGtfsFile<GtfsStop>(mode, "stops.txt");
}

export async function loadRoutes(mode: "bus" | "metro") {
  return readGtfsFile<GtfsRoute>(mode, "routes.txt");
}

export async function getGtfsSummary() {
  const [busStops, busRoutes, metroStops, metroRoutes] =
    await Promise.all([
      loadStops("bus"),
      loadRoutes("bus"),
      loadStops("metro"),
      loadRoutes("metro"),
    ]);

  return {
    bus: {
      stops: busStops.length,
      routes: busRoutes.length,
    },
    metro: {
      stops: metroStops.length,
      routes: metroRoutes.length,
    },
  };
}
