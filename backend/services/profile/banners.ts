/**
 * Strategic Souls X5.6 — 8 Original Visual Banner Artwork Presets (6 Dark + 2 Light).
 * Every preset includes multi-layered SVG vector artwork (orbit rings, aurora ribbons,
 * eclipse corona, sculpted Arctic horizon, topographic oceanic contours, glass prisms,
 * perspective titanium architecture, and cosmic nebula geometry) encoded as zero-latency
 * inline SVG data URLs so banners render crisply at any aspect ratio without external R2 fetches.
 */

export type BannerThemeTone = "dark" | "light";

export type BannerPreset = {
  readonly id: string;
  readonly name: string;
  readonly legacyName: string;
  readonly category: "Obsidian" | "Celestial" | "Quant Grid" | "Atelier Light";
  readonly theme: BannerThemeTone;
  readonly description: string;
  readonly artworkDataUrl: string;
  readonly gradient: string;
  readonly accentLine: string;
  readonly safeZoneScrim: string;
  readonly badgeBg: string;
  readonly badgeText: string;
};

export const DEFAULT_BANNER_ID = "b01";

function svgDataUrl(svg: string): string {
  const compact = svg.replace(/\s+/g, " ").trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(compact)}`;
}

const B01_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="g1" cx="18%" cy="22%" r="85%">
      <stop offset="0%" stop-color="#223042"/>
      <stop offset="52%" stop-color="#10141b"/>
      <stop offset="100%" stop-color="#07080b"/>
    </radialGradient>
    <linearGradient id="r1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#94D0FF" stop-opacity="0.55"/>
      <stop offset="50%" stop-color="#CAD3DC" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#76C0FF" stop-opacity="0.05"/>
    </linearGradient>
  </defs>
  <rect width="960" height="300" fill="url(#g1)"/>
  <ellipse cx="720" cy="260" rx="460" ry="175" fill="none" stroke="url(#r1)" stroke-width="1.6"/>
  <ellipse cx="720" cy="260" rx="340" ry="125" fill="none" stroke="url(#r1)" stroke-width="1.2" stroke-dasharray="8 6"/>
  <ellipse cx="720" cy="260" rx="220" ry="78" fill="none" stroke="#76C0FF" stroke-opacity="0.32" stroke-width="1"/>
  <circle cx="430" cy="126" r="18" fill="#172231" stroke="#94D0FF" stroke-opacity="0.6" stroke-width="1.5"/>
  <circle cx="424" cy="121" r="4" fill="#E8EDF2" fill-opacity="0.7"/>
  <circle cx="150" cy="64" r="1.8" fill="#E8EDF2" fill-opacity="0.75"/>
  <circle cx="280" cy="48" r="1.4" fill="#94D0FF" fill-opacity="0.8"/>
  <circle cx="590" cy="58" r="2.1" fill="#E8EDF2" fill-opacity="0.85"/>
  <circle cx="820" cy="72" r="1.6" fill="#CAD3DC" fill-opacity="0.7"/>
  <circle cx="885" cy="135" r="2.2" fill="#94D0FF" fill-opacity="0.75"/>
</svg>`);

const B02_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#061512"/>
      <stop offset="55%" stop-color="#0b221d"/>
      <stop offset="100%" stop-color="#070a0d"/>
    </linearGradient>
    <linearGradient id="aurA" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.06"/>
      <stop offset="38%" stop-color="#34d399" stop-opacity="0.38"/>
      <stop offset="72%" stop-color="#6ee7b7" stop-opacity="0.48"/>
      <stop offset="100%" stop-color="#14b8a6" stop-opacity="0.08"/>
    </linearGradient>
    <linearGradient id="aurB" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0d9488" stop-opacity="0.05"/>
      <stop offset="50%" stop-color="#2dd4bf" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#a7f3d0" stop-opacity="0.12"/>
    </linearGradient>
  </defs>
  <rect width="960" height="300" fill="url(#bg2)"/>
  <path d="M-40,210 C180,90 360,250 580,120 C740,30 860,150 1000,70 L1000,300 L-40,300 Z" fill="url(#aurA)"/>
  <path d="M-40,150 C150,240 390,40 640,170 C790,240 880,90 1000,130 L1000,300 L-40,300 Z" fill="url(#aurB)"/>
  <path d="M-20,175 C200,75 410,225 650,105 C790,35 890,135 980,85" fill="none" stroke="#6ee7b7" stroke-opacity="0.55" stroke-width="1.8"/>
  <path d="M-20,220 C220,130 430,260 690,145 C820,88 900,165 980,125" fill="none" stroke="#99f6e4" stroke-opacity="0.3" stroke-width="1.1"/>
