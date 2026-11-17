# Strategic Souls X1 satellite globe report

Verified source and local browser rendering on 17 November 2026. Implementation: `components/x1/globe-canvas.tsx`, `global.tsx`, `globe-visual.css`, `lib/x1/globe.ts` and `lib/x1/exchanges.ts`. No third-party 3D engine or new runtime dependency.

The renderer draws an actual 4,096-triangle WebGL sphere with directional shading, locally hosted satellite terrain, historical night lights and an optional historical cloud composite. Grayscale is computed in the shader; source raster bytes are preserved. It draws silver city nodes, selected rings and subdued geographic arcs, explicitly labelled illustrative hub connections with no capital-flow meaning. Native dragging, arrow keys, focus-or-Control wheel zoom, bounded +/- controls and reset are implemented. Ordinary page scrolling is preserved.

## Assets and rights

`public/data/earth-assets.json` records exact source pages, source/download dates, dimensions, bytes and SHA-256. Four originals total 1,997,916 bytes: day 266,599; night 365,655; cloud 829,367; fallback 536,295. Mobile uses the day/night downloads (632,254 bytes) and resizes to 1024×512 on decode; desktop uses 2048×1024 and may add clouds. Approximate texture storage is 4 MiB mobile or 24 MiB desktop before driver overhead, not measured process memory. The download size of the static fallback is separate and only requested when used.

NASA Blue Marble (2002 publication, historical 2001 observations), Black Marble (2016) and historical cloud composites are attributed under NASA's media usage guidance. They show neither current weather nor live night activity. No NASA endorsement is implied. See `GLOBE_ASSET_RIGHTS_X1.md` for primary links and credits. Natural Earth city locations are public domain and approximate city centres, not precise exchange premises.

## Venues and session truth

24 ISO-checked venue identities map to 21 clusters. Mumbai, New York and Chicago each retain separate co-located exchanges. Searchable List view includes every venue and shows the same selected venue details, official market/calendar links, IANA time zone and source-checked local time. Registry details are in `X1_GLOBE_EXCHANGE_REGISTRY.md`.

Only official NYSE/Nasdaq 2026 scheduled core-session calendars are connected, including DST, holidays and half-days. Other venues say Schedule unknown. Scheduled open does not mean real-time halt monitoring or quote connectivity. No licensed index benchmark quote is connected. The clock/session text is evaluated at the source response's server `asOf` time; it is not a continuously streaming exchange-status feed.

## Performance, motion and lifecycle

IntersectionObserver defers globe code/imagery until the card approaches the viewport. DPR is capped at 1.5; constrained devices select smaller textures and omit clouds. No mipmaps. Auto-rotation targets one turn in 80 seconds and pauses on canvas hover/drag, document hidden, off-screen and reduced motion. Reduced-motion users may explicitly press Play; reset remains immediate. The delta clamp is 1,000 ms with hidden/resume clock reset. RAF counters establish activity, not a verified screen refresh rate.

Renderer resources, pending fetches, observers, pointer/wheel/keyboard/context listeners and animation frames are cleaned on unmount/failure. Shader/buffer/texture allocation errors enter a static fallback; context restoration/retry creates a fresh canvas. Unrelated pointer IDs are ignored. NASA ImageBitmap uploads flip orientation during decode, avoiding WebGL's ignored unpack-flip behavior for ImageBitmap.

## Fallback and actual evidence

The explicit 2D compatibility route displays a genuine grayscale NASA Earth with an honest static label. Rotation/zoom/reset controls disable while the renderer is in fallback, and the searchable List remains available. Retry and restore paths are implemented; actual GPU-driver loss/low-memory recovery remains unverified. Screenshot evidence: `final-globe-desktop.jpg`, `final-globe-fallback-390.jpg`, `final-globe-list-390.jpg`.

Eight actual geometry tests pass, including antipodes, projection equivalence and registry clustering. Independent read-only review in isolated worktree at `a0f877b0bd9e102638f231ca0a39d92a72e9c7ce` found no new material defect in UV orientation, lifecycle, pointer guards, reduced motion or palette; reviewer did not claim production or physical-device verification. The earlier review history is retained in `X1_GLOBE_REVIEW.md` and superseded by this final report for renderer state.

The complete mobile page's Lighthouse run measured LCP 2.284 s, TBT 9 ms and CLS 0.003309. During an actual 188.082-second explicit-Play session, canvas counters increased 7 → 206 and yaw -1.2719 → 13.3641 radians, equivalent to an approximately 80.74-second turn. This browser was scheduling roughly one rendered frame per second; those counters are not proof of smooth physical-device FPS. The captured browser log had zero warnings/errors. `globe-active-session.json` holds the samples. Device temperature, battery draw and actual GPU memory were not measured. Physical Android and low-RAM device tests remain open.
