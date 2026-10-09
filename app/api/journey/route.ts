
import { NextRequest, NextResponse } from "next/server";
import {
  getRouteIndex,
  type IndexedStop,
  type IndexedRoute,
  type IndexedTrip,
  type Mode,
} from "@/lib/gtfs-index";

const WALK_SPEED = 4.5;
const BUS_SPEED = 20;
const METRO_SPEED = 32;
const MAX_ACCESS_KM = 1.2;
const MAX_TRANSFER_KM = 0.6;
const MAX_RESULTS = 8;
const MAX_SEGMENTS_PER_STOP = 120;

type Point = { lat: number; lon: number };

type Leg = {
  mode: "walk" | Mode;
  from: string;
  to: string;
  routeName?: string;
  minutes: number;
  distanceKm: number;
};

type Journey = {
  id: string;
  totalMinutes: number;
  transfers: number;
  walkingMinutes: number;
  walkingDistanceKm: number;
  legs: Leg[];
};

type Segment = {
  route: IndexedRoute;
  trip: IndexedTrip;
  from: IndexedStop;
  to: IndexedStop;
  fromIndex: number;
  toIndex: number;
  minutes: number;
  distanceKm: number;
};

function distanceKm(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(dLon / 2) ** 2;

  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function walkMinutes(km: number) {
  return Math.ceil((km / WALK_SPEED) * 60);
}

function nearestStops(point: Point, stops: IndexedStop[]) {
  return stops
    .map((stop) => ({ stop, distance: distanceKm(point, stop) }))
    .filter((item) => item.distance <= MAX_ACCESS_KM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);
}

function makeWalk(
  from: string,
  to: string,
  km: number
): Leg {
  return {
    mode: "walk",
    from,
    to,
    minutes: walkMinutes(km),
    distanceKm: Number(km.toFixed(2)),
  };
}

function makeRide(segment: Segment): Leg {
  return {
    mode: segment.route.mode,
    from: segment.from.stopName,
    to: segment.to.stopName,
    routeName:
      segment.route.longName || segment.route.shortName,
    minutes: segment.minutes,
    distanceKm: Number(segment.distanceKm.toFixed(2)),
  };
}

function finish(legs: Leg[], transfers: number): Journey {
  const walking = legs.filter((leg) => leg.mode === "walk");

  return {
    id: crypto.randomUUID(),
    totalMinutes: legs.reduce((sum, leg) => sum + leg.minutes, 0),
    transfers,
    walkingMinutes: walking.reduce((sum, leg) => sum + leg.minutes, 0),
    walkingDistanceKm: Number(
      walking.reduce((sum, leg) => sum + leg.distanceKm, 0).toFixed(2)
    ),
    legs,
  };
}

function buildSegments(
  routes: IndexedRoute[],
  starts: IndexedStop[],
  ends: IndexedStop[]
) {
  const startIds = new Set(starts.map((stop) => stop.stopId));
  const endIds = new Set(ends.map((stop) => stop.stopId));
  const segments: Segment[] = [];
  const seen = new Set<string>();

  for (const route of routes) {
    for (const trip of route.trips) {
      const stops = trip.stops;
      const startIndexes: number[] = [];
      const endIndexes: number[] = [];

      stops.forEach((stop, index) => {
        if (startIds.has(stop.stopId)) startIndexes.push(index);
        if (endIds.has(stop.stopId)) endIndexes.push(index);
      });

      for (const fromIndex of startIndexes) {
        for (const toIndex of endIndexes) {
          // A trip can only travel forward in its own stop sequence.
          if (toIndex <= fromIndex) continue;

          const from = stops[fromIndex];
          const to = stops[toIndex];
          const key = `${route.routeId}:${from.stopId}:${to.stopId}`;

          if (seen.has(key)) continue;
          seen.add(key);

          const straightDistance = distanceKm(from, to);
          const distance = straightDistance * 1.25;
          const speed =
            route.mode === "metro" ? METRO_SPEED : BUS_SPEED;

          segments.push({
            route,
            trip,
            from,
            to,
            fromIndex,
            toIndex,
            distanceKm: distance,
            // Includes a small allowance for stops and acceleration.
            minutes: Math.max(
              2,
              Math.ceil((distance / speed) * 60) +
                Math.max(0, toIndex - fromIndex - 1)
            ),
          });
        }
      }
    }
  }

  return segments;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const values = [
    Number(params.get("originLat")),
    Number(params.get("originLon")),
    Number(params.get("destinationLat")),
    Number(params.get("destinationLon")),
  ];

  const preference = params.get("preference") ?? "fastest";

  if (
    values.some((value) => !Number.isFinite(value)) ||
    Math.abs(values[0]) > 90 ||
    Math.abs(values[2]) > 90 ||
    Math.abs(values[1]) > 180 ||
    Math.abs(values[3]) > 180 ||
    !["fastest", "transfers", "walking"].includes(preference)
  ) {
    return NextResponse.json(
      { success: false, error: "Invalid coordinates or preference." },
      { status: 400 }
    );
  }

  try {
    const routes = await getRouteIndex();
    const origin = { lat: values[0], lon: values[1] };
    const destination = { lat: values[2], lon: values[3] };

    const stopMap = new Map<string, IndexedStop>();

    for (const route of routes) {
      for (const stop of route.stops) {
        stopMap.set(stop.stopId, stop);
      }
    }

    const allStops = [...stopMap.values()];
    const starts = nearestStops(origin, allStops);
    const ends = nearestStops(destination, allStops);

    if (!starts.length || !ends.length) {
      return NextResponse.json({
        success: true,
        estimatesOnly: true,
        journeys: [],
        message: "No transit stops found within 1.2 km of both locations.",
      });
    }

    const startStops = starts.map((item) => item.stop);
    const endStops = ends.map((item) => item.stop);

    const directSegments = buildSegments(routes, startStops, endStops);

    // Build candidate first and second legs around potential interchange stops.
    const firstSegments = buildSegments(routes, startStops, allStops);
    const secondSegments = buildSegments(routes, allStops, endStops);

    const journeys: Journey[] = [];

    for (const segment of directSegments) {
      const start = starts.find(
        (item) => item.stop.stopId === segment.from.stopId
      )!;
      const end = ends.find(
        (item) => item.stop.stopId === segment.to.stopId
      )!;

      journeys.push(
        finish(
          [
            makeWalk("Your location", segment.from.stopName, start.distance),
            makeRide(segment),
            makeWalk(segment.to.stopName, "Your destination", end.distance),
          ],
          0
        )
      );
    }

    const firstByStop = new Map<string, Segment[]>();
    const secondByStop = new Map<string, Segment[]>();

    for (const segment of firstSegments) {
      const list = firstByStop.get(segment.to.stopId) ?? [];
      if (list.length < MAX_SEGMENTS_PER_STOP) {
        list.push(segment);
        firstByStop.set(segment.to.stopId, list);
      }
    }

    for (const segment of secondSegments) {
      const list = secondByStop.get(segment.from.stopId) ?? [];
      if (list.length < MAX_SEGMENTS_PER_STOP) {
        list.push(segment);
        secondByStop.set(segment.from.stopId, list);
      }
    }

    const startDistance = new Map(
      starts.map((item) => [item.stop.stopId, item.distance])
    );
    const endDistance = new Map(
      ends.map((item) => [item.stop.stopId, item.distance])
    );

    let transferCount = 0;
    const maxTransferCandidates = 15000;

    for (const [interchangeId, firstList] of firstByStop) {
      const secondList = secondByStop.get(interchangeId);
      if (!secondList) continue;

      for (const first of firstList) {
        for (const second of secondList) {
          if (transferCount >= maxTransferCandidates) break;
          if (first.route.routeId === second.route.routeId) continue;
          if (first.to.stopId !== second.from.stopId) continue;
          if (first.from.stopId === second.to.stopId) continue;

          transferCount++;

          const accessKm = startDistance.get(first.from.stopId);
          const egressKm = endDistance.get(second.to.stopId);
          if (accessKm === undefined || egressKm === undefined) continue;

          const legs: Leg[] = [
            makeWalk("Your location", first.from.stopName, accessKm),
            makeRide(first),
            makeRide(second),
            makeWalk(second.to.stopName, "Your destination", egressKm),
          ];

          // Account for changing services without claiming exact connection times.
         

          journeys.push(finish(legs, 1));
        }

        if (transferCount >= maxTransferCandidates) break;
      }

      if (transferCount >= maxTransferCandidates) break;
    }

    // Deduplicate route/stop combinations, retaining the shortest estimate.
    const unique = new Map<string, Journey>();

    for (const journey of journeys) {
      const key = journey.legs
        .filter((leg) => leg.mode !== "walk")
        .map((leg) => `${leg.mode}:${leg.routeName}:${leg.from}:${leg.to}`)
        .join("|");

      if (!key) continue;

      const previous = unique.get(key);
      if (!previous || journey.totalMinutes < previous.totalMinutes) {
        unique.set(key, journey);
      }
    }

    const ranked = [...unique.values()].sort((a, b) => {
      if (preference === "transfers") {
        return a.transfers - b.transfers || a.totalMinutes - b.totalMinutes;
      }

      if (preference === "walking") {
        return (
          a.walkingDistanceKm - b.walkingDistanceKm ||
          a.totalMinutes - b.totalMinutes
        );
      }

      return a.totalMinutes - b.totalMinutes;
    });

    return NextResponse.json({
      success: true,
      source: "Local GTFS stop sequences with estimated travel times",
      estimatesOnly: true,
      journeys: ranked.slice(0, MAX_RESULTS),
    });
  } catch (error) {
    console.error("Journey search failed:", error);

    return NextResponse.json(
      { success: false, error: "Journey search failed. Check the server terminal." },
      { status: 500 }
    );
  }
}
