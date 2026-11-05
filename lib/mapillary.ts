import { propertyAddress } from "./property-map";
import type { Property } from "./model";
type Point = [number, number];
export function distanceMeters(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad);
  const y = (b[1] - a[1]) * rad;
  return Math.hypot(x, y) * 6371000;
}
export function nearestCapture(images: any[], point: Point) {
  return images
    .map((i) => ({
      ...i,
      coords: i.computed_geometry?.coordinates ?? i.geometry?.coordinates,
    }))
    .filter(
      (i) =>
        /^\d+$/.test(i.id) &&
        Array.isArray(i.coords) &&
        i.coords.length === 2 &&
        i.coords.every(Number.isFinite),
    )
    .map((i) => ({ ...i, distance: distanceMeters(point, i.coords) }))
    .filter((i) => i.distance <= 60 && safeThumbnail(i.thumb_1024_url))
    .sort(
      (a, b) =>
        a.distance - b.distance || (b.captured_at ?? 0) - (a.captured_at ?? 0),
    )[0];
}
export function safeThumbnail(value: unknown) {
  try {
    const u = new URL(String(value));
    return (
      u.protocol === "https:" &&
      (u.hostname.endsWith(".fbcdn.net") ||
        u.hostname.endsWith(".mapillary.com"))
    );
  } catch {
    return false;
  }
}
export async function lookupMapillary(
  p: Property,
  token: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  if (!token)
    return {
      status: "setup_required",
      message:
        "Free Mapillary imagery is ready to connect. Your admin needs to add the workspace client token once. Satellite imagery is shown meanwhile.",
    };
  const query = new URLSearchParams({
    address: propertyAddress(p),
    benchmark: "Public_AR_Current",
    format: "json",
  });
  const geo = await fetcher(
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" +
      query,
    { signal: AbortSignal.timeout(12000) },
  );
  if (!geo.ok)
    return {
      status: "unavailable",
      message:
        "Address lookup is temporarily unavailable. Showing satellite imagery.",
    };
  const matches = (await geo.json()).result?.addressMatches;
  if (!Array.isArray(matches) || matches.length !== 1)
    return {
      status: "unavailable",
      message:
        "This address could not be matched uniquely. Check the full US property address. Showing satellite imagery.",
    };
  const coords = matches[0].coordinates;
  if (
    !Number.isFinite(coords?.x) ||
    !Number.isFinite(coords?.y) ||
    Math.abs(coords.x) > 180 ||
    Math.abs(coords.y) > 85
  )
    return {
      status: "unavailable",
      message:
        "No usable property coordinates were found. Showing satellite imagery.",
    };
  const point: Point = [coords.x, coords.y];
  const dx = 65 / (111320 * Math.cos((coords.y * Math.PI) / 180)),
    dy = 65 / 111320;
  const params = new URLSearchParams({
    bbox: [coords.x - dx, coords.y - dy, coords.x + dx, coords.y + dy].join(
      ",",
    ),
    fields: "id,geometry,computed_geometry,captured_at,thumb_1024_url,creator",
    limit: "100",
  });
  const response = await fetcher(
    "https://graph.mapillary.com/images?" + params,
    {
      headers: { Authorization: "OAuth " + token },
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    },
  );
  if (!response.ok)
    return {
      status:
        response.status === 401 || response.status === 403
          ? "configuration_error"
          : "unavailable",
      message:
        response.status === 401 || response.status === 403
          ? "The Mapillary client token needs checking. Showing satellite imagery."
          : "Mapillary is temporarily unavailable. Showing satellite imagery.",
    };
  const image = nearestCapture((await response.json()).data ?? [], point);
  if (!image)
    return {
      status: "unavailable",
      message:
        "No Mapillary street-level photo was found within 60 metres of this address. Showing satellite imagery.",
    };
  return {
    status: "ready",
    provider: "Mapillary",
    image: image.thumb_1024_url,
    link: "https://www.mapillary.com/app/?pKey=" + image.id + "&focus=photo",
    date: Number.isFinite(image.captured_at)
      ? new Date(image.captured_at).toISOString().slice(0, 10)
      : "",
    copyright:
      "Mapillary · " + (image.creator?.username || "Mapillary contributors"),
    distance: Math.round(image.distance),
    matchedAddress: matches[0].matchedAddress,
  };
}