</svg>`);

const B03_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="bg3" cx="68%" cy="48%" r="75%">
      <stop offset="0%" stop-color="#232b4a"/>
      <stop offset="45%" stop-color="#111628"/>
      <stop offset="100%" stop-color="#07080f"/>
    </radialGradient>
    <radialGradient id="corona" cx="50%" cy="50%" r="50%">
      <stop offset="52%" stop-color="#07080f" stop-opacity="1"/>
      <stop offset="68%" stop-color="#94D0FF" stop-opacity="0.62"/>
      <stop offset="82%" stop-color="#c4b5fd" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="#07080f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="960" height="300" fill="url(#bg3)"/>
  <circle cx="670" cy="145" r="145" fill="url(#corona)"/>
  <circle cx="676" cy="145" r="74" fill="#070910" stroke="#94D0FF" stroke-opacity="0.55" stroke-width="1.4"/>
  <path d="M510,145 A160,52 0 1,0 830,145" fill="none" stroke="#c4b5fd" stroke-opacity="0.38" stroke-width="1.2"/>
  <circle cx="210" cy="84" r="1.6" fill="#E8EDF2" fill-opacity="0.7"/>
  <circle cx="345" cy="192" r="1.4" fill="#94D0FF" fill-opacity="0.65"/>
  <circle cx="460" cy="68" r="2" fill="#E8EDF2" fill-opacity="0.8"/>
</svg>`);

const B04_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg4" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F4F8FC"/>
      <stop offset="52%" stop-color="#DCE9F5"/>
      <stop offset="100%" stop-color="#C3D9EC"/>
    </linearGradient>
    <linearGradient id="ice" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#9CC2E3" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#5B86AD" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect width="960" height="300" fill="url(#bg4)"/>
  <circle cx="760" cy="76" r="38" fill="#FFFFFF" fill-opacity="0.85" stroke="#7AA7CF" stroke-opacity="0.45" stroke-width="1.2"/>
  <path d="M0,195 L165,128 L310,178 L495,104 L670,172 L815,122 L960,168 L960,300 L0,300 Z" fill="#B2CCE3" fill-opacity="0.65"/>
  <path d="M0,228 L130,182 L290,218 L460,152 L640,214 L790,164 L960,205 L960,300 L0,300 Z" fill="url(#ice)"/>
  <path d="M0,195 L165,128 L310,178 L495,104 L670,172 L815,122 L960,168" fill="none" stroke="#2D4A66" stroke-opacity="0.45" stroke-width="1.4"/>
  <line x1="80" y1="74" x2="420" y2="74" stroke="#3B5D7D" stroke-opacity="0.25" stroke-width="1"/>
  <line x1="80" y1="92" x2="290" y2="92" stroke="#3B5D7D" stroke-opacity="0.2" stroke-width="1"/>
