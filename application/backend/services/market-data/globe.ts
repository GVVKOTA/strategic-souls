export type GeoPoint = { lat: number; lon: number };

export const GLOBE_ZOOM_MIN = 1.0;
export const GLOBE_ZOOM_MAX = 5.0;
export const GLOBE_BASE_FILL = 0.86;
export const GLOBE_CAMERA_NEAR = 0.25;
export const GLOBE_CAMERA_FAR = 8.0;

export function xyz(
  { lat, lon }: GeoPoint,
  radius = 1,
): [number, number, number] {
  const a = (lat * Math.PI) / 180,
    b = (lon * Math.PI) / 180;
  return [
    Math.cos(a) * Math.sin(b) * radius,
    Math.sin(a) * radius,
    Math.cos(a) * Math.cos(b) * radius,
  ];
}

/** Approximate unit subsolar vector in Earth-fixed xyz coordinates for a UTC timestamp.
 * Used purely for illustrative day/night solar shading; not an astronomical ephemeris.
 */
export function solarDirection(at: Date | number = Date.now()): [number, number, number] {
  const ms = at instanceof Date ? at.getTime() : at;
  if (!Number.isFinite(ms)) {
    const len = Math.hypot(-0.55, 0.25, 0.8);
    return [-0.55 / len, 0.25 / len, 0.8 / len];
  }
  const date = new Date(ms);
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = (ms - startOfYear) / 86_400_000 + 1;
  const declinationDeg = 23.44 * Math.sin(((2 * Math.PI) / 365.25) * (dayOfYear - 80));
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  const subsolarLon = (12 - utcHours) * 15;
  return xyz({ lat: declinationDeg, lon: subsolarLon }, 1);
}

export function rotateToView(
  [x, y, z]: readonly [number, number, number],
  yaw: number,
  pitch: number,
): [number, number, number] {
  const c = Math.cos(yaw),
    s = Math.sin(yaw),
    p = Math.cos(pitch),
    q = Math.sin(pitch);
  const ax = c * x + s * z;
  const az = -s * x + c * z;
  return [ax, p * y - q * az, q * y + p * az];
}

export function inverseRotateFromView(
  [vx, vy, vz]: readonly [number, number, number],
  yaw: number,
  pitch: number,
): [number, number, number] {
  const p = Math.cos(pitch),
    q = Math.sin(pitch),
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  const y = p * vy + q * vz;
  const az = -q * vy + p * vz;
  const x = c * vx - s * az;
  const z = s * vx + c * az;
  return [x, y, z];
}

/** Legacy orthographic projection preserved for backward compatibility with X1 tests. */
export function project(
  point: GeoPoint,
  yaw: number,
  pitch: number,
  width: number,
  height: number,
  zoom = 1,
) {
  const [x, y, z] = xyz(point),
    a = Math.cos(yaw) * x + Math.sin(yaw) * z,
    b = -Math.sin(yaw) * x + Math.cos(yaw) * z,
    c = Math.cos(pitch) * y - Math.sin(pitch) * b,
    d = Math.sin(pitch) * y + Math.cos(pitch) * b,
    scale =
      Math.min(0.84, (0.84 * width) / height) *
      Math.min(1.35, Math.max(0.8, zoom));
  return {
    x: width / 2 + (a * height * scale) / 2,
    y: height / 2 - (c * height * scale) / 2,
    visible: d > 0,
    z: d,
  };
}

export function clampGlobeZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return GLOBE_ZOOM_MIN;
  return Math.min(GLOBE_ZOOM_MAX, Math.max(GLOBE_ZOOM_MIN, zoom));
}

export function globeCameraParams(
  zoomInput: number,
  width: number,
  height: number,
) {
  const zoom = clampGlobeZoom(zoomInput);
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const aspect = safeW / safeH;
  // Camera smoothly dollies closer from 3.20 (at 1x) down to ~1.97 (at 5x) while staying strictly outside R=1.15
  const d1 = 3.2;
  const cameraDist = 1.45 + 1.75 / Math.pow(zoom, 0.75);
  const focalBase =
    GLOBE_BASE_FILL *
    zoom *
    (Math.sqrt(d1 * d1 - 1) / (d1 - 1)) *
    (cameraDist - 1);
  // Multiplying by min(1, aspect) guarantees a perfectly circular Earth in both portrait and landscape stages
  const focalEff = focalBase * Math.min(1, aspect);
  const horizonZ = 1 / cameraDist;
  const silhouetteRadiusPx =
    ((focalEff * safeH) / 2) * (1 / Math.sqrt(cameraDist * cameraDist - 1));
  return {
    zoom,
    cameraDist,
    focalBase,
    focalEff,
    aspect,
    horizonZ,
    silhouetteRadiusPx,
  };
}

