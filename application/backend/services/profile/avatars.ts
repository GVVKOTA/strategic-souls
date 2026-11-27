export type AvatarCollectionId =
  | "orbit"
  | "markets"
  | "nature"
  | "geometry"
  | "personas"
  | "minimal";

export type AvatarPreset = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly collection: AvatarCollectionId;
  readonly collectionLabel: string;
  readonly assetPath: string;
  readonly description: string;
};

export const AVATAR_COLLECTIONS: readonly {
  readonly id: "all" | AvatarCollectionId;
  readonly label: string;
}[] = Object.freeze([
  { id: "all", label: "All" },
  { id: "orbit", label: "Orbit" },
  { id: "markets", label: "Markets" },
  { id: "nature", label: "Nature" },
  { id: "geometry", label: "Geometry" },
  { id: "personas", label: "Personas" },
  { id: "minimal", label: "Minimalist" },
]);

export const AVATAR_CATALOG: readonly AvatarPreset[] = Object.freeze([
  // Collection A: Orbit & Space (10)
  { id: "a01", code: "A01", name: "Silver Eclipse", collection: "orbit", collectionLabel: "Orbit & Space", assetPath: "/avatars/a01.svg", description: "Luminous silver crescent eclipse framed by a hairline orbital ring." },
  { id: "a02", code: "A02", name: "Earth Horizon", collection: "orbit", collectionLabel: "Orbit & Space", assetPath: "/avatars/a02.svg", description: "Curved blue planetary limb rising into dark orbital space." },
  { id: "a03", code: "A03", name: "Lunar Halo", collection: "orbit", collectionLabel: "Orbit & Space", assetPath: "/avatars/a03.svg", description: "Cratered silver moon enclosed by twin concentric halo rings." },
  { id: "a04", code: "A04", name: "Polaris", collection: "orbit", collectionLabel: "Orbit & Space", assetPath: "/avatars/a04.svg", description: "Eight-point celestial North Star inside a calibrated compass ring." },
  { id: "a05", code: "A05", name: "Nebula Arc", collection: "orbit", collectionLabel: "Orbit & Space", assetPath: "/avatars/a05.svg", description: "Sweeping indigo and ice-blue nebula ribbons across deep space." },
  { id: "a06", code: "A06", name: "Stellar Ring", collection: "orbit", collectionLabel: "Orbit & Space", assetPath: "/avatars/a06.svg", description: "Banded exoplanet crossed by an angled luminous planetary ring." },
  { id: "a07", code: "A07", name: "Solar Crest", collection: "orbit", collectionLabel: "Orbit & Space", assetPath: "/avatars/a07.svg", description: "Warm golden solar crest rising over a dark obsidian horizon." },
  { id: "a08", code: "A08", name: "Constellation", collection: "orbit", collectionLabel: "Orbit & Space", assetPath: "/avatars/a08.svg", description: "Seven connected celestial star nodes mapped by hairline vectors." },
  { id: "a09", code: "A09", name: "Midnight Planet", collection: "orbit", collectionLabel: "Orbit & Space", assetPath: "/avatars/a09.svg", description: "Midnight-blue planet in half-shadow accompanied by twin moons." },
  { id: "a10", code: "A10", name: "Comet Trail", collection: "orbit", collectionLabel: "Orbit & Space", assetPath: "/avatars/a10.svg", description: "Bright parabolic comet head with a tapered luminous ion tail." },

  // Collection B: Markets & Strategy (10)
  { id: "b01", code: "B01", name: "Candlestick Signal", collection: "markets", collectionLabel: "Markets & Strategy", assetPath: "/avatars/b01.svg", description: "Ascending candlestick sequence tracing an upward breakout arc." },
  { id: "b02", code: "B02", name: "Trend Compass", collection: "markets", collectionLabel: "Markets & Strategy", assetPath: "/avatars/b02.svg", description: "Technical dial compass with a sharp north-east directional needle." },
  { id: "b03", code: "B03", name: "Bull Emblem", collection: "markets", collectionLabel: "Markets & Strategy", assetPath: "/avatars/b03.svg", description: "Angular geometric bull medallion in obsidian and muted emerald." },
  { id: "b04", code: "B04", name: "Bear Emblem", collection: "markets", collectionLabel: "Markets & Strategy", assetPath: "/avatars/b04.svg", description: "Faceted geometric bear crest in slate and brushed silver." },
  { id: "b05", code: "B05", name: "Market Grid", collection: "markets", collectionLabel: "Markets & Strategy", assetPath: "/avatars/b05.svg", description: "Perspective quantitative grid illuminated by a climbing vector path." },
  { id: "b06", code: "B06", name: "Ledger Bars", collection: "markets", collectionLabel: "Markets & Strategy", assetPath: "/avatars/b06.svg", description: "Five stepped vertical ledger bars resting on a calibrated baseline." },
  { id: "b07", code: "B07", name: "Fibonacci Spiral", collection: "markets", collectionLabel: "Markets & Strategy", assetPath: "/avatars/b07.svg", description: "Golden-ratio subdivisions guiding a precision logarithmic spiral." },
  { id: "b08", code: "B08", name: "Vector Peak", collection: "markets", collectionLabel: "Markets & Strategy", assetPath: "/avatars/b08.svg", description: "Twin sharp analytical summit peaks marked with a vertical drop line." },
  { id: "b09", code: "B09", name: "Vault Shield", collection: "markets", collectionLabel: "Markets & Strategy", assetPath: "/avatars/b09.svg", description: "Faceted institutional shield framing a centered diamond core." },
  { id: "b10", code: "B10", name: "Price Pulse", collection: "markets", collectionLabel: "Markets & Strategy", assetPath: "/avatars/b10.svg", description: "Calibrated signal waveform peaking sharply above a zero axis." },

  // Collection C: Earth & Nature (10)
  { id: "c01", code: "C01", name: "Mountain Ridge", collection: "nature", collectionLabel: "Earth & Nature", assetPath: "/avatars/c01.svg", description: "Snow-capped alpine peaks standing beneath a quiet dusk moon." },
  { id: "c02", code: "C02", name: "Ocean Current", collection: "nature", collectionLabel: "Earth & Nature", assetPath: "/avatars/c02.svg", description: "Layered sinusoidal ocean currents flowing across marine slate." },
  { id: "c03", code: "C03", name: "Desert Dune", collection: "nature", collectionLabel: "Earth & Nature", assetPath: "/avatars/c03.svg", description: "Sculpted sand dune ridges illuminated by a warm low desert sun." },
  { id: "c04", code: "C04", name: "Glacier Edge", collection: "nature", collectionLabel: "Earth & Nature", assetPath: "/avatars/c04.svg", description: "Crystalline Arctic glacier peaks reflected in calm dark water." },
  { id: "c05", code: "C05", name: "Pine Canopy", collection: "nature", collectionLabel: "Earth & Nature", assetPath: "/avatars/c05.svg", description: "Minimal evergreen pine silhouettes rising along a quiet midnight ridge." },
  { id: "c06", code: "C06", name: "Lotus Geometry", collection: "nature", collectionLabel: "Earth & Nature", assetPath: "/avatars/c06.svg", description: "Symmetrical layered lotus petals unfolding from a dark center." },
  { id: "c07", code: "C07", name: "Grand Canyon", collection: "nature", collectionLabel: "Earth & Nature", assetPath: "/avatars/c07.svg", description: "Terraced sandstone canyon walls flanking a winding blue river." },
  { id: "c08", code: "C08", name: "Storm Front", collection: "nature", collectionLabel: "Earth & Nature", assetPath: "/avatars/c08.svg", description: "Sculpted dark thunderhead cloud releasing a crisp silver bolt." },
  { id: "c09", code: "C09", name: "First Light", collection: "nature", collectionLabel: "Earth & Nature", assetPath: "/avatars/c09.svg", description: "Warm dawn disc breaking across a dark horizon with water reflections." },
  { id: "c10", code: "C10", name: "Monsoon Drop", collection: "nature", collectionLabel: "Earth & Nature", assetPath: "/avatars/c10.svg", description: "Luminous raindrop hovering above three concentric surface ripples." },

  // Collection D: Pure Geometry (10)
  { id: "d01", code: "D01", name: "Glass Prism", collection: "geometry", collectionLabel: "Pure Geometry", assetPath: "/avatars/d01.svg", description: "Triangular optical prism refracting a beam into three clean rays." },
  { id: "d02", code: "D02", name: "Isometric Cube", collection: "geometry", collectionLabel: "Pure Geometry", assetPath: "/avatars/d02.svg", description: "Precision three-face isometric cube with nested wireframe interior." },
  { id: "d03", code: "D03", name: "Tessellation", collection: "geometry", collectionLabel: "Pure Geometry", assetPath: "/avatars/d03.svg", description: "Interlocking diamond tiles arranged in balanced tonal contrast." },
  { id: "d04", code: "D04", name: "Folded Ribbon", collection: "geometry", collectionLabel: "Pure Geometry", assetPath: "/avatars/d04.svg", description: "Architectural folded ribbon forming a sculpted diagonal monolith." },
  { id: "d05", code: "D05", name: "Hex Network", collection: "geometry", collectionLabel: "Pure Geometry", assetPath: "/avatars/d05.svg", description: "Central hexagon linked to six surrounding geometric honeycomb cells." },
  { id: "d06", code: "D06", name: "Mobius Loop", collection: "geometry", collectionLabel: "Pure Geometry", assetPath: "/avatars/d06.svg", description: "Continuous figure-eight Mobius ribbon with overlapping depth shading." },
  { id: "d07", code: "D07", name: "Orbital Torus", collection: "geometry", collectionLabel: "Pure Geometry", assetPath: "/avatars/d07.svg", description: "Five intersecting elliptical wireframe rings rotating around a core." },
  { id: "d08", code: "D08", name: "Stacked Arcs", collection: "geometry", collectionLabel: "Pure Geometry", assetPath: "/avatars/d08.svg", description: "Five concentric semi-circular arches stepped in calibrated luminance." },
  { id: "d09", code: "D09", name: "Linear Labyrinth", collection: "geometry", collectionLabel: "Pure Geometry", assetPath: "/avatars/d09.svg", description: "Concentric circular labyrinth pathways converging on a bright core." },
  { id: "d10", code: "D10", name: "Diamond Lattice", collection: "geometry", collectionLabel: "Pure Geometry", assetPath: "/avatars/d10.svg", description: "Multi-faceted octahedral diamond silhouette with luminous crown facets." },

  // Collection E: Human Archetypes (10)
  { id: "e01", code: "E01", name: "Navigator", collection: "personas", collectionLabel: "Human Archetypes", assetPath: "/avatars/e01.svg", description: "Stylized hooded navigator silhouette with a luminous horizon visor." },
  { id: "e02", code: "E02", name: "Analyst", collection: "personas", collectionLabel: "Human Archetypes", assetPath: "/avatars/e02.svg", description: "Minimal geometric researcher portrait with precision optical frames." },
  { id: "e03", code: "E03", name: "Explorer", collection: "personas", collectionLabel: "Human Archetypes", assetPath: "/avatars/e03.svg", description: "Helmeted orbital explorer reflecting a curved horizon across its visor." },
  { id: "e04", code: "E04", name: "Strategist", collection: "personas", collectionLabel: "Human Archetypes", assetPath: "/avatars/e04.svg", description: "Architectural strategist figure topped by a restrained crown crest." },
  { id: "e05", code: "E05", name: "Architect", collection: "personas", collectionLabel: "Human Archetypes", assetPath: "/avatars/e05.svg", description: "Faceted designer silhouette framed by a dashed drafting compass arc." },
  { id: "e06", code: "E06", name: "Scientist", collection: "personas", collectionLabel: "Human Archetypes", assetPath: "/avatars/e06.svg", description: "Stylized researcher portrait backed by twin intersecting orbital ellipses." },
  { id: "e07", code: "E07", name: "Pilot", collection: "personas", collectionLabel: "Human Archetypes", assetPath: "/avatars/e07.svg", description: "Aerodynamic flight-helmet silhouette with dual split instrument visors." },
  { id: "e08", code: "E08", name: "Guardian", collection: "personas", collectionLabel: "Human Archetypes", assetPath: "/avatars/e08.svg", description: "Sculpted sentinel helm with vertical crest and brushed metallic shoulders." },
  { id: "e09", code: "E09", name: "Pioneer", collection: "personas", collectionLabel: "Human Archetypes", assetPath: "/avatars/e09.svg", description: "Forward-looking pioneer figure framed by an amber rising-horizon arc." },
  { id: "e10", code: "E10", name: "Creator", collection: "personas", collectionLabel: "Human Archetypes", assetPath: "/avatars/e10.svg", description: "Sculptural artisan bust haloed by a violet-silver orbital arc." },

  // Collection F: Minimalist & Atelier (10)
  { id: "f01", code: "F01", name: "Horizon Line", collection: "minimal", collectionLabel: "Minimalist & Atelier", assetPath: "/avatars/f01.svg", description: "Single luminous horizon bisected by a crisp vertical meridian." },
  { id: "f02", code: "F02", name: "Zenith Dot", collection: "minimal", collectionLabel: "Minimalist & Atelier", assetPath: "/avatars/f02.svg", description: "Restrained silver focal point balanced within an asymmetric hairline ring." },
  { id: "f03", code: "F03", name: "Twin Monolith", collection: "minimal", collectionLabel: "Minimalist & Atelier", assetPath: "/avatars/f03.svg", description: "Paired obsidian architectural slabs edged with brushed silver light." },
  { id: "f04", code: "F04", name: "Lavender Halo", collection: "minimal", collectionLabel: "Minimalist & Atelier", assetPath: "/avatars/f04.svg", description: "Soft lavender luminous eclipse ring centered on matte graphite." },
  { id: "f05", code: "F05", name: "Emerald Pulse", collection: "minimal", collectionLabel: "Minimalist & Atelier", assetPath: "/avatars/f05.svg", description: "Minimalist emerald telemetry line crossing a quiet obsidian plane." },
  { id: "f06", code: "F06", name: "Meridian Arc", collection: "minimal", collectionLabel: "Minimalist & Atelier", assetPath: "/avatars/f06.svg", description: "Paired sweeping quarter-arcs framing an open silver center." },
  { id: "f07", code: "F07", name: "Prism Core", collection: "minimal", collectionLabel: "Minimalist & Atelier", assetPath: "/avatars/f07.svg", description: "Pure triangular aperture revealing an ice-blue inner facet." },
  { id: "f08", code: "F08", name: "Obsidian Wave", collection: "minimal", collectionLabel: "Minimalist & Atelier", assetPath: "/avatars/f08.svg", description: "Three parallel matte wave ribbons curving smoothly in monochrome silver." },
  { id: "f09", code: "F09", name: "Signal Node", collection: "minimal", collectionLabel: "Minimalist & Atelier", assetPath: "/avatars/f09.svg", description: "Three minimal connected research nodes along an ascending diagonal." },
  { id: "f10", code: "F10", name: "Silver Crest", collection: "minimal", collectionLabel: "Minimalist & Atelier", assetPath: "/avatars/f10.svg", description: "Fine minimalist concentric shield mark with a calm luminous apex." },
]);

