
import { NextResponse } from "next/server";
import { getRouteIndex } from "@/lib/gtfs-index";

export async function GET() {
  try {
    const routes = await getRouteIndex();

    return NextResponse.json({
      success: true,
      totalRoutes: routes.length,
      busRoutes: routes.filter((route) => route.mode === "bus").length,
      metroRoutes: routes.filter((route) => route.mode === "metro").length,
      routes: routes.map((route) => ({
        routeId: route.routeId,
        name: route.longName || route.shortName,
        mode: route.mode,
        color: route.color,
        stopCount: route.stops.length,
      })),
    });
  } catch (error) {
    console.error("GTFS route indexing failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Could not index GTFS routes. Check the datasets and server logs.",
      },
      { status: 500 }
    );
  }
}
