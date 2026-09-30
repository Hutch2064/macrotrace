// Display-only spherical simplification. Picking retains the full source rings.
// Every land unit and ring remains; tolerance is measured in screen pixels.
import { geoArea } from "d3-geo";

export function displayGeometry(polygons, radius) {
  const tolerance = (0.35 / Math.max(radius, 1)) ** 2;
  const simplify = (ring) => {
    if (ring.length <= 4) return ring;
    const vectors = ring.map(([lon, lat]) => {
      const a = (lon * Math.PI) / 180,
        b = (lat * Math.PI) / 180;
      return [
        Math.cos(b) * Math.cos(a),
        Math.cos(b) * Math.sin(a),
        Math.sin(b),
      ];
    });
    const keep = new Uint8Array(ring.length);
    keep[0] = keep[ring.length - 1] = 1;
    const stack = [0, ring.length - 1];
    while (stack.length) {
      const end = stack.pop(),
        start = stack.pop();
      const a = vectors[start],
        b = vectors[end];
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        dz = b[2] - a[2];
      const length = dx * dx + dy * dy + dz * dz;
      let greatest = tolerance,
        index = -1;
      for (let i = start + 1; i < end; i++) {
        const p = vectors[i];
        const t = length
          ? Math.max(
              0,
              Math.min(
                1,
                ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) /
                  length,
              ),
            )
          : 0;
        const distance =
          (p[0] - a[0] - t * dx) ** 2 +
          (p[1] - a[1] - t * dy) ** 2 +
          (p[2] - a[2] - t * dz) ** 2;
        if (distance > greatest) {
          greatest = distance;
          index = i;
        }
      }
      if (index >= 0) {
        keep[index] = 1;
        stack.push(start, index, index, end);
      }
    }
    const result = ring.filter((_, i) => keep[i]);
    // Tiny islands and holes must never collapse into lines or disappear.
    return result.length >= 4 ? result : ring;
  };
  return {
    type: "MultiPolygon",
    coordinates: polygons.map((polygon) =>
      polygon.map((ring, i) => {
        const result = simplify(ring);
        // Rounded island rings can have inconsistent winding. D3 interprets
        // reversed exteriors as the rest of Earth, so normalize each ring.
        const large =
          geoArea({ type: "Polygon", coordinates: [result] }) > Math.PI * 2;
        return large === (i === 0) ? result.toReversed() : result;
      }),
    ),
  };
}
