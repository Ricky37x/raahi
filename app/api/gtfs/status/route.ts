
import { NextResponse } from "next/server";
import { getGtfsSummary } from "@/lib/gtfs";

export async function GET() {
  try {
    const summary = await getGtfsSummary();
    return NextResponse.json({
      success: true,
      source: "Local GTFS datasets",
      ...summary,
    });
  } catch (error) {
    console.error("GTFS loading failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Could not load GTFS files. Check the data folder structure.",
      },
      { status: 500 }
    );
  }
}
