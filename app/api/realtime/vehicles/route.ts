
import { NextResponse } from "next/server";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";


export async function GET() {
  const apiKey = process.env.DELHI_TRANSIT_API_KEY;
  const baseUrl =
    process.env.OTD_BASE_URL ?? "https://otd.delhi.gov.in";

  if (!apiKey) {
    return NextResponse.json(
      { error: "Transit API key is not configured." },
      { status: 500 }
    );
  }

  try {
    const url = new URL(
      "/api/realtime/VehiclePositions.pb",
      baseUrl
    );
    url.searchParams.set("key", apiKey);

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error("OTD feed returned status:", response.status);

      return NextResponse.json(
        { error: "Unable to retrieve live vehicle data." },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const feed =
      GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
        buffer
      );

    const vehicles = feed.entity.flatMap((entity) => {
      const vehicle = entity.vehicle;
      const position = vehicle?.position;

      if (
        !vehicle ||
        !position ||
        !Number.isFinite(position.latitude) ||
        !Number.isFinite(position.longitude) ||
        position.latitude < -90 ||
        position.latitude > 90 ||
        position.longitude < -180 ||
        position.longitude > 180
      ) {
        return [];
      }

      return [
        {
          id: vehicle.vehicle?.id || entity.id,
          routeId: vehicle.trip?.routeId ?? null,
          tripId: vehicle.trip?.tripId ?? null,
          latitude: position.latitude,
          longitude: position.longitude,
          bearing: position.bearing ?? null,
          speed: position.speed ?? null,
          timestamp: vehicle.timestamp
            ? Number(vehicle.timestamp)
            : null,
        },
      ];
    });

    return NextResponse.json(
      {
        source: "Delhi Open Transit Data",
        count: vehicles.length,
        fetchedAt: new Date().toISOString(),
        vehicles,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Live transit feed error:", error);

    return NextResponse.json(
      { error: "Could not process the live transit feed." },
      { status: 502 }
    );
  }
}
