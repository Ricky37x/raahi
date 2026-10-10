
import { NextRequest, NextResponse } from "next/server";

type GeocodingResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json(
      { success: false, error: "Enter at least 2 characters.", results: [] },
      { status: 400 }
    );
  }

  if (query.length > 120) {
    return NextResponse.json(
      { success: false, error: "Search text is too long.", results: [] },
      { status: 400 }
    );
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");

    url.searchParams.set("q", `${query}, Delhi, India`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "in");
    url.searchParams.set("viewbox", "76.84,28.88,77.45,28.40");
    url.searchParams.set("bounded", "1");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url, {
      headers: {
        "User-Agent": "RaahiJourneyPlanner/1.0",
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: "Location service is temporarily unavailable.", results: [] },
        { status: 502 }
      );
    }

    const data = (await response.json()) as GeocodingResult[];

    const results = data.map((place) => ({
      id: place.place_id,
      name: place.display_name,
      lat: Number(place.lat),
      lon: Number(place.lon),
      type: place.type,
    }));

    return NextResponse.json({ success: true, results });
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not look up locations. Please try again.", results: [] },
      { status: 502 }
    );
  }
}
