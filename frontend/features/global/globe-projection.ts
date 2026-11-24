export type GeographicFocus = { lat: number; lon: number };
export type RegionalFocus = GeographicFocus & { zoom: number };

export const MAP_ENTER_GLOBE_ZOOM = 3.4;
export const MAP_EXIT_ZOOM = 2.65;
export const MAP_START_ZOOM = 3.65;
export const RETURN_GLOBE_ZOOM = 2.55;

export function mapFocus({ lat, lon }: GeographicFocus): GeographicFocus {
  return { lat: Math.max(-85, Math.min(85, lat)), lon: ((lon + 180) % 360 + 360) % 360 - 180 };
}
