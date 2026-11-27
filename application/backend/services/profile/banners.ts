/**
 * Strategic Souls X 3.0 — 30 Original Visual Banner Artwork Presets (24 Dark + 6 Light).
 * Every preset includes multi-layered SVG vector artwork encoded as zero-latency
 * inline SVG data URLs so banners render crisply at any aspect ratio without external fetches.
 */

export type BannerThemeTone = "dark" | "light";

export type BannerPreset = {
  readonly id: string;
  readonly name: string;
  readonly legacyName: string;
  readonly category:
    | "Obsidian"
    | "Celestial"
    | "Quant Grid"
    | "Atelier Light"
    | "Atmospheric";
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
  ...buildExpandedBanners(),
]);

type ExpandedBannerSeed = {
  id: string;
  name: string;
  category: BannerPreset["category"];
  theme: BannerThemeTone;
  description: string;
  bgA: string;
  bgB: string;
  bgC: string;
  accent: string;
  accentRgba: string;
  motif: string;
};

function buildExpandedBanners(): BannerPreset[] {
  const seeds: ExpandedBannerSeed[] = [
    {
      id: "b09",
      name: "Silver Meridian",
      category: "Celestial",
      theme: "dark",
      description: "Longitudinal silver meridian arcs crossing a deep graphite zenith.",
      bgA: "#0B1018",
      bgB: "#151F2E",
      bgC: "#07090D",
      accent: "#CAD3DC",
      accentRgba: "rgba(202, 211, 220, 0.36)",
      motif: `<path d="M480,0 V300" stroke="#CAD3DC" stroke-opacity="0.22" stroke-width="1"/><ellipse cx="480" cy="150" rx="180" ry="220" fill="none" stroke="#94D0FF" stroke-opacity="0.34" stroke-width="1.3"/><ellipse cx="480" cy="150" rx="340" ry="240" fill="none" stroke="#CAD3DC" stroke-opacity="0.2" stroke-width="1.1"/><circle cx="480" cy="112" r="5" fill="#E8EDF2"/>`,
    },
    {
      id: "b10",
      name: "Emerald Ledger",
      category: "Quant Grid",
      theme: "dark",
      description: "Stepped algorithmic histogram bars illuminated in calm market green.",
      bgA: "#071410",
      bgB: "#0E231B",
      bgC: "#07090B",
      accent: "#42CF91",
      accentRgba: "rgba(66, 207, 145, 0.38)",
      motif: `<g fill="#42CF91" fill-opacity="0.18" stroke="#42CF91" stroke-opacity="0.42" stroke-width="1"><rect x="140" y="185" width="44" height="115" rx="4"/><rect x="210" y="145" width="44" height="155" rx="4"/><rect x="280" y="165" width="44" height="135" rx="4"/><rect x="350" y="110" width="44" height="190" rx="4"/><rect x="420" y="88" width="44" height="212" rx="4"/><rect x="490" y="128" width="44" height="172" rx="4"/><rect x="560" y="74" width="44" height="226" rx="4"/><rect x="630" y="102" width="44" height="198" rx="4"/><rect x="700" y="60" width="44" height="240" rx="4"/></g><line x1="80" y1="240" x2="880" y2="240" stroke="#6EE7B7" stroke-opacity="0.28" stroke-width="1"/>`,
    },
    {
      id: "b11",
      name: "Lavender Dusk",
      category: "Atmospheric",
      theme: "dark",
      description: "Soft lavender atmospheric ribbons drifting above matte obsidian twilight.",
      bgA: "#161124",
      bgB: "#211834",
      bgC: "#09080E",
      accent: "#C4B5FD",
      accentRgba: "rgba(196, 181, 253, 0.42)",
      motif: `<path d="M-20,185 C200,110 420,235 670,130 C810,75 900,125 990,95 L990,300 L-20,300 Z" fill="#C4B5FD" fill-opacity="0.14"/><path d="M-20,145 C220,75 450,205 700,105 C830,52 910,95 990,70" fill="none" stroke="#C4B5FD" stroke-opacity="0.52" stroke-width="1.6"/><path d="M-20,215 C240,145 480,255 740,165 C850,125 920,160 990,140" fill="none" stroke="#DDD6FE" stroke-opacity="0.3" stroke-width="1.1"/>`,
    },
    {
      id: "b12",
      name: "Ivory Meridian",
      category: "Atelier Light",
      theme: "light",
      description: "Warm alabaster daylight canvas etched with crisp architectural slate arcs.",
      bgA: "#FAF8F5",
      bgB: "#ECE8E1",
      bgC: "#DCD6CC",
      accent: "#475569",
      accentRgba: "rgba(71, 85, 105, 0.36)",
      motif: `<circle cx="710" cy="145" r="118" fill="none" stroke="#475569" stroke-opacity="0.28" stroke-width="1.3"/><circle cx="710" cy="145" r="76" fill="#FFFFFF" fill-opacity="0.5" stroke="#64748B" stroke-opacity="0.25" stroke-width="1"/><line x1="60" y1="145" x2="900" y2="145" stroke="#475569" stroke-opacity="0.22" stroke-width="1"/><path d="M120,245 Q420,170 860,230" fill="none" stroke="#334155" stroke-opacity="0.3" stroke-width="1.4"/>`,
    },
    {
      id: "b13",
      name: "Basalt Strata",
      category: "Obsidian",
      theme: "dark",
      description: "Layered volcanic basalt strata etched with fine silver mineral seams.",
      bgA: "#14161A",
      bgB: "#0D0F13",
      bgC: "#060709",
      accent: "#B9C3CE",
      accentRgba: "rgba(185, 195, 206, 0.32)",
      motif: `<path d="M0,110 L190,82 L410,122 L640,76 L960,115 L960,300 L0,300 Z" fill="#181C22" fill-opacity="0.72"/><path d="M0,175 L230,142 L470,188 L720,136 L960,172 L960,300 L0,300 Z" fill="#101318" fill-opacity="0.88"/><path d="M0,110 L190,82 L410,122 L640,76 L960,115" fill="none" stroke="#CAD3DC" stroke-opacity="0.34" stroke-width="1.3"/><path d="M0,175 L230,142 L470,188 L720,136 L960,172" fill="none" stroke="#94A3B8" stroke-opacity="0.24" stroke-width="1.1"/>`,
    },
    {
      id: "b14",
      name: "Solar Corona",
      category: "Celestial",
      theme: "dark",
      description: "Warm amber rim light emerging along a dark eclipse horizon.",
      bgA: "#1F150C",
      bgB: "#120D0A",
      bgC: "#070709",
      accent: "#F59E0B",
      accentRgba: "rgba(245, 158, 11, 0.42)",
      motif: `<circle cx="480" cy="310" r="215" fill="#070709" stroke="#FBBF24" stroke-opacity="0.6" stroke-width="2.4"/><circle cx="480" cy="310" r="245" fill="none" stroke="#F59E0B" stroke-opacity="0.24" stroke-width="1.2"/><circle cx="480" cy="310" r="285" fill="none" stroke="#FDE68A" stroke-opacity="0.14" stroke-width="1"/><circle cx="230" cy="70" r="1.8" fill="#FEF3C7" fill-opacity="0.75"/><circle cx="760" cy="84" r="2" fill="#FDE68A" fill-opacity="0.7"/>`,
    },
    {
      id: "b15",
      name: "Teal Bathymetry",
      category: "Atmospheric",
      theme: "dark",
      description: "Concentric deep marine teal bathymetric contour trenches.",
      bgA: "#061A1B",
      bgB: "#0B292A",
      bgC: "#050B0D",
      accent: "#4FA3A1",
      accentRgba: "rgba(79, 163, 161, 0.42)",
      motif: `<ellipse cx="640" cy="175" rx="340" ry="125" fill="none" stroke="#4FA3A1" stroke-opacity="0.26" stroke-width="1.2"/><ellipse cx="640" cy="175" rx="255" ry="92" fill="none" stroke="#5EEAD4" stroke-opacity="0.34" stroke-width="1.4"/><ellipse cx="640" cy="175" rx="170" ry="60" fill="none" stroke="#99F6E4" stroke-opacity="0.45" stroke-width="1.5"/><ellipse cx="640" cy="175" rx="85" ry="28" fill="#134E4A" fill-opacity="0.4" stroke="#CCFBF1" stroke-opacity="0.45" stroke-width="1.2"/>`,
    },
    {
      id: "b16",
      name: "Mist Glacier",
      category: "Atelier Light",
      theme: "light",
      description: "Cool platinum mist and pale silver-sage geometric ridge silhouettes.",
      bgA: "#F1F5F4",
      bgB: "#DEE8E5",
      bgC: "#C7D8D3",
      accent: "#3F625B",
      accentRgba: "rgba(63, 98, 91, 0.36)",
      motif: `<polygon points="80,300 280,108 480,300" fill="#B2C9C2" fill-opacity="0.6"/><polygon points="340,300 570,84 820,300" fill="#8FB0A6" fill-opacity="0.55"/><polygon points="620,300 810,136 980,300" fill="#6F948A" fill-opacity="0.5"/><line x1="0" y1="220" x2="960" y2="220" stroke="#2F4D47" stroke-opacity="0.22" stroke-width="1"/>`,
    },
    {
      id: "b17",
      name: "Vector Lattice",
      category: "Quant Grid",
      theme: "dark",
      description: "Diagonal institutional lattice matrix with luminous intersection nodes.",
      bgA: "#0B111C",
      bgB: "#101826",
      bgC: "#07090F",
      accent: "#76C0FF",
      accentRgba: "rgba(118, 192, 255, 0.38)",
      motif: `<g stroke="#76C0FF" stroke-opacity="0.2" stroke-width="1"><line x1="0" y1="300" x2="300" y2="0"/><line x1="160" y1="300" x2="460" y2="0"/><line x1="320" y1="300" x2="620" y2="0"/><line x1="480" y1="300" x2="780" y2="0"/><line x1="640" y1="300" x2="940" y2="0"/><line x1="0" y1="0" x2="300" y2="300"/><line x1="220" y1="0" x2="520" y2="300"/><line x1="440" y1="0" x2="740" y2="300"/><line x1="660" y1="0" x2="960" y2="300"/></g><circle cx="480" cy="140" r="5" fill="#94D0FF"/><circle cx="700" cy="140" r="4" fill="#42CF91"/>`,
    },
    {
      id: "b18",
      name: "Nocturne Violet",
      category: "Celestial",
      theme: "dark",
      description: "Matte midnight charcoal swept by twin soft-violet starfield arcs.",
      bgA: "#140F20",
      bgB: "#0E0C17",
      bgC: "#06060A",
      accent: "#A78BFA",
      accentRgba: "rgba(167, 139, 250, 0.38)",
      motif: `<path d="M-40,260 Q360,20 990,175" fill="none" stroke="#C4B5FD" stroke-opacity="0.45" stroke-width="1.6"/><path d="M-40,295 Q380,68 990,210" fill="none" stroke="#8B5CF6" stroke-opacity="0.28" stroke-width="1.1"/><circle cx="310" cy="116" r="3" fill="#EDE9FE"/><circle cx="545" cy="96" r="3.6" fill="#C4B5FD"/><circle cx="790" cy="142" r="2.6" fill="#E8EDF2"/>`,
    },
    {
      id: "b19",
      name: "Carbon Weave",
      category: "Obsidian",
      theme: "dark",
      description: "Architectural matte carbon chevron planes with quiet silver edge highlights.",
      bgA: "#15171B",
      bgB: "#0E1014",
      bgC: "#07080A",
      accent: "#94A3B8",
      accentRgba: "rgba(148, 163, 184, 0.3)",
      motif: `<g fill="none" stroke="#CAD3DC" stroke-opacity="0.2" stroke-width="1.2"><polyline points="80,260 220,120 360,260"/><polyline points="260,260 400,120 540,260"/><polyline points="440,260 580,120 720,260"/><polyline points="620,260 760,120 900,260"/></g><polyline points="440,220 580,80 720,220" fill="none" stroke="#E8EDF2" stroke-opacity="0.42" stroke-width="1.6"/>`,
    },
    {
      id: "b20",
      name: "Paper Blueprint",
      category: "Atelier Light",
      theme: "light",
      description: "Drafting cream studio sheet overlaid with fine slate-blue compass rings.",
      bgA: "#FAF6EE",
      bgB: "#EFE8DA",
      bgC: "#E2D8C5",
      accent: "#3B5D7D",
      accentRgba: "rgba(59, 93, 125, 0.38)",
      motif: `<g stroke="#3B5D7D" stroke-opacity="0.24" stroke-width="1" fill="none"><circle cx="290" cy="150" r="95"/><circle cx="290" cy="150" r="145" stroke-dasharray="6 5"/><line x1="290" y1="20" x2="290" y2="280"/><line x1="120" y1="150" x2="840" y2="150"/><rect x="520" y="70" width="260" height="160" rx="4"/></g><circle cx="290" cy="150" r="4" fill="#2D4A66"/>`,
    },
    {
      id: "b21",
      name: "Monsoon Horizon",
      category: "Atmospheric",
      theme: "dark",
      description: "Slate storm clouds parting over calm nocturnal waters with fine silver vectors.",
      bgA: "#0E1621",
      bgB: "#182433",
      bgC: "#080C12",
      accent: "#93C5FD",
      accentRgba: "rgba(147, 197, 253, 0.36)",
      motif: `<line x1="0" y1="205" x2="960" y2="205" stroke="#93C5FD" stroke-opacity="0.35" stroke-width="1.2"/><g stroke="#BFDBFE" stroke-opacity="0.22" stroke-width="1"><line x1="180" y1="30" x2="140" y2="185"/><line x1="340" y1="20" x2="300" y2="185"/><line x1="510" y1="35" x2="470" y2="185"/><line x1="690" y1="25" x2="650" y2="185"/><line x1="830" y1="40" x2="790" y2="185"/></g><rect x="0" y="205" width="960" height="95" fill="#0A111A" fill-opacity="0.65"/>`,
    },
    {
      id: "b22",
      name: "Quantum Wave",
      category: "Quant Grid",
      theme: "dark",
      description: "Harmonic dual-phase analytical sine waves oscillating over deep navy.",
      bgA: "#07101C",
      bgB: "#0D1B2E",
      bgC: "#06080E",
      accent: "#38BDF8",
      accentRgba: "rgba(56, 189, 248, 0.4)",
      motif: `<path d="M0,150 Q120,45 240,150 T480,150 T720,150 T960,150" fill="none" stroke="#38BDF8" stroke-opacity="0.56" stroke-width="1.8"/><path d="M0,150 Q120,255 240,150 T480,150 T720,150 T960,150" fill="none" stroke="#C4B5FD" stroke-opacity="0.4" stroke-width="1.4"/><line x1="0" y1="150" x2="960" y2="150" stroke="#E8EDF2" stroke-opacity="0.16" stroke-width="1"/>`,
    },
    {
      id: "b23",
      name: "Copper Dusk",
      category: "Obsidian",
      theme: "dark",
      description: "Smoked bronze and matte obsidian architectural folds with warm rim accents.",
      bgA: "#1D1410",
      bgB: "#120D0B",
      bgC: "#070708",
      accent: "#FB923C",
      accentRgba: "rgba(251, 146, 60, 0.36)",
      motif: `<polygon points="0,300 320,75 640,300" fill="#2A1C15" fill-opacity="0.62" stroke="#FDBA74" stroke-opacity="0.34" stroke-width="1.3"/><polygon points="360,300 690,55 960,260 960,300" fill="#1F1510" fill-opacity="0.72" stroke="#FB923C" stroke-opacity="0.4" stroke-width="1.3"/>`,
    },
    {
      id: "b24",
      name: "Silk Alabaster",
      category: "Atelier Light",
      theme: "light",
      description: "Pearl ivory and soft lilac-silver contour waves in calm studio lighting.",
      bgA: "#FBF9FC",
      bgB: "#EFEAF5",
      bgC: "#DFD7EA",
      accent: "#6D5D87",
      accentRgba: "rgba(109, 93, 135, 0.38)",
      motif: `<path d="M-20,90 C220,165 440,35 690,115 C830,160 910,115 980,90" fill="none" stroke="#7C6A96" stroke-opacity="0.42" stroke-width="1.5"/><path d="M-20,155 C240,225 470,95 720,180 C845,220 920,175 980,155" fill="none" stroke="#6D5D87" stroke-opacity="0.34" stroke-width="1.3"/><path d="M-20,220 C260,275 510,165 760,240 C860,270 930,235 980,220" fill="none" stroke="#8B7BA3" stroke-opacity="0.26" stroke-width="1.1"/>`,
    },
    {
      id: "b25",
      name: "Polaris Grid",
      category: "Celestial",
      theme: "dark",
      description: "Calibrated polar coordinate rings anchored on a luminous North Star node.",
      bgA: "#090F1A",
      bgB: "#111C2D",
      bgC: "#06090F",
      accent: "#94D0FF",
      accentRgba: "rgba(148, 208, 255, 0.4)",
      motif: `<g stroke="#94D0FF" stroke-opacity="0.26" fill="none" stroke-width="1"><circle cx="720" cy="135" r="50"/><circle cx="720" cy="135" r="105"/><circle cx="720" cy="135" r="165"/><circle cx="720" cy="135" r="230"/><line x1="460" y1="135" x2="960" y2="135"/><line x1="720" y1="0" x2="720" y2="300"/></g><circle cx="720" cy="135" r="5" fill="#E8EDF2"/>`,
    },
    {
      id: "b26",
      name: "Alpine Shadow",
      category: "Atmospheric",
      theme: "dark",
      description: "Monochrome obsidian mountain summits resting under a quiet crescent moon.",
      bgA: "#0E1218",
      bgB: "#161D27",
      bgC: "#07090D",
      accent: "#E8EDF2",
      accentRgba: "rgba(232, 237, 242, 0.34)",
      motif: `<circle cx="775" cy="72" r="24" fill="#E8EDF2" fill-opacity="0.82"/><circle cx="786" cy="66" r="22" fill="#131922"/><path d="M0,240 L175,135 L335,205 L515,105 L685,195 L835,142 L960,192 L960,300 L0,300 Z" fill="#0B0E14"/><path d="M0,240 L175,135 L335,205 L515,105 L685,195 L835,142 L960,192" fill="none" stroke="#CAD3DC" stroke-opacity="0.38" stroke-width="1.3"/>`,
    },
    {
      id: "b27",
      name: "Emerald Pulse",
      category: "Quant Grid",
      theme: "dark",
      description: "Clean green market waveform crossing a restrained institutional grid.",
      bgA: "#08120F",
      bgB: "#0D1A16",
      bgC: "#060809",
      accent: "#42CF91",
      accentRgba: "rgba(66, 207, 145, 0.42)",
      motif: `<g stroke="#42CF91" stroke-opacity="0.12" stroke-width="1"><line x1="0" y1="75" x2="960" y2="75"/><line x1="0" y1="150" x2="960" y2="150"/><line x1="0" y1="225" x2="960" y2="225"/></g><polyline points="0,185 160,185 240,162 320,198 410,108 495,165 595,88 685,140 790,72 960,115" fill="none" stroke="#42CF91" stroke-opacity="0.72" stroke-width="2.1"/><circle cx="790" cy="72" r="4.5" fill="#6EE7B7"/>`,
    },
    {
      id: "b28",
      name: "Obsidian Prism",
      category: "Obsidian",
      theme: "dark",
      description: "Smoked obsidian crystal facets catching a single silver refraction beam.",
      bgA: "#13161C",
      bgB: "#0B0D11",
      bgC: "#050608",
      accent: "#E2E8F0",
      accentRgba: "rgba(226, 232, 240, 0.34)",
      motif: `<line x1="0" y1="185" x2="430" y2="145" stroke="#E8EDF2" stroke-opacity="0.45" stroke-width="1.5"/><line x1="535" y1="145" x2="960" y2="95" stroke="#94D0FF" stroke-opacity="0.42" stroke-width="1.3"/><line x1="535" y1="155" x2="960" y2="155" stroke="#C4B5FD" stroke-opacity="0.34" stroke-width="1.2"/><line x1="535" y1="165" x2="960" y2="215" stroke="#42CF91" stroke-opacity="0.34" stroke-width="1.2"/><polygon points="480,46 575,230 385,230" fill="#171C24" fill-opacity="0.82" stroke="#E8EDF2" stroke-opacity="0.48" stroke-width="1.5"/>`,
    },
    {
      id: "b29",
      name: "Zenith Lavender",
      category: "Celestial",
      theme: "dark",
      description: "Sweeping concentric lavender-silver orbital rings centered on deep charcoal.",
      bgA: "#14111E",
      bgB: "#1B1629",
      bgC: "#08080D",
      accent: "#C4B5FD",
      accentRgba: "rgba(196, 181, 253, 0.42)",
      motif: `<ellipse cx="260" cy="240" rx="420" ry="155" fill="none" stroke="#C4B5FD" stroke-opacity="0.38" stroke-width="1.5"/><ellipse cx="260" cy="240" rx="300" ry="110" fill="none" stroke="#DDD6FE" stroke-opacity="0.26" stroke-width="1.1" stroke-dasharray="7 5"/><circle cx="602" cy="148" r="14" fill="#1F1933" stroke="#C4B5FD" stroke-opacity="0.65" stroke-width="1.4"/><circle cx="598" cy="144" r="3" fill="#F5F3FF"/>`,
    },
    {
      id: "b30",
      name: "Sandstone Dune",
      category: "Atmospheric",
      theme: "dark",
      description: "Sculpted nocturnal desert dune ridges lit by pale moonlight silver.",
      bgA: "#171412",
      bgB: "#221C18",
      bgC: "#090807",
      accent: "#D6C7B2",
      accentRgba: "rgba(214, 199, 178, 0.36)",
      motif: `<path d="M0,195 Q240,120 490,185 T960,155 L960,300 L0,300 Z" fill="#2A221C" fill-opacity="0.72"/><path d="M0,235 Q280,175 560,228 T960,205 L960,300 L0,300 Z" fill="#15110E" fill-opacity="0.9"/><path d="M0,195 Q240,120 490,185 T960,155" fill="none" stroke="#E5DAC8" stroke-opacity="0.36" stroke-width="1.4"/><circle cx="780" cy="68" r="16" fill="#E5DAC8" fill-opacity="0.75"/>`,
    },
  ];

  return seeds.map((s) => {
    const svg = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg_${s.id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${s.bgA}"/>
      <stop offset="52%" stop-color="${s.bgB}"/>
      <stop offset="100%" stop-color="${s.bgC}"/>
    </linearGradient>
  </defs>
  <rect width="960" height="300" fill="url(#bg_${s.id})"/>
  ${s.motif}
</svg>`);
    const isLight = s.theme === "light";
    return {
      id: s.id,
      name: s.name,
      legacyName: s.name,
      category: s.category,
      theme: s.theme,
      description: s.description,
      artworkDataUrl: svg,
      gradient: `url("${svg}"), linear-gradient(135deg, ${s.bgA} 0%, ${s.bgB} 52%, ${s.bgC} 100%)`,
      accentLine: s.accentRgba,
      safeZoneScrim: isLight
        ? "linear-gradient(180deg, rgba(12, 16, 24, 0.16) 0%, rgba(12, 16, 24, 0.74) 100%)"
        : "linear-gradient(180deg, rgba(7, 8, 12, 0.12) 0%, rgba(7, 8, 12, 0.66) 100%)",
      badgeBg: isLight ? "rgba(12, 16, 24, 0.84)" : "rgba(10, 13, 20, 0.82)",
      badgeText: "#E8EDF2",
    };
  });
}

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

// ============================================================================
// DISTINCT CURATED PORTFOLIO BACKDROP LIBRARY (p01–p08)
// Visually separate from Profile cover banners (b01–b08) and persisted independently.
// ============================================================================

export const DEFAULT_PORTFOLIO_BACKDROP_ID = "p01";

const P01_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="pbg1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0A1019"/>
      <stop offset="55%" stop-color="#111824"/>
      <stop offset="100%" stop-color="#07080B"/>
    </linearGradient>
    <linearGradient id="parc1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#76C0FF" stop-opacity="0.06"/>
      <stop offset="50%" stop-color="#76C0FF" stop-opacity="0.46"/>
      <stop offset="100%" stop-color="#94D0FF" stop-opacity="0.08"/>
    </linearGradient>
  </defs>
  <rect width="960" height="300" fill="url(#pbg1)"/>
  <path d="M-40,250 Q260,70 520,175 T1000,90" fill="none" stroke="url(#parc1)" stroke-width="2"/>
  <path d="M-40,285 Q300,120 560,210 T1000,140" fill="none" stroke="#76C0FF" stroke-opacity="0.24" stroke-width="1.2"/>
  <circle cx="520" cy="175" r="3.5" fill="#94D0FF" fill-opacity="0.8"/>
  <circle cx="770" cy="132" r="2.4" fill="#E8EDF2" fill-opacity="0.7"/>
</svg>`);

const P02_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="pbg2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#101319"/>
      <stop offset="50%" stop-color="#171C24"/>
      <stop offset="100%" stop-color="#080A0D"/>
    </linearGradient>
  </defs>
  <rect width="960" height="300" fill="url(#pbg2)"/>
  <path d="M0,215 L220,155 L460,192 L720,120 L960,162 L960,300 L0,300 Z" fill="#1B2432" fill-opacity="0.75"/>
  <path d="M0,248 L260,202 L510,235 L780,176 L960,212 L960,300 L0,300 Z" fill="#0F141D" fill-opacity="0.9"/>
  <path d="M0,215 L220,155 L460,192 L720,120 L960,162" fill="none" stroke="#76C0FF" stroke-opacity="0.42" stroke-width="1.5"/>
</svg>`);

const P03_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <rect width="960" height="300" fill="#090C11"/>
  <g stroke="#76C0FF" stroke-opacity="0.14" stroke-width="1">
    <path d="M0,60 L960,60 M0,120 L960,120 M0,180 L960,180 M0,240 L960,240"/>
    <path d="M120,0 L120,300 M240,0 L240,300 M360,0 L360,300 M480,0 L480,300 M600,0 L600,300 M720,0 L720,300 M840,0 L840,300"/>
  </g>
  <polyline points="120,240 240,180 360,180 480,120 600,145 720,85 840,60" fill="none" stroke="#76C0FF" stroke-opacity="0.58" stroke-width="2"/>
  <circle cx="720" cy="85" r="4" fill="#94D0FF"/>
  <circle cx="840" cy="60" r="4" fill="#6EE7B7"/>
</svg>`);

const P04_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="pbg4" cx="80%" cy="24%" r="85%">
      <stop offset="0%" stop-color="#1E2942"/>
      <stop offset="50%" stop-color="#0F1524"/>
      <stop offset="100%" stop-color="#07090F"/>
    </radialGradient>
  </defs>
  <rect width="960" height="300" fill="url(#pbg4)"/>
  <line x1="0" y1="196" x2="960" y2="196" stroke="#76C0FF" stroke-opacity="0.38" stroke-width="1.4"/>
  <circle cx="760" cy="196" r="92" fill="none" stroke="#94D0FF" stroke-opacity="0.28" stroke-width="1.3"/>
  <circle cx="760" cy="196" r="142" fill="none" stroke="#76C0FF" stroke-opacity="0.14" stroke-width="1"/>
</svg>`);

const P05_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="pbg5" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#071311"/>
      <stop offset="55%" stop-color="#0C211C"/>
      <stop offset="100%" stop-color="#070A0B"/>
    </linearGradient>
  </defs>
  <rect width="960" height="300" fill="url(#pbg5)"/>
  <path d="M-20,90 C220,140 420,40 680,115 C800,150 900,110 980,85" fill="none" stroke="#6EE7B7" stroke-opacity="0.35" stroke-width="1.5"/>
  <path d="M-20,155 C240,210 460,95 720,175 C830,208 910,168 980,142" fill="none" stroke="#34D399" stroke-opacity="0.26" stroke-width="1.3"/>
  <path d="M-20,220 C260,265 490,165 760,232 C855,255 925,222 980,200" fill="none" stroke="#6EE7B7" stroke-opacity="0.18" stroke-width="1.1"/>
</svg>`);

const P06_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <rect width="960" height="300" fill="#0B0D11"/>
  <g fill="none" stroke="#CAD3DC" stroke-opacity="0.18" stroke-width="1.2">
    <ellipse cx="260" cy="175" rx="220" ry="74"/>
    <ellipse cx="260" cy="175" rx="160" ry="52"/>
    <ellipse cx="260" cy="175" rx="102" ry="32"/>
    <ellipse cx="730" cy="125" rx="210" ry="68" stroke="#76C0FF" stroke-opacity="0.24"/>
    <ellipse cx="730" cy="125" rx="135" ry="42" stroke="#76C0FF" stroke-opacity="0.32"/>
  </g>
</svg>`);

const P07_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="pbg7" cx="30%" cy="50%" r="80%">
      <stop offset="0%" stop-color="#172742"/>
      <stop offset="52%" stop-color="#0C1422"/>
      <stop offset="100%" stop-color="#07080B"/>
    </radialGradient>
  </defs>
  <rect width="960" height="300" fill="url(#pbg7)"/>
  <circle cx="290" cy="150" r="108" fill="#07090F" stroke="#76C0FF" stroke-opacity="0.52" stroke-width="1.8"/>
  <circle cx="290" cy="150" r="144" fill="none" stroke="#94D0FF" stroke-opacity="0.2" stroke-width="1.1" stroke-dasharray="5 7"/>
  <line x1="435" y1="150" x2="900" y2="150" stroke="#76C0FF" stroke-opacity="0.22" stroke-width="1"/>
</svg>`);

