import type { Property } from "./model";
export function propertyAddress(p: Property) {
  return [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
}
export function googleEmbed(value: string) {
  if (!value) return "";
  const src = value.match(/src=["']([^"']+)["']/i)?.[1] ?? value.trim();
  try {
    const u = new URL(src.replaceAll("&amp;", "&"));
    if (
      u.protocol === "https:" &&
      ["www.google.com", "maps.google.com"].includes(u.hostname) &&
      u.pathname === "/maps/embed" &&
      u.searchParams.has("pb")
    )
      return u.href;
  } catch {}
  throw new Error(
    "Paste the Google Maps Share → Embed a map iframe or its https://www.google.com/maps/embed?pb= URL.",
  );
}