</svg>`);

const B05_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg5" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#061320"/>
      <stop offset="50%" stop-color="#0c253b"/>
      <stop offset="100%" stop-color="#07111c"/>
    </linearGradient>
  </defs>
  <rect width="960" height="300" fill="url(#bg5)"/>
  <path d="M-30,70 C180,20 340,130 560,65 C740,12 850,95 990,55" fill="none" stroke="#38bdf8" stroke-opacity="0.24" stroke-width="1.3"/>
  <path d="M-30,115 C190,55 360,175 580,105 C760,48 860,135 990,95" fill="none" stroke="#38bdf8" stroke-opacity="0.36" stroke-width="1.5"/>
  <path d="M-30,160 C210,95 380,220 600,145 C770,88 870,175 990,135" fill="none" stroke="#76C0FF" stroke-opacity="0.52" stroke-width="1.8"/>
  <path d="M-30,205 C220,140 400,260 625,185 C785,130 880,215 990,175" fill="none" stroke="#94D0FF" stroke-opacity="0.38" stroke-width="1.4"/>
  <path d="M-30,248 C235,185 420,290 650,225 C800,175 890,250 990,215" fill="none" stroke="#BAE6FD" stroke-opacity="0.22" stroke-width="1.1"/>
  <circle cx="600" cy="145" r="4" fill="#94D0FF" fill-opacity="0.85"/>
  <circle cx="315" cy="118" r="3" fill="#38bdf8" fill-opacity="0.75"/>
</svg>`);

const B06_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg6" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FAF6F0"/>
      <stop offset="52%" stop-color="#EFE7EE"/>
      <stop offset="100%" stop-color="#DFDAE8"/>
    </linearGradient>
    <linearGradient id="pr1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F9A8D4" stop-opacity="0.45"/>
      <stop offset="50%" stop-color="#C4B5FD" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#93C5FD" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="pr2" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FDBA74" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#A78BFA" stop-opacity="0.38"/>
    </linearGradient>
  </defs>
  <rect width="960" height="300" fill="url(#bg6)"/>
  <polygon points="540,24 720,245 370,245" fill="url(#pr1)" stroke="#6D5D87" stroke-opacity="0.35" stroke-width="1.4"/>
  <polygon points="675,48 860,262 525,262" fill="url(#pr2)" stroke="#7C6A96" stroke-opacity="0.32" stroke-width="1.2"/>
  <polygon points="260,64 430,256 125,256" fill="#FFFFFF" fill-opacity="0.42" stroke="#7E6E94" stroke-opacity="0.26" stroke-width="1.1"/>
  <line x1="0" y1="185" x2="960" y2="115" stroke="#5B4D73" stroke-opacity="0.24" stroke-width="1.2"/>
</svg>`);

const B07_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg7" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#171b22"/>
      <stop offset="52%" stop-color="#101318"/>
      <stop offset="100%" stop-color="#07090c"/>
    </linearGradient>
  </defs>
  <rect width="960" height="300" fill="url(#bg7)"/>
  <g stroke="#CAD3DC" stroke-opacity="0.16" stroke-width="1">
    <line x1="0" y1="60" x2="960" y2="60"/>
    <line x1="0" y1="120" x2="960" y2="120"/>
    <line x1="0" y1="180" x2="960" y2="180"/>
    <line x1="0" y1="240" x2="960" y2="240"/>
    <line x1="160" y1="0" x2="40" y2="300"/>
    <line x1="320" y1="0" x2="240" y2="300"/>
    <line x1="480" y1="0" x2="480" y2="300"/>
    <line x1="640" y1="0" x2="720" y2="300"/>
    <line x1="800" y1="0" x2="920" y2="300"/>
  </g>
  <polygon points="480,38 630,145 480,252 330,145" fill="#1e2530" fill-opacity="0.65" stroke="#94D0FF" stroke-opacity="0.48" stroke-width="1.5"/>
  <polygon points="690,62 820,152 690,242 560,152" fill="#181e27" fill-opacity="0.55" stroke="#E8EDF2" stroke-opacity="0.32" stroke-width="1.2"/>
</svg>`);

