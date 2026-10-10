
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
const MAX_TRANSFER_WALK_KM = 0.6;
const MAX_RESULTS = 8;
const MAX_SEGMENTS_PER_STOP = 120;

type Point = { lat: number; lon: number };

type Leg = {
  mode: "walk" | Mode;
  from: string;
  to: string;
  routeName?: string;
  routeId?: string;
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
  minutes: number;
  distanceKm: number;
};

function stopKey(stop: IndexedStop): string {
  return `${stop.mode}:${stop.stopId}`;
}

function routeKey(route: IndexedRoute): string {
  return `${route.mode}:${route.routeId}`;
}

function distanceKm(a: Point, b: Point): number {
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

function walkMinutes(km: number): number {
  return Math.ceil((km / WALK_SPEED) * 60);
}

function nearestStops(point: Point, stops: IndexedStop[]) {
  return stops
    .map((stop) => ({
      stop,
      distance: distanceKm(point, stop),
    }))
    .filter((item) => item.distance <= MAX_ACCESS_KM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 25);
}

function makeWalk(from: string, to: string, km: number): Leg {
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
    routeId: segment.route.routeId,
    minutes: segment.minutes,
    distanceKm: Number(segment.distanceKm.toFixed(2)),
  };
}

function finish(legs: Leg[], transfers: number): Journey {
  const walking = legs.filter((leg) => leg.mode === "walk");

  return {
    id: crypto.randomUUID(),
    totalMinutes: legs.reduce(
      (sum, leg) => sum + leg.minutes,
      0
    ),
    transfers,
    walkingMinutes: walking.reduce(
      (sum, leg) => sum + leg.minutes,
      0
    ),
    walkingDistanceKm: Number(
      walking
        .reduce((sum, leg) => sum + leg.distanceKm, 0)
        .toFixed(2)
    ),
    legs,
  };
}

