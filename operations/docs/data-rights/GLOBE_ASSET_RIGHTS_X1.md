# X1 Earth texture provenance and rights

Verified and downloaded **17 November 2026**, 15:15–15:19 UTC. These are original NASA-hosted files, preserved byte for byte. No image generation, raster editing, resizing, recompression, recoloring or synthetic detail was performed.

| Local asset | Original dimensions / mode | Exact bytes | SHA-256 |
|---|---|---:|---|
| `public/data/earth-day.jpg` | 2048 × 1024, RGB JPEG | 266,599 | `d4dc80a6ef571939d0abe04a9bed3d3d1e6cd63e59514be1c5e43a6b069e6f1e` |
| `public/data/earth-night.jpg` | 3600 × 1800, grayscale JPEG | 365,655 | `4d2158f59123dadf0696a1cf8909c45018a1de8d0daab40da04122a5aa7f27c6` |
| `public/data/earth-clouds.jpg` | 2048 × 1024, RGB JPEG, optional | 829,367 | `daddaad84d7a33bbbc86cdda3f591099f57cee8607b7bcf3b67eb7e4f7a1c793` |
| `public/data/earth-static.jpg` | 2048 × 2048, RGB JPEG, fallback only | 536,295 | `3b47b77b49ccd18ecf0aa58610a2047cc68a2e06a1de2e224295a1346aa2dc95` |

Day plus night: **632,254 bytes**. Three interactive globe textures: **1,461,621 bytes**. All four originals: **1,997,916 bytes**. `public/data/earth-assets.json` records full provenance, capture times, dimensions, hashes, credits and HTTP modification headers. Storage modification dates are not imagery observation dates.

## Official sources and imagery dates

**Day, clouds and fallback:** [NASA's Blue Marble (2002) article](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/) supplies these original asset links:

- [Land, ocean and ice texture](https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/land_ocean_ice_2048.jpg)
- [Cloud composite](https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/cloud_combined_2048.jpg)
- [Eastern-hemisphere visualization](https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/globe_east_2048.jpg)

Land observations are from June–September 2001; the source article was published 26 May 2002. The cloud layer combines several historical observations; exact cloud-observation dates are not stated there. Credits: NASA GSFC; Reto Stöckli; Robert Simmon; MODIS and supporting USGS/NOAA data. The stored fallback is NASA's existing hemispheric visualization, not a new generated globe or a substitute for the requested interactive renderer.

**Night:** the [official Earth at Night flat-map page](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/) explicitly links the [2016 grayscale 3600 × 1800 JPEG](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144897/BlackMarble_2016_01deg_gray.jpg). The [associated NASA article](https://science.nasa.gov/earth/earth-observatory/night-light-maps-open-up-new-applications-90008/), published 13 April 2017, credits Joshua Stevens and Suomi NPP VIIRS data from Miguel Román, NASA GSFC. This is a processed **2016 historical composite**, not present-day activity.

## Use basis and attribution

The current [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) cover factual informational use of NASA imagery and 3D texture material, with source acknowledgment and no implied endorsement. Third-party copyrighted exceptions remain separate. No such exception was identified for these assets on the reviewed product/credit pages; this is not a claim of NASA's specific review or approval of Strategic Souls.

No NASA insignia, logo, person likeness or promotional endorsement is included in these textures. Keep attribution available in the globe's source/About disclosure. Suggested text:

> Earth textures include NASA source material: Blue Marble (2002) and Black Marble (2016). Rendering by Strategic Souls. No NASA endorsement.

Always disclose **historical composites**. Cloud movement, lighting and night illumination in the app are visual rendering; they must not imply current weather, current city activity, market activity or a live satellite feed. Any future promotional/merchandise use needs a fresh policy assessment.

## Verification and renderer handoff

Transfers used HTTPS directly to `assets.science.nasa.gov`, with unchanged final URLs and matching declared transfer sizes. Pillow verified JPEG integrity/dimensions without saving a transformed image; the three maps were visually inspected as global textures. Disk hashes were checked again against the manifest.

The lead owns GPU monochrome grading, lighting, texture sampling and device adaptation. Runtime `createImageBitmap` resolution adaptation does not alter the stored originals. Use cloud luminance as a mask; the original is JPEG without alpha. The night map is non-power-of-two at source, so the renderer must respect device texture limits and WebGL sampling rules. Keep the optional 829 KB cloud map off constrained-mobile and initial-content paths. Load the 536 KB fallback only when needed, label it a static view, and retain the exchange list for interaction.

No business logic, CSS, renderer, market source, database or deployment changes were made by this asset task.
