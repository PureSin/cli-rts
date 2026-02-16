const cache = new Map<string, string>();

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "\u2026";
}

export function sanitizeRegionLabel(regionId: string): string {
  const cached = cache.get(regionId);
  if (cached) return cached;

  let label: string;

  if (regionId === "base" || regionId === "external") {
    label = regionId;
  } else if (regionId.startsWith("{")) {
    // JSON blob — try to extract description field
    const descMatch = regionId.match(/"description"\s*:\s*"([^"]+)"/);
    label = descMatch ? truncate(descMatch[1], 20) : "task";
  } else if (/[|>&;]/.test(regionId) || /^(cd |gh |git |npm |curl |echo )/.test(regionId)) {
    // Shell command — take first meaningful token
    const first = regionId.split(/\s/)[0];
    label = truncate("cmd:" + first, 20);
  } else {
    // Clean path
    label = truncate(regionId, 20);
  }

  cache.set(regionId, label);
  return label;
}