/**
 * True 3D perspective camera projection matching the X5.3 WebGL vertex shader.
 * Produces identical pixel scale on X and Y under any aspect ratio (always circular),
 * accurate horizon occlusion (z > radius / cameraDist), and high-zoom marker picking up to 5.0x.
 */
export function projectPerspective(
  point: GeoPoint,
  yaw: number,
  pitch: number,
  width: number,
  height: number,
  zoom = 1,
  radius = 1,
) {
  const cam = globeCameraParams(zoom, width, height);
  const [vx, vy, vz] = rotateToView(xyz(point, radius), yaw, pitch);
  const camDepth = Math.max(GLOBE_CAMERA_NEAR, cam.cameraDist - vz);
  const ndcX = (vx * cam.focalEff) / (camDepth * cam.aspect);
  const ndcY = (vy * cam.focalEff) / camDepth;
  const x = (ndcX + 1) * (width / 2);
  const y = (1 - ndcY) * (height / 2);
  const visible = vz > radius / cam.cameraDist;
  const inViewport =
    x >= -24 && x <= width + 24 && y >= -24 && y <= height + 24;
  return {
    x,
    y,
    z: vz,
    camDepth,
    visible,
    inViewport,
  };
}

/**
 * Inverse ray-sphere intersection: maps a CSS pixel click/tap on the 3D Globe
 * back to its geographic latitude/longitude (or null if outside the planet silhouette).
 */
export function unprojectScreenToLatLon(
  screenX: number,
  screenY: number,
  yaw: number,
  pitch: number,
  width: number,
  height: number,
  zoom = 1,
): GeoPoint | null {
  if (width <= 0 || height <= 0) return null;
  const cam = globeCameraParams(zoom, width, height);
  const ndcX = (screenX / width) * 2 - 1;
  const ndcY = 1 - (screenY / height) * 2;
  // Ray origin O = (0, 0, cameraDist), ray direction D = (rx, ry, -1)
  const rx = (ndcX * cam.aspect) / cam.focalEff;
  const ry = ndcY / cam.focalEff;
  const rz = -1;
  const a = rx * rx + ry * ry + rz * rz;
  const b = 2 * cam.cameraDist * rz; // -2 * cameraDist
  const c = cam.cameraDist * cam.cameraDist - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t <= 0) return null;
  const hitView: [number, number, number] = [
    rx * t,
    ry * t,
    cam.cameraDist + rz * t,
  ];
  const [wx, wy, wz] = inverseRotateFromView(hitView, yaw, pitch);
  const norm = Math.hypot(wx, wy, wz) || 1;
  const lat = (Math.asin(Math.max(-1, Math.min(1, wy / norm))) * 180) / Math.PI;
  const lon = (Math.atan2(wx / norm, wz / norm) * 180) / Math.PI;
  return {
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
  };
}

export function clusterVenues<T extends GeoPoint & { id: string }>(
  venues: readonly T[],
) {
  const clusters: { lat: number; lon: number; venues: T[] }[] = [];
  for (const v of venues) {
    const cluster = clusters.find(
      (c) => Math.abs(c.lat - v.lat) < 0.15 && Math.abs(c.lon - v.lon) < 0.15,
    );
    if (cluster) cluster.venues.push(v);
    else clusters.push({ lat: v.lat, lon: v.lon, venues: [v] });
  }
  return clusters;
}

export function greatCircle(a: GeoPoint, b: GeoPoint, steps = 48) {
  const u = xyz(a),
    v = xyz(b),
    dot = Math.max(
      -1,
      Math.min(
        1,
        u.reduce((s, x, i) => s + x * v[i], 0),
      ),
    ),
    angle = Math.acos(dot),
    sin = Math.sin(angle),
    out: number[] = [];
  const axis = Math.abs(u[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0],
    cross = [
      u[1] * axis[2] - u[2] * axis[1],
      u[2] * axis[0] - u[0] * axis[2],
      u[0] * axis[1] - u[1] * axis[0],
    ],
    length = Math.hypot(...cross),
    ortho = cross.map((x) => x / length);
  for (let k = 0; k <= steps; k++) {
    const t = k / steps,
      r = 1.014 + Math.sin(Math.PI * t) * 0.11;
    let p: number[];
    if (dot < -0.999999) {
      p = u.map(
        (x, j) => x * Math.cos(Math.PI * t) + ortho[j] * Math.sin(Math.PI * t),
      );
    } else if (Math.abs(sin) < 1e-8) {
      p = u.map((x, j) => x * (1 - t) + v[j] * t);
    } else {
      const ra = Math.sin((1 - t) * angle) / sin,
        rb = Math.sin(t * angle) / sin;
      p = u.map((x, j) => ra * x + rb * v[j]);
    }
    if (k === steps) p = v;
    const norm = Math.hypot(...p);
    for (let j = 0; j < 3; j++) out.push((p[j] / norm) * r);
  }
  return out;
}
