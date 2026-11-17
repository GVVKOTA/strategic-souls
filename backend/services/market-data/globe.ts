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