export const DEFAULT_AVATAR_ID = "a01";

export const AVATAR_IDS: ReadonlySet<string> = new Set(
  AVATAR_CATALOG.map((item) => item.id),
);

export const AVATAR_BY_ID: ReadonlyMap<string, AvatarPreset> = new Map(
  AVATAR_CATALOG.map((item) => [item.id, item]),
);

/** Deterministic mapping so legacy X1 color names render valid high-craft presets without losing records. */
export const LEGACY_AVATAR_MAP: Readonly<Record<string, string>> = Object.freeze({
  mint: "a01",
  silver: "a03",
  slate: "d02",
  sky: "a02",
  lavender: "a05",
});

export function isValidAvatarPresetId(value: unknown): value is string {
  return typeof value === "string" && AVATAR_IDS.has(value);
}

export function normalizeAvatarId(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_AVATAR_ID;
  const trimmed = value.trim().toLowerCase();
  if (AVATAR_IDS.has(trimmed)) return trimmed;
  if (trimmed in LEGACY_AVATAR_MAP) return LEGACY_AVATAR_MAP[trimmed];
  return DEFAULT_AVATAR_ID;
}

export function resolveAvatarPreset(value: unknown): AvatarPreset {
  const id = normalizeAvatarId(value);
  return AVATAR_BY_ID.get(id) ?? AVATAR_CATALOG[0];
}

/**
 * Cryptographically secure random selection across all 60 active avatar IDs (a01–f10).
 * Uses unbiased 32-bit rejection sampling over crypto.getRandomValues(Uint8Array(4)).
 */
export function pickRandomAvatarId(
  excludeIds: readonly string[] = [],
): string {
  const excluded = new Set(
    excludeIds
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim().toLowerCase()),
  );
  const filtered = AVATAR_CATALOG.filter((item) => !excluded.has(item.id));
  const candidates = filtered.length > 0 ? filtered : AVATAR_CATALOG;
  const count = candidates.length;
  const maxUnbiased = Math.floor(0x1_0000_0000 / count) * count;

  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    const buf = new Uint8Array(4);
    for (let attempt = 0; attempt < 16; attempt++) {
      globalThis.crypto.getRandomValues(buf);
      const rand =
        ((buf[0]! << 24) >>> 0) +
        ((buf[1]! << 16) >>> 0) +
        ((buf[2]! << 8) >>> 0) +
        (buf[3]! >>> 0);
      if (rand < maxUnbiased) {
        return candidates[rand % count]!.id;
      }
    }
  }
  return candidates[Math.floor(Math.random() * count)]!.id;
}