const B08_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="bg8" cx="72%" cy="32%" r="85%">
      <stop offset="0%" stop-color="#2e1d4a"/>
      <stop offset="48%" stop-color="#151329"/>
      <stop offset="100%" stop-color="#07080d"/>
    </radialGradient>
    <radialGradient id="neb" cx="32%" cy="68%" r="55%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.32"/>
      <stop offset="55%" stop-color="#8b5cf6" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#07080d" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="960" height="300" fill="url(#bg8)"/>
  <rect width="960" height="300" fill="url(#neb)"/>
  <g stroke="#c4b5fd" stroke-opacity="0.35" stroke-width="1.1" fill="none">
    <polyline points="170,190 275,112 410,148 555,78 710,132 835,68"/>
    <polyline points="275,112 330,218 555,78"/>
  </g>
  <circle cx="170" cy="190" r="3" fill="#E8EDF2"/>
  <circle cx="275" cy="112" r="3.5" fill="#94D0FF"/>
  <circle cx="410" cy="148" r="2.8" fill="#c4b5fd"/>
  <circle cx="555" cy="78" r="4" fill="#E8EDF2"/>
  <circle cx="710" cy="132" r="3.2" fill="#94D0FF"/>
  <circle cx="835" cy="68" r="3.5" fill="#E8EDF2"/>
