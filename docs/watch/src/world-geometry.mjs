const RAD = Math.PI / 180;
const prepared = new WeakMap();
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const longitude = value => ((value + 180) % 360 + 360) % 360 - 180;

// The Android globe uses +Z at Greenwich, +X at 90 degrees east, +Y north.
export function spherePoint(lon, lat, radius = 1) {
  const a = lon * RAD, b = lat * RAD;
  return [Math.cos(b) * Math.sin(a) * radius, Math.sin(b) * radius, Math.cos(b) * Math.cos(a) * radius];
}
export function geographicPoint([x, y, z]) {
  return {lon: longitude(Math.atan2(x, z) / RAD), lat: Math.asin(clamp(y / Math.hypot(x, y, z), -1, 1)) / RAD};
}
export function rotatePoint([x, y, z], lon, lat) {
  const a = lon * RAD, b = lat * RAD;
  const u = Math.cos(a) * x - Math.sin(a) * z;
  const w = Math.sin(a) * x + Math.cos(a) * z;
  return [u, Math.cos(b) * y - Math.sin(b) * w, Math.sin(b) * y + Math.cos(b) * w];
}
export function inverseRotatePoint([x, y, z], lon, lat) {
  const a = lon * RAD, b = lat * RAD;
  const v = Math.cos(b) * y + Math.sin(b) * z;
  const w = -Math.sin(b) * y + Math.cos(b) * z;
  return [Math.cos(a) * x + Math.sin(a) * w, v, -Math.sin(a) * x + Math.cos(a) * w];
}

// nx/ny are normalized device coordinates: centre 0, left/bottom -1, right/top +1.
export function globePointAt(nx, ny, {lon = -35, lat = 18, distance = 3.3, aspect = 1, fov = 42} = {}) {
  const tangent = Math.tan(fov * RAD / 2);
  let x = nx * tangent * aspect, y = ny * tangent, z = -1;
  const length = Math.hypot(x, y, z); x /= length; y /= length; z /= length;
  const dot = distance * z;
  const discriminant = dot * dot - distance * distance + 1;
  if (discriminant < 0) return null;
  const t = -dot - Math.sqrt(discriminant);
  if (t <= 0) return null;
  return geographicPoint(inverseRotatePoint([x * t, y * t, distance + z * t], lon, lat));
}

function prepareRing(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const xs = [], ys = [];
  for (const pair of points) {
    if (!Array.isArray(pair) || !Number.isFinite(pair[0]) || !Number.isFinite(pair[1])) return null;
    xs.push(xs.length ? xs.at(-1) + longitude(pair[0] - points[xs.length - 1][0]) : pair[0]);
    ys.push(pair[1]);
  }
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return {xs, ys, minX, maxX, minY, maxY, meanX: xs.reduce((a, b) => a + b, 0) / xs.length, area: (maxX - minX) * (maxY - minY)};
}
function contains(ring, point) {
  if (!ring || point.lat < ring.minY || point.lat > ring.maxY) return false;
  const x = point.lon + 360 * Math.round((ring.meanX - point.lon) / 360);
  if (x < ring.minX || x > ring.maxX) return false;
  let inside = false;
  for (let i = 0, j = ring.xs.length - 1; i < ring.xs.length; j = i++) {
    if ((ring.ys[i] > point.lat) !== (ring.ys[j] > point.lat) &&
      x < (ring.xs[j] - ring.xs[i]) * (point.lat - ring.ys[i]) / (ring.ys[j] - ring.ys[i]) + ring.xs[i]) inside = !inside;
  }
  return inside;
}
export const ringContains = (ring, point) => contains(prepareRing(ring), point);
export function angularDistance(a, b) {
  return Math.acos(clamp(Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD) + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((a.lon - b.lon) * RAD), -1, 1));
}
export function prepareCountries(countries) {
  if (!countries || typeof countries !== 'object') return [];
  if (prepared.has(countries)) return prepared.get(countries);
  const rows = (Array.isArray(countries) ? countries : Object.entries(countries).map(([code, row]) => ({...row, code})))
    .filter(row => /^[a-z]{2}$/.test(row.code) && Number.isFinite(row.lat) && Number.isFinite(row.lon))
    .map(row => {
      const rings = Array.isArray(row.rings) ? row.rings : [];
      const shapes = rings.map(prepareRing).filter(Boolean);
      return {...row, rings, shapes, area: shapes.reduce((total, shape) => total + shape.area, 0)};
    });
  prepared.set(countries, rows); prepared.set(rows, rows);
  return rows;
}
export function countryAt(countries, point) {
  if (!point || !Number.isFinite(point.lon) || !Number.isFinite(point.lat)) return null;
  const rows = prepareCountries(countries);
  const contained = rows.filter(row => row.shapes.some(shape => contains(shape, point))).sort((a, b) => a.area - b.area);
  if (contained.length) return contained[0];
  // Countries too small for the outline dataset remain selectable at their map label.
  let nearest = null, distance = .9 * RAD;
  for (const row of rows.filter(row => !row.shapes.length)) {
    const angle = angularDistance(row, point);
    if (angle < distance) { nearest = row; distance = angle; }
  }
  return nearest;
}
export function countryDistance(country, aspect = 1) {
  const shapes = country.rings ?? [];
  const ring = shapes.find(row => ringContains(row, country)) ?? [...shapes].sort((a, b) => b.length - a.length)[0];
  const radius = clamp(ring?.reduce((maximum, [lon, lat]) => Math.max(maximum, angularDistance(country, {lon, lat})), 0) ?? RAD, RAD, 70 * RAD);
  const half = Math.min(21 * RAD, Math.atan(Math.tan(21 * RAD) * Math.max(.2, aspect))) * .82;
  return clamp(Math.cos(radius) + Math.sin(radius) / Math.tan(half), 1.05, 3.3);
}
