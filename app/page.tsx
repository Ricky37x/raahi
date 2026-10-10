

"use client";



import { useState } from "react";

import {

  ArrowDownUp,

  ArrowRight,

  Bus,

  Clock3,

  Footprints,

  GitCompareArrows,

  LocateFixed,

  MapPin,

  Navigation,

  Search,

  TrainFront,

  Waypoints,

  Database,

  ChevronDown,

} from "lucide-react";
import {
  // Keep all your existing icons
  Maximize2,
  Minimize2,
} from "lucide-react";

import dynamic from "next/dynamic";

import { useTheme } from "next-themes";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";



const DelhiMap = dynamic(() => import("@/components/DelhiMap"), {

  ssr: false,

  loading: () => <div className="map-loading">Loading the map…</div>,

});



type Preference = "fastest" | "fare" | "transfers" | "walking";

type ModeFilter =
  | "all"
  | "metro"
  | "bus"
  | "walk-metro"
  | "walk-bus"
  | "bus-metro"
  | "walk";



type GeoResult = {

  id: number;

  name: string;

  lat: number;

  lon: number;

  type: string;

};



type JourneyLeg = {

  mode: "walk" | "bus" | "metro";

  from: { stopName: string } | string;

  to: { stopName: string } | string;

  minutes: number;

  distanceKm: number;

};



type Journey = {

  totalMinutes: number;

  transfers: number;

  legs: JourneyLeg[];

  [key: string]: unknown;

};



type JourneyResponse = {

  success: boolean;

  error?: string;

  source?: string;

  estimatesOnly?: boolean;

  journeys?: Journey[];

};





const cities = [

  { name: "Delhi", status: "Available", enabled: true },

  { name: "Mumbai", status: "Coming soon", enabled: false },

  { name: "Bengaluru", status: "Coming soon", enabled: false },

  { name: "Hyderabad", status: "Coming soon", enabled: false },

  { name: "Chennai", status: "Coming soon", enabled: false },

  { name: "Kolkata", status: "Coming soon", enabled: false },

  { name: "Pune", status: "Coming soon", enabled: false },

  { name: "Jaipur", status: "Coming soon", enabled: false },

];



