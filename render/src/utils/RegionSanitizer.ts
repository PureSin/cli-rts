/**
 * Sanitize region labels for display.
 * Regions are now clean directory paths, so this is mostly a pass-through
 * with fallback handling for legacy or unexpected IDs.
 */
export function sanitizeRegionLabel(regionId: string): string {
  if (!regionId || regionId === "base") return "root";
  if (regionId === "external") return "external";

  // For directory paths, return just the last segment
  const parts = regionId.split("/");
  const last = parts[parts.length - 1];
  return last.length > 20 ? last.slice(0, 19) + "\u2026" : last;
}
