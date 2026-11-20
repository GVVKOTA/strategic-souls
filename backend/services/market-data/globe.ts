export type GeoPoint = { lat: number; lon: number };
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