function buildSegments(
  routes: IndexedRoute[],
  starts: IndexedStop[],
  ends: IndexedStop[]
): Segment[] {
  const startIds = new Set(starts.map(stopKey));
  const endIds = new Set(ends.map(stopKey));
  const bestSegments = new Map<string, Segment>();

  for (const route of routes) {
    for (const trip of route.trips) {
      const stops = trip.stops;
      const startIndexes: number[] = [];
      const endIndexes: number[] = [];

      stops.forEach((stop, index) => {
        if (startIds.has(stopKey(stop))) {
          startIndexes.push(index);
        }
        if (endIds.has(stopKey(stop))) {
          endIndexes.push(index);
        }
      });

      for (const fromIndex of startIndexes) {
        for (const toIndex of endIndexes) {
          if (toIndex <= fromIndex) continue;

          const from = stops[fromIndex];
          const to = stops[toIndex];

          let pathDistance = 0;

          for (let i = fromIndex + 1; i <= toIndex; i++) {
            pathDistance += distanceKm(stops[i - 1], stops[i]);
          }

          if (
            !Number.isFinite(pathDistance) ||
            pathDistance < 0.05
          ) {
            continue;
          }

          const distance = pathDistance * 1.25;
          const speed =
            route.mode === "metro" ? METRO_SPEED : BUS_SPEED;
          const intermediateStops = toIndex - fromIndex - 1;
          const minutes = Math.max(
            2,
            Math.ceil((distance / speed) * 60) +
              intermediateStops
          );

          const segment: Segment = {
            route,
            trip,
            from,
            to,
            minutes,
            distanceKm: distance,
          };

          const key = [
            routeKey(route),
            stopKey(from),
            stopKey(to),
          ].join(":");

          const previous = bestSegments.get(key);

          if (!previous || minutes < previous.minutes) {
            bestSegments.set(key, segment);
          }
        }
      }
    }
  }

  return [...bestSegments.values()];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function journeyKey(journey: Journey): string {
  return journey.legs
    .filter((leg) => leg.mode !== "walk")
    .map(
      (leg) =>
        `${leg.mode}:${leg.routeId ?? normalizeName(leg.routeName ?? "")}:${normalizeName(leg.from)}>${normalizeName(leg.to)}`
    )
    .join("|");
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

    // Preserve bus and metro stops even when their IDs overlap.
    const stopMap = new Map<string, IndexedStop>();

    for (const route of routes) {
      for (const stop of route.stops) {
        stopMap.set(stopKey(stop), stop);
      }
    }

    const allStops = [...stopMap.values()];
    const starts = nearestStops(origin, allStops);
    const ends = nearestStops(destination, allStops);

    if (!starts.length || !ends.length) {
      return NextResponse.json({
        success: true,
        source: "Local GTFS stop sequences with estimated travel times",
        estimatesOnly: true,
        journeys: [],
        message: "No transit stops found within 1.2 km of both locations.",
      });
    }

    const startStops = starts.map((item) => item.stop);
    const endStops = ends.map((item) => item.stop);

    const directSegments = buildSegments(
      routes,
      startStops,
      endStops
    );
    const firstSegments = buildSegments(
      routes,
      startStops,
      allStops
    );
    const secondSegments = buildSegments(
      routes,
      allStops,
      endStops
    );

    const startDistance = new Map(
      starts.map((item) => [stopKey(item.stop), item.distance])
    );
    const endDistance = new Map(
      ends.map((item) => [stopKey(item.stop), item.distance])
    );

    const journeys: Journey[] = [];

    // Direct transit journeys.
    for (const segment of directSegments) {
      const accessKm = startDistance.get(stopKey(segment.from));
      const egressKm = endDistance.get(stopKey(segment.to));

      if (accessKm === undefined || egressKm === undefined) {
        continue;
      }

      journeys.push(
        finish(
          [
            ...(accessKm > 0.02
              ? [makeWalk("Your location", segment.from.stopName, accessKm)]
              : []),
            makeRide(segment),
            ...(egressKm > 0.02
              ? [makeWalk(segment.to.stopName, "Your destination", egressKm)]
              : []),
          ],
          0
        )
      );
    }

    // Keep only the best segments per boarding/alighting stop.
    const firstByStop = new Map<string, Segment[]>();
    const secondByStop = new Map<string, Segment[]>();

    for (const segment of firstSegments) {
      const key = stopKey(segment.to);
      const list = firstByStop.get(key) ?? [];

      if (list.length < MAX_SEGMENTS_PER_STOP) {
        list.push(segment);
        firstByStop.set(key, list);
      }
    }

    for (const segment of secondSegments) {
      const key = stopKey(segment.from);
      const list = secondByStop.get(key) ?? [];

      if (list.length < MAX_SEGMENTS_PER_STOP) {
        list.push(segment);
        secondByStop.set(key, list);
      }
    }

    // Transfers can connect distinct stops, but only when they are nearby.
    let checkedTransfers = 0;
    const maxTransferCandidates = 30000;

    for (const [interchangeKey, firstList] of firstByStop) {
      const firstStop = firstList[0]?.to;
      if (!firstStop) continue;

      for (const [secondKey, secondList] of secondByStop) {
        if (interchangeKey === secondKey) {
          // Same physical stop identity in the same feed.
        }

        const secondStop = secondList[0]?.from;
        if (!secondStop) continue;

        const transferKm = distanceKm(firstStop, secondStop);
        if (transferKm > MAX_TRANSFER_WALK_KM) continue;

        for (const first of firstList) {
          for (const second of secondList) {
            if (checkedTransfers >= maxTransferCandidates) break;

            if (routeKey(first.route) === routeKey(second.route)) {
              continue;
            }

            if (stopKey(first.from) === stopKey(second.to)) {
              continue;
            }

            // Avoid duplicate same-mode transfers between unrelated lines
            // when their stops are merely close together.
            if (
              first.route.mode === second.route.mode &&
              transferKm > 0.15
            ) {
              continue;
            }

            const accessKm = startDistance.get(stopKey(first.from));
            const egressKm = endDistance.get(stopKey(second.to));

            if (accessKm === undefined || egressKm === undefined) {
              continue;
            }

            checkedTransfers++;

            const legs: Leg[] = [];

            if (accessKm > 0.02) {
              legs.push(
                makeWalk("Your location", first.from.stopName, accessKm)
              );
            }

            legs.push(makeRide(first));

            if (transferKm > 0.02) {
              legs.push(
                makeWalk(
                  first.to.stopName,
                  second.from.stopName,
                  transferKm
                )
              );
            }

            legs.push(makeRide(second));

            if (egressKm > 0.02) {
              legs.push(
                makeWalk(
                  second.to.stopName,
                  "Your destination",
                  egressKm
                )
              );
            }

            journeys.push(finish(legs, 1));
          }

          if (checkedTransfers >= maxTransferCandidates) break;
        }

        if (checkedTransfers >= maxTransferCandidates) break;
      }

      if (checkedTransfers >= maxTransferCandidates) break;
    }

    // Deduplicate journeys by their actual transit sequence.
    const unique = new Map<string, Journey>();

    for (const journey of journeys) {
      const key = journeyKey(journey);
      if (!key) continue;

      const previous = unique.get(key);

      if (!previous || journey.totalMinutes < previous.totalMinutes) {
        unique.set(key, journey);
      }
    }

    const candidates = [...unique.values()];

    const ranked = candidates.sort((a, b) => {
      if (preference === "transfers") {
        return (
          a.transfers - b.transfers ||
          a.totalMinutes - b.totalMinutes
        );
      }

      if (preference === "walking") {
        return (
          a.walkingDistanceKm - b.walkingDistanceKm ||
          a.totalMinutes - b.totalMinutes
        );
      }

      return a.totalMinutes - b.totalMinutes;
    });

    // Reserve room for a direct option when one exists.
    const directOptions = ranked.filter(
      (journey) => journey.transfers === 0
    );
    const transferOptions = ranked.filter(
      (journey) => journey.transfers > 0
    );

    const selected = [
      ...directOptions.slice(0, 2),
      ...transferOptions.slice(0, MAX_RESULTS),
    ]
      .sort((a, b) => {
        if (preference === "transfers") {
          return (
            a.transfers - b.transfers ||
            a.totalMinutes - b.totalMinutes
          );
        }

        if (preference === "walking") {
          return (
            a.walkingDistanceKm - b.walkingDistanceKm ||
            a.totalMinutes - b.totalMinutes
          );
        }

        return a.totalMinutes - b.totalMinutes;
      })
      .slice(0, MAX_RESULTS);

    return NextResponse.json({
      success: true,
      source: "Local GTFS stop sequences with estimated travel times",
      estimatesOnly: true,
      journeys: selected,
    });
  } catch (error) {
    console.error("Journey search failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Journey search failed. Check the server terminal.",
      },
      { status: 500 }
    );
  }
}