const P08_SVG = svgDataUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 300" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="pbg8" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#181C22"/>
      <stop offset="55%" stop-color="#101318"/>
      <stop offset="100%" stop-color="#07080A"/>
    </linearGradient>
  </defs>
  <rect width="960" height="300" fill="url(#pbg8)"/>
  <polygon points="0,300 320,0 440,0 120,300" fill="#1F2530" fill-opacity="0.52"/>
  <polygon points="480,300 780,0 910,0 610,300" fill="#182130" fill-opacity="0.46"/>
  <line x1="320" y1="0" x2="0" y2="300" stroke="#CAD3DC" stroke-opacity="0.22" stroke-width="1"/>
  <line x1="780" y1="0" x2="480" y2="300" stroke="#76C0FF" stroke-opacity="0.32" stroke-width="1.2"/>
</svg>`);

export const PORTFOLIO_BACKDROP_PRESETS: readonly BannerPreset[] = Object.freeze([
  {
    id: "p01",
    name: "Carbon Meridian",
    legacyName: "Carbon Meridian",
    category: "Obsidian",
    theme: "dark",
    description: "Deep matte obsidian ledger surface with sweeping sapphire meridian arcs.",
    artworkDataUrl: P01_SVG,
    gradient: `url("${P01_SVG}"), linear-gradient(135deg, #0a1019 0%, #111824 55%, #07080b 100%)`,
    accentLine: "rgba(118, 192, 255, 0.36)",
    safeZoneScrim: "linear-gradient(180deg, rgba(7, 8, 11, 0.18) 0%, rgba(7, 8, 11, 0.72) 100%)",
    badgeBg: "rgba(10, 14, 21, 0.84)",
    badgeText: "#E8EDF2",
  },
  {
    id: "p02",
    name: "Vault Strata",
    legacyName: "Vault Strata",
    category: "Obsidian",
    theme: "dark",
    description: "Layered architectural slate planes framed by a subtle SS blue ridge.",
    artworkDataUrl: P02_SVG,
    gradient: `url("${P02_SVG}"), linear-gradient(135deg, #101319 0%, #171c24 50%, #080a0d 100%)`,
    accentLine: "rgba(118, 192, 255, 0.32)",
    safeZoneScrim: "linear-gradient(180deg, rgba(8, 10, 13, 0.16) 0%, rgba(8, 10, 13, 0.72) 100%)",
    badgeBg: "rgba(12, 15, 20, 0.84)",
    badgeText: "#E8EDF2",
  },
  {
    id: "p03",
    name: "Midnight Lattice",
    legacyName: "Midnight Lattice",
    category: "Quant Grid",
    theme: "dark",
    description: "Precision charcoal ledger grid with restrained upward signal trace.",
    artworkDataUrl: P03_SVG,
    gradient: `url("${P03_SVG}"), linear-gradient(135deg, #090c11 0%, #10151d 100%)`,
    accentLine: "rgba(118, 192, 255, 0.38)",
    safeZoneScrim: "linear-gradient(180deg, rgba(9, 12, 17, 0.16) 0%, rgba(9, 12, 17, 0.72) 100%)",
    badgeBg: "rgba(9, 12, 17, 0.86)",
    badgeText: "#E8EDF2",
  },
  {
    id: "p04",
    name: "Indigo Horizon",
    legacyName: "Indigo Horizon",
    category: "Celestial",
    theme: "dark",
    description: "Deep midnight indigo vault backdrop with calm concentric horizon arcs.",
    artworkDataUrl: P04_SVG,
    gradient: `url("${P04_SVG}"), radial-gradient(110% 90% at 80% 24%, #1e2942 0%, #0f1524 52%, #07090f 100%)`,
    accentLine: "rgba(148, 208, 255, 0.36)",
    safeZoneScrim: "linear-gradient(180deg, rgba(7, 9, 15, 0.16) 0%, rgba(7, 9, 15, 0.72) 100%)",
    badgeBg: "rgba(11, 15, 26, 0.86)",
    badgeText: "#E8EDF2",
  },
  {
    id: "p05",
    name: "Emerald Depth",
    legacyName: "Emerald Depth",
    category: "Quant Grid",
    theme: "dark",
    description: "Subtle nocturnal emerald bathymetry lines crafted for private wealth clarity.",
    artworkDataUrl: P05_SVG,
    gradient: `url("${P05_SVG}"), linear-gradient(135deg, #071311 0%, #0c211c 55%, #070a0b 100%)`,
    accentLine: "rgba(110, 231, 183, 0.34)",
    safeZoneScrim: "linear-gradient(180deg, rgba(7, 13, 12, 0.18) 0%, rgba(7, 10, 11, 0.72) 100%)",
    badgeBg: "rgba(7, 19, 17, 0.86)",
    badgeText: "#E8EDF2",
  },
  {
    id: "p06",
    name: "Basalt Topography",
    legacyName: "Basalt Topography",
    category: "Obsidian",
    theme: "dark",
    description: "Matte volcanic charcoal with quiet concentric elevation rings.",
    artworkDataUrl: P06_SVG,
    gradient: `url("${P06_SVG}"), linear-gradient(135deg, #0b0d11 0%, #141820 100%)`,
    accentLine: "rgba(202, 211, 220, 0.28)",
    safeZoneScrim: "linear-gradient(180deg, rgba(11, 13, 17, 0.16) 0%, rgba(11, 13, 17, 0.72) 100%)",
    badgeBg: "rgba(11, 13, 17, 0.86)",
    badgeText: "#E8EDF2",
  },
  {
    id: "p07",
    name: "Cobalt Eclipse",
    legacyName: "Cobalt Eclipse",
    category: "Celestial",
    theme: "dark",
    description: "Restrained dark sapphire orbital ring anchored on deep obsidian.",
    artworkDataUrl: P07_SVG,
    gradient: `url("${P07_SVG}"), radial-gradient(110% 90% at 30% 50%, #172742 0%, #0c1422 52%, #07080b 100%)`,
    accentLine: "rgba(118, 192, 255, 0.42)",
    safeZoneScrim: "linear-gradient(180deg, rgba(7, 8, 11, 0.16) 0%, rgba(7, 8, 11, 0.72) 100%)",
    badgeBg: "rgba(10, 16, 28, 0.86)",
    badgeText: "#E8EDF2",
  },
  {
    id: "p08",
    name: "Graphite Vault",
    legacyName: "Graphite Vault",
    category: "Obsidian",
    theme: "dark",
    description: "Brushed dark graphite geometric facets with clean silver-blue edge lighting.",
    artworkDataUrl: P08_SVG,
    gradient: `url("${P08_SVG}"), linear-gradient(135deg, #181c22 0%, #101318 55%, #07080a 100%)`,
    accentLine: "rgba(202, 211, 220, 0.3)",
    safeZoneScrim: "linear-gradient(180deg, rgba(10, 12, 16, 0.16) 0%, rgba(7, 8, 10, 0.72) 100%)",
    badgeBg: "rgba(12, 14, 18, 0.86)",
    badgeText: "#E8EDF2",
  },
]);

export const PORTFOLIO_BACKDROP_IDS = new Set(
  PORTFOLIO_BACKDROP_PRESETS.map((b) => b.id),
);

export function isValidPortfolioBackdropId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const key = value.trim().toLowerCase();
  return PORTFOLIO_BACKDROP_IDS.has(key) || BANNER_IDS.has(key);
}

export function resolvePortfolioBackdropPreset(
  id?: string | null,
): BannerPreset {
  const key =
    typeof id === "string"
      ? id.trim().toLowerCase()
      : DEFAULT_PORTFOLIO_BACKDROP_ID;
  const match = PORTFOLIO_BACKDROP_PRESETS.find((b) => b.id === key);
  if (match) return match;
  // Backward compatibility for accounts with legacy b01–b08 portfolio backdrop saved.
  const legacy = BANNER_PRESETS.find((b) => b.id === key);
  if (legacy) return legacy;
  return PORTFOLIO_BACKDROP_PRESETS[0];
}