</svg>`);

export const BANNER_PRESETS: readonly BannerPreset[] = Object.freeze([
  {
    id: "b01",
    name: "Obsidian Orbit",
    legacyName: "Obsidian Horizon",
    category: "Obsidian",
    theme: "dark",
    description:
      "Near-black graphite depth with sweeping metallic orbit rings and pinpoint celestial nodes.",
    artworkDataUrl: B01_SVG,
    gradient: `url("${B01_SVG}"), radial-gradient(120% 90% at 15% 15%, #1d2633 0%, #101215 52%, #070809 100%)`,
    accentLine: "rgba(118, 192, 255, 0.34)",
    safeZoneScrim:
      "linear-gradient(180deg, rgba(7, 8, 11, 0.14) 0%, rgba(7, 8, 11, 0.62) 100%)",
    badgeBg: "rgba(12, 16, 23, 0.78)",
    badgeText: "#E8EDF2",
  },
  {
    id: "b02",
    name: "Emerald Aurora",
    legacyName: "Emerald Terminal",
    category: "Quant Grid",
    theme: "dark",
    description:
      "Layered emerald and mint luminous aurora ribbons flowing across deep nocturnal teal.",
    artworkDataUrl: B02_SVG,
    gradient: `url("${B02_SVG}"), radial-gradient(110% 85% at 85% 20%, #10261e 0%, #0d1412 50%, #070809 100%)`,
    accentLine: "rgba(110, 231, 183, 0.36)",
    safeZoneScrim:
      "linear-gradient(180deg, rgba(6, 16, 14, 0.12) 0%, rgba(7, 10, 13, 0.64) 100%)",
    badgeBg: "rgba(9, 20, 18, 0.8)",
    badgeText: "#E8EDF2",
  },
  {
    id: "b03",
    name: "Eclipse Corona",
    legacyName: "Eclipse Corona",
    category: "Celestial",
    theme: "dark",
    description:
      "Midnight indigo sky with an asymmetric total eclipse and icy blue-lavender corona ring.",
    artworkDataUrl: B03_SVG,
    gradient: `url("${B03_SVG}"), radial-gradient(circle at 68% 48%, #263140 0%, #12161c 46%, #070809 86%)`,
    accentLine: "rgba(196, 181, 253, 0.36)",
    safeZoneScrim:
      "linear-gradient(180deg, rgba(7, 8, 15, 0.14) 0%, rgba(7, 8, 15, 0.64) 100%)",
    badgeBg: "rgba(12, 15, 28, 0.8)",
    badgeText: "#E8EDF2",
  },
  {
    id: "b04",
    name: "Arctic Horizon",
    legacyName: "Slate Strata",
    category: "Atelier Light",
    theme: "light",
    description:
      "Daylight pearl white and ice-blue horizon with sculpted glacial ridges and fine vector linework.",
    artworkDataUrl: B04_SVG,
    gradient: `url("${B04_SVG}"), linear-gradient(135deg, #F4F8FC 0%, #DCE9F5 52%, #C3D9EC 100%)`,
    accentLine: "rgba(59, 93, 125, 0.42)",
    safeZoneScrim:
      "linear-gradient(180deg, rgba(11, 18, 28, 0.18) 0%, rgba(11, 18, 28, 0.76) 100%)",
    badgeBg: "rgba(11, 18, 28, 0.84)",
    badgeText: "#E8EDF2",
  },
  {
    id: "b05",
    name: "Oceanic Contours",
    legacyName: "Deep Ocean Orbit",
    category: "Celestial",
    theme: "dark",
    description:
      "Deep cerulean and marine navy bathymetry with glowing current contour lines.",
    artworkDataUrl: B05_SVG,
    gradient: `url("${B05_SVG}"), radial-gradient(100% 120% at 80% 95%, #12283d 0%, #0d1520 50%, #070809 100%)`,
    accentLine: "rgba(118, 192, 255, 0.38)",
    safeZoneScrim:
      "linear-gradient(180deg, rgba(6, 17, 28, 0.12) 0%, rgba(7, 12, 20, 0.64) 100%)",
    badgeBg: "rgba(8, 18, 30, 0.8)",
    badgeText: "#E8EDF2",
  },
  {
    id: "b06",
    name: "Prism Atelier",
    legacyName: "Graphite Matrix",
    category: "Atelier Light",
    theme: "light",
    description:
      "Warm ivory and brushed silver daylight study with translucent peach-lilac glass prisms.",
    artworkDataUrl: B06_SVG,
    gradient: `url("${B06_SVG}"), linear-gradient(160deg, #FAF6F0 0%, #EFE7EE 55%, #DFDAE8 100%)`,
    accentLine: "rgba(109, 93, 135, 0.42)",
    safeZoneScrim:
      "linear-gradient(180deg, rgba(14, 12, 22, 0.18) 0%, rgba(14, 12, 22, 0.76) 100%)",
    badgeBg: "rgba(14, 12, 22, 0.84)",
    badgeText: "#E8EDF2",
  },
  {
    id: "b07",
    name: "Titanium Grid",
    legacyName: "Lunar Ridge",
    category: "Quant Grid",
    theme: "dark",
    description:
      "Precision silver and charcoal faceted architecture over a perspective quantitative grid.",
    artworkDataUrl: B07_SVG,
    gradient: `url("${B07_SVG}"), radial-gradient(130% 80% at 25% 100%, #23272d 0%, #121519 52%, #070809 100%)`,
    accentLine: "rgba(232, 237, 242, 0.3)",
    safeZoneScrim:
      "linear-gradient(180deg, rgba(8, 10, 14, 0.12) 0%, rgba(8, 10, 14, 0.64) 100%)",
    badgeBg: "rgba(12, 15, 20, 0.8)",
    badgeText: "#E8EDF2",
  },
  {
    id: "b08",
    name: "Midnight Nebula",
    legacyName: "Midnight Vector",
    category: "Celestial",
    theme: "dark",
    description:
      "Cinematic violet and deep indigo cosmic clouds linked by silver constellation geometry.",
    artworkDataUrl: B08_SVG,
    gradient: `url("${B08_SVG}"), linear-gradient(120deg, #070809 0%, #151c26 50%, #1f1635 100%)`,
    accentLine: "rgba(196, 181, 253, 0.36)",
    safeZoneScrim:
      "linear-gradient(180deg, rgba(7, 8, 13, 0.12) 0%, rgba(7, 8, 13, 0.66) 100%)",
    badgeBg: "rgba(13, 12, 24, 0.8)",
    badgeText: "#E8EDF2",
  },
]);

export const BANNER_IDS = new Set(BANNER_PRESETS.map((b) => b.id));

export function isValidBannerPresetId(value: unknown): value is string {
  return (
    typeof value === "string" && BANNER_IDS.has(value.trim().toLowerCase())
  );
}

export function resolveBannerPreset(id?: string | null): BannerPreset {
  const key =
    typeof id === "string" ? id.trim().toLowerCase() : DEFAULT_BANNER_ID;
  return BANNER_PRESETS.find((b) => b.id === key) ?? BANNER_PRESETS[0];
}