export default function Home() {

  const [origin, setOrigin] = useState("");

  const [destination, setDestination] = useState("");

  const [preference, setPreference] = useState<Preference>("fastest");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");

  const [searched, setSearched] = useState(false);

  const [city, setCity] = useState("Delhi");

  const [cityChosen, setCityChosen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState<boolean>(false);



const [loading, setLoading] = useState(false);

const [searchError, setSearchError] = useState("");

const [journeys, setJourneys] = useState<Journey[]>([]);

const [journeySource, setJourneySource] = useState("");

const [originSelection, setOriginSelection] = useState<GeoResult | null>(null);

const [destinationSelection, setDestinationSelection] = useState<GeoResult | null>(null);



const [originSuggestions, setOriginSuggestions] = useState<GeoResult[]>([]);

const [destinationSuggestions, setDestinationSuggestions] = useState<GeoResult[]>([]);



const [locationLookup, setLocationLookup] = useState<

  "origin" | "destination" | null

>(null);





const { resolvedTheme, setTheme } = useTheme();

const theme = resolvedTheme === "light" ? "light" : "dark";

const filteredJourneys = journeys
  .filter((journey) => {
    const modes = new Set(journey.legs.map((leg) => leg.mode));
    const hasBus = modes.has("bus");
    const hasMetro = modes.has("metro");
    const hasWalk = modes.has("walk");

    switch (modeFilter) {
      case "metro":
        return hasMetro && !hasBus;
      case "bus":
        return hasBus && !hasMetro;
      case "walk-metro":
        return hasWalk && hasMetro && !hasBus;
      case "walk-bus":
        return hasWalk && hasBus && !hasMetro;
      case "bus-metro":
        return hasBus && hasMetro;
      case "walk":
        return hasWalk && !hasBus && !hasMetro;
      default:
        return true;
    }
  })
  .sort((a, b) => {
    if (preference === "transfers") {
      return a.transfers - b.transfers || a.totalMinutes - b.totalMinutes;
    }

    const walkingDistance = (journey: Journey) =>
      journey.legs
        .filter((leg) => leg.mode === "walk")
        .reduce((sum, leg) => sum + leg.distanceKm, 0);

    if (preference === "walking") {
      return walkingDistance(a) - walkingDistance(b) || a.totalMinutes - b.totalMinutes;
    }

    // Fare estimates are not yet provided by the API, so don't claim price-based ranking.
    return a.totalMinutes - b.totalMinutes;
  });



function handleThemeChange() {

  setTheme(theme === "dark" ? "light" : "dark");

}



async function findLocations(field: "origin" | "destination") {

  const query = field === "origin" ? origin.trim() : destination.trim();



  if (query.length < 2) {

    setSearchError("Enter at least 2 characters to find a location.");

    return;

  }



  setLocationLookup(field);

  setSearchError("");



  if (field === "origin") {

    setOriginSuggestions([]);

  } else {

    setDestinationSuggestions([]);

  }



  try {

    const response = await fetch(

      `/api/geocode?q=${encodeURIComponent(query)}`

    );

    const data = await response.json();



    if (!response.ok || !data.success) {

      throw new Error(

        data.error || "Could not look up this location."

      );

    }



    const results = (data.results ?? []) as GeoResult[];



    if (field === "origin") {

      setOriginSuggestions(results);

    } else {

      setDestinationSuggestions(results);

    }



    if (results.length === 0) {

      setSearchError(

        `No matching Delhi locations found for "${query}". Try a nearby landmark or metro station.`

      );

    }

  } catch (error) {

    setSearchError(

      error instanceof Error

        ? error.message

        : "Could not look up this location. Please try again."

    );

  } finally {

    setLocationLookup(null);

  }

}



function selectLocation(

  field: "origin" | "destination",

  result: GeoResult

) {

  const shortName = result.name.split(",").slice(0, 2).join(",").trim();



  if (field === "origin") {

    setOrigin(shortName);

    setOriginSelection(result);

    setOriginSuggestions([]);

  } else {

    setDestination(shortName);

    setDestinationSelection(result);

    setDestinationSuggestions([]);

  }



  setSearchError("");

  setSearched(false);

  setJourneys([]);

}





 function chooseCity(cityName: string) {

  setCity(cityName);

  setOrigin("");

  setDestination("");

  setOriginSelection(null);

setDestinationSelection(null);

setOriginSuggestions([]);

setDestinationSuggestions([]);

  setSearched(false);

  setCityChosen(true);

}





function swapLocations() {

  setOrigin(destination);

  setDestination(origin);



  setOriginSelection(destinationSelection);

  setDestinationSelection(originSelection);



  setOriginSuggestions([]);

  setDestinationSuggestions([]);



  setSearched(false);

  setJourneys([]);

  setSearchError("");

}









async function handleSearch(

  event: React.FormEvent<HTMLFormElement>

) {

  event.preventDefault();



  if (!origin.trim() || !destination.trim()) return;



  if (origin.trim().toLowerCase() === destination.trim().toLowerCase()) {

    setSearchError("Choose two different locations.");

    return;

  }



  if (!originSelection || !destinationSelection) {

    setSearchError(

      "Find matches and select a location for both starting point and destination."

    );

    return;

  }



  if (

    originSelection.lat === destinationSelection.lat &&

    originSelection.lon === destinationSelection.lon

  ) {

    setSearchError("Choose two different locations.");

    return;

  }



  setLoading(true);

  setSearched(false);

  setSearchError("");

  setJourneys([]);



  try {

    const params = new URLSearchParams({

      originLat: String(originSelection.lat),

      originLon: String(originSelection.lon),

      destinationLat: String(destinationSelection.lat),

      destinationLon: String(destinationSelection.lon),

      preference,

    });



    const response = await fetch(`/api/journey?${params.toString()}`);

    const data = (await response.json()) as JourneyResponse;



    if (!response.ok || !data.success) {

      throw new Error(data.error || "Could not calculate your journey.");

    }



    setJourneys(data.journeys ?? []);

    setJourneySource(data.source ?? "Local GTFS data");

    setSearched(true);

  } catch (error) {

    setSearchError(

      error instanceof Error

        ? error.message

        : "Something went wrong. Please try again."

    );

  } finally {

    setLoading(false);

  }

}





  return (

    <main className="app" data-theme={theme}>

      {!cityChosen ? (

        <div className="city-gate-overlay">

          <section className="city-gate" aria-label="Choose your city">

            <div className="city-gate-content">

              <div className="city-gate-top">

                <a

                  className="brand city-gate-brand"

                  href="/"

                  aria-label="Raahi home"

                >

                  <span className="brand-mark">

                    <Waypoints size={23} />

                  </span>

                  <span>

                    raahi<span className="brand-period">.</span>

                  </span>

                </a>



                <div className="city-gate-theme-toggle">

                  <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>

                  <AnimatedThemeToggler

  theme={theme}

  onThemeChange={handleThemeChange}

/>

                </div>

              </div>



              <div className="city-gate-eyebrow">

                <span className="" />



              </div>



              <h1>

                Choose your&#x20;

                <br />

                <span>Raah</span>

              </h1>



              <p className="city-gate-description">

                Choose your city to find a simpler way around. We&apos;re

                starting with Delhi, with more Indian cities on the way.

              </p>



              <div className="city-picker">

                <label htmlFor="landing-city">CHOOSE YOUR CITY</label>



                <div className="city-picker-select">

                  <MapPin size={20} />



                  <select

                    id="landing-city"

                    value={city}

                    onChange={(event) => setCity(event.target.value)}

                  >

                    {cities.map((item) => (

                      <option

                        key={item.name}

                        value={item.name}

                        disabled={!item.enabled}

                      >

                        {item.name} — {item.status}

                      </option>

                    ))}

                  </select>



                  <ChevronDown size={18} />

                </div>



                <p>

                  <span className="" />



                </p>



                <button

                  type="button"

                  className="city-continue-button"

                  onClick={() => {

                    const selected = cities.find(

                      (item) => item.name === city

                    );



                    if (selected?.enabled) chooseCity(city);

                  }}

                >

                  Explore {city} <ArrowRight size={18} />

                </button>

              </div>



              <div className="city-gate-footer">

                <span>MADE FOR INDIA</span>

                <span>DELHI AVAILABLE NOW</span>

              </div>

            </div>

          </section>

        </div>

      ) : (

        <>

          <header className="topbar">

            <a className="brand" href="/" aria-label="Raahi home">

              <span className="">

                <Waypoints size={23} />

              </span>

              <span>

                raahi<span className="brand-period">.</span>

              </span>

            </a>



            <div className="header-center">

              <span className="" />



            </div>



            <div className="header-actions">

              <label className="city-select-wrap">

                <MapPin size={15} />



                <select

                  aria-label="Choose city"

                  value={city}

                  onChange={(event) => {

                    if (event.target.value === "Delhi") {

                      chooseCity("Delhi");

                    }

                  }}

                >

                  {cities.map((item) => (

                    <option

                      key={item.name}

                      value={item.name}

                      disabled={!item.enabled}

                    >

                      {item.name} · {item.status}

                    </option>

                  ))}

                </select>



                <ChevronDown size={13} />

              </label>



              <div className="header-theme-toggle">

                <AnimatedThemeToggler

  theme={theme}

  onThemeChange={handleThemeChange}

/>

                <span>{theme === "dark" ? "" : ""}</span>

              </div>



              <a

                className="header-link"

                href="https://www.openstreetmap.org/"

                target="_blank"

                rel="noreferrer"

              >

                Explore map <ArrowRight size={14} />

              </a>

            </div>

          </header>



          <section className="hero">

            <div className="">

              <span />&#x20;

            </div>



            <h1>

              Getting there

              <br />

              <span>should feel easier.</span>

            </h1>



            <p className="hero-copy">

              Walking, buses, metro all part of the same journey.

              <br className="desktop-break" />



            </p>

          </section>



          <section className={`workspace ${searched ? "workspace-searched" : ""}`}>

            <aside className="planner">

              <div className="section-heading">

                <div>

                  <span className="micro-label">YOUR NEXT JOURNEY</span>

                  <h2>Where to?</h2>

                </div>

                <span className="">

                  <Navigation size={19} />

                </span>

              </div>



              <div className="planner-city">

                <MapPin size={15} />

                <span>Planning in</span>

                <strong>{city}, India</strong>

              </div>



              <form onSubmit={handleSearch}>

                <div className="location-fields">

                  <div className="location-symbols">

                    <span className="origin-symbol" />

                    <span className="location-connector" />

                    <span className="destination-symbol" />

                  </div>



                  <div className="location-inputs">



<div className="location-entry">

  <label className="location-field">

    <span>STARTING FROM</span>

    <input

      value={origin}

      onChange={(event) => {

        setOrigin(event.target.value);

        setOriginSelection(null);

        setOriginSuggestions([]);

        setSearched(false);

        setJourneys([]);

        setSearchError("");

      }}

      placeholder="e.g. Kashmere Gate"

      aria-label="Starting point"

      required

    />

  </label>



  <button

    className="location-search-button"

    type="button"

    onClick={() => findLocations("origin")}

    disabled={locationLookup !== null}

  >

    {locationLookup === "origin" ? "Finding locations..." : "Find matches"}

  </button>



  {originSuggestions.length > 0 && (

    <div className="location-suggestions">

      {originSuggestions.map((result) => (

        <button

          type="button"

          className="location-suggestion"

          key={result.id}

          onClick={() => selectLocation("origin", result)}

        >

          <MapPin size={15} />

          <span>{result.name}</span>

        </button>

      ))}

    </div>

  )}

</div>







<div className="location-entry">

  <label className="location-field">

    <span>HEADED TO</span>

    <input

      value={destination}

      onChange={(event) => {

        setDestination(event.target.value);

        setDestinationSelection(null);

        setDestinationSuggestions([]);

        setSearched(false);

        setJourneys([]);

        setSearchError("");

      }}

      placeholder="e.g. Connaught Place"

      aria-label="Destination"

      required

    />

  </label>



  <button

    className="location-search-button"

    type="button"

    onClick={() => findLocations("destination")}

    disabled={locationLookup !== null}

  >

    {locationLookup === "destination"

      ? "Finding locations..."

      : "Find matches"}

  </button>



  {destinationSuggestions.length > 0 && (

    <div className="location-suggestions">

      {destinationSuggestions.map((result) => (

        <button

          type="button"

          className="location-suggestion"

          key={result.id}

          onClick={() => selectLocation("destination", result)}

        >

          <MapPin size={15} />

          <span>{result.name}</span>

        </button>

      ))}

    </div>

  )}

</div>



                  </div>



                  <button

                    className="swap-button"

                    type="button"

                    onClick={swapLocations}

                    aria-label="Swap starting point and destination"

                  >

                    <ArrowDownUp size={16} />

                  </button>

                </div>



                <div className="preference-heading">

                  <span className="micro-label"></span>

                  <span className="preference-hint"></span>

                </div>



                <button

  className="search-button"

  type="submit"

  disabled={loading}

>

                  <Search size={17} />

                  {loading ? "Finding your route..." : "Find me a route"}

                  <ArrowRight size={17} />

                </button>

              </form>





{searched ? (

  <div className="feedback-panel" aria-live="polite">

    <div className="feedback-icon">

      <Waypoints size={19} />

    </div>

    <div>

      <strong>

        {journeys.length > 0

          ? `${journeys.length} journey options found`

          : "No suitable journeys found"}

      </strong>

      <p>{origin.trim()} → {destination.trim()}</p>

      <p className="feedback-note">

        Preference:{" "}

        {preference === "fastest"

          ? "get there sooner"

          : preference === "transfers"

            ? "change less often"

            : "keep walking to a minimum"}

        . Times are estimates, not live timetable predictions.

      </p>

    </div>

  </div>

) : (

  <div className="planner-note">

    <span className="note-icon">

      <MapPin size={15} />

    </span>

    <p>

      Pick your start and end points. We&apos;ll bring different

      ways of getting there together.

    </p>

  </div>

)}



{searchError && (

  <div className="feedback-panel" role="alert">

    <div>

      <strong>Couldn&apos;t plan this journey</strong>

      <p>{searchError}</p>

    </div>

  </div>

)}









              <div className="mode-section">

                <span className="micro-label">

                  ONE JOURNEY, DIFFERENT WAYS

                </span>



                <div className="mode-list">

                  <div className="mode-item">

                    <span className="mode-icon walk">

                      <Footprints size={17} />

                    </span>

                    <div>

                      <strong>On foot</strong>

                      <small>To and from your stops</small>

                    </div>

                  </div>



                  <div className="mode-item">

                    <span className="mode-icon metro">

                      <TrainFront size={17} />

                    </span>

                    <div>

                      <strong>Metro</strong>

                      <small>For the longer stretches</small>

                    </div>

                  </div>



                  <div className="mode-item">

                    <span className="mode-icon bus">

                      <Bus size={17} />

                    </span>

                    <div>

                      <strong>Bus</strong>

                      <small>For the stops in between</small>

                    </div>

                  </div>

                </div>

              </div>



              <div className="data-note">

                <span className="data-note-icon">i</span>

                <p>

                  Delhi is the only supported city currently. Route

                  calculations and live arrival times are still being

                  developed.

                </p>

              </div>

            </aside>



            <div className="journey-results-area">
              <div className="journey-results-area"></div>

{searched && journeys.length > 0 && (
  <section className="journey-controls" aria-label="Filter and sort journeys">
    <div className="journey-controls-heading">
      <div>
        <span className="micro-label">YOUR OPTIONS</span>
        <strong>
          {filteredJourneys.length}{" "}
          {filteredJourneys.length === 1 ? "journey" : "journeys"}
        </strong>
      </div>
      <label className="journey-sort">
        <span>Sort by</span>
        <select
          value={preference}
          onChange={(event) => setPreference(event.target.value as Preference)}
        >
          <option value="fastest">Fastest</option>
          <option value="fare" disabled>Lowest fare (coming soon)</option>
          <option value="transfers">Fewest transfers</option>
          <option value="walking">Least walking</option>
        </select>
      </label>
    </div>

    <div className="journey-filter-section">
      <span className="journey-filter-label">TRANSPORT MODES</span>
      <div className="journey-mode-filters">
        {([
          ["all", "All modes"],
          ["metro", "Metro"],
          ["bus", "Bus"],
          ["walk-metro", "Walk + Metro"],
          ["walk-bus", "Walk + Bus"],
          ["bus-metro", "Bus + Metro"],
          ["walk", "Walk only"],
        ] as [ModeFilter, string][]).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`journey-filter ${modeFilter === value ? "selected" : ""}`}
            aria-pressed={modeFilter === value}
            onClick={() => setModeFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  </section>
)}

{filteredJourneys.map((journey, index) => (

  <article className="feedback-panel" key={`${index}-${journey.totalMinutes}`}>

    <div className="feedback-icon">

      <Navigation size={19} />

    </div>

    <div>

      <strong>Option {index + 1}</strong>

      <p>

        <Clock3 size={14} /> {journey.totalMinutes} min

        {" · "}

        {journey.transfers} transfers

      </p>



      {journey.legs.map((leg, legIndex) => {

        const from =

          typeof leg.from === "string"

            ? leg.from

            : leg.from.stopName;

        const to =

          typeof leg.to === "string"

            ? leg.to

            : leg.to.stopName;



        const ModeIcon =

          leg.mode === "metro"

            ? TrainFront

            : leg.mode === "bus"

              ? Bus

              : Footprints;



        return (

          <div key={`${legIndex}-${from}-${to}`}>

            <p>

              <ModeIcon size={14} />{" "}

              {leg.mode === "metro"

                ? "Metro"

                : leg.mode === "bus"

                  ? "Bus"

                  : "Walk"}

              {" · "}

              {leg.minutes} min

            </p>

            <p className="feedback-note">

              {from} → {to}

            </p>

          </div>

        );

      })}

    </div>

  </article>

))}



{searched && (

  <p className="feedback-note">

    Source: {journeySource || "Local GTFS data"}. Route and travel

    times are estimates; service availability is not verified.

  </p>

)}

            </div>



            <section
              className={`map-panel ${mapExpanded ? "map-expanded" : "map-compact"}`}
              aria-label={`Map of ${city}`}
            >

              <div className="map-toolbar">

                <div className="map-title">

                  <span className="map-title-icon">

                    <MapPin size={16} />

                  </span>

                  <div>

                    <strong>{city}, India</strong>

                    <small>Start exploring the city</small>

                  </div>

                </div>

                <button
                  className="map-expand-button"
                  type="button"
                  onClick={() => setMapExpanded((expanded) => !expanded)}
                  aria-expanded={mapExpanded}
                  aria-label={mapExpanded ? "Collapse map" : "Expand map"}
                >
                  {mapExpanded ? (
                    <>
                      <Minimize2 size={14} />
                      <span>Collapse map</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 size={14} />
                      <span>Expand map</span>
                    </>
                  )}
                </button>

              </div>



              <DelhiMap />



              <div className="map-footer">

                <div className="map-legend">

                  <span>

                    <i className="legend-walk" /> Walking

                  </span>

                  <span>

                    <i className="legend-metro" /> Metro

                  </span>

                  <span>

                    <i className="legend-bus" /> Bus

                  </span>

                </div>



                <button

                  className="locate-button"

                  type="button"

                  onClick={() =>

                    window.open(

                      "https://www.openstreetmap.org/#map=11/28.6139/77.2090",

                      "_blank",

                      "noopener,noreferrer"

                    )

                  }

                >

                  <LocateFixed size={15} /> Open map

                </button>

              </div>

            </section>

          </section>



          <section className="network-section" id="metro-network">

            <div className="network-heading">

              <div>

                <span className="micro-label">THE EXPLORE NETWORK</span>

                <h2>One city. Many ways through.</h2>

                <p>



                </p>

              </div>

              <span className="network-heading-icon">

                <TrainFront size={24} />

              </span>

            </div>



            <div className="network-grid">

              <article className="network-card">

                <div className="network-card-top">

                  <span className="network-card-icon metro">

                    <TrainFront size={20} />

                  </span>

                  <span className="network-status"></span>

                </div>

                <h3>Delhi Metro</h3>

                <p>

                  Explore metro lines, stations and interchange points on an

                  interactive network map.

                </p>

                <div className="network-preview metro-preview">

                  <div className="preview-line preview-red" />

                  <div className="preview-line preview-yellow" />

                  <div className="preview-line preview-blue" />

                  <div className="preview-caption">

                    <Database size={14} />

                    Real route data coming next

                  </div>

                </div>

                <a className="network-link" href="#metro-network">

                  Metro network <ArrowRight size={15} />

                </a>

              </article>



              <article className="network-card" id="bus-network">

                <div className="network-card-top">

                  <span className="network-card-icon bus">

                    <Bus size={20} />

                  </span>

                  <span className="network-status">IN DEVELOPMENT</span>

                </div>

                <h3>Delhi Bus Network</h3>

                <p>

                  Discover bus routes and stops, and see how buses can connect

                  with metro stations and walking routes.

                </p>

                <div className="network-preview bus-preview">

                  <div className="bus-stop-row">

                    <span />

                    <i />

                    <span />

                    <i />

                    <span />

                    <i />

                    <span />

                  </div>

                  <div className="preview-caption">

                    <Database size={14} />

                    Real route data coming next

                  </div>

                </div>

                <a className="network-link" href="#bus-network">

                  Bus network <ArrowRight size={15} />

                </a>

              </article>

            </div>



            <div className="network-data-note">

              <span className="data-note-icon">i</span>

              <p>



              </p>

            </div>

          </section>



          <section className="cities-section">

            <div className="cities-copy">

              <span className="micro-label"></span>

              <h2>More cities. One simpler way to travel.</h2>

              <p>



              </p>

            </div>



            <div className="cities-list">

              {cities.map((item) => (

                <div

                  className={`city-item ${

                    item.enabled ? "city-available" : "city-coming"

                  }`}

                  key={item.name}

                >

                  <span className="city-item-pin">

                    <MapPin size={15} />

                  </span>

                  <span className="city-item-name">{item.name}</span>

                  <span className="city-item-status">

                    {item.enabled ? "Available" : "Coming soon"}

                  </span>

                </div>

              ))}

            </div>

          </section>



          <footer className="footer">

            <a className="footer-brand" href="/">

              raahi<span>.</span>

            </a>

            <p></p>

            <span>Jai Modi</span>

          </footer>

        </>

      )}

    </main>

  );

}
