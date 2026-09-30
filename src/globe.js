// Orthographic spherical geometry: no WebGL runtime or animation framework.
export async function economicGlobe(
  canvas,
  onSelect,
  readings = new Map(),
  countries = [],
) {
  const context = canvas.getContext("2d");
  if (!context) return { select() {}, setReadings() {}, destroy() {} };
  const response = await fetch("./world.json");
  if (!response.ok) throw new Error("The world map could not be loaded.");
  const map = await response.json();
  const radians = Math.PI / 180;
  const economicCountries = (Array.isArray(countries) ? countries : []).filter(
    (country) => country?.id,
  );
  const economicById = new Map(
    economicCountries.map((country) => [country.id, country]),
  );
  const represented = new Set(
    map.countries.map((country) => country.economicId || country.id),
  );
  const economicPieces = new Map();
  for (const country of map.countries) {
    const id = country.economicId || country.id;
    economicPieces.set(id, (economicPieces.get(id) || 0) + 1);
  }
  const countryList = [
    ...map.countries.map((country) => ({
      ...economicById.get(country.economicId || country.id),
      ...country,
      sharedAggregate: Boolean(
        country.economicId && economicPieces.get(country.economicId) > 1,
      ),
    })),
    ...economicCountries.filter(({ id }) => !represented.has(id)),
  ];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0,
    height = 0,
    radius = 0,
    frame,
    last = 0;
  let yaw = -90 * radians,
    pitch = 24 * radians;
  let selected = countryList.some(({ id }) => id === "USA")
      ? "USA"
      : countryList[0]?.id,
    hover,
    destination,
    start,
    dragging = false,
    pointer;
  let visible = true,
    destroyed = false;
  const listeners = [];
  const listen = (target, event, callback) => {
    target.addEventListener(event, callback);
    listeners.push(() => target.removeEventListener(event, callback));
  };
  const sphere = ([lon, lat]) => {
    const a = lon * radians,
      b = lat * radians;
    return [Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)];
  };
  // Unwrap each ring continuously across the date line. A plain longitude
  // ray cast makes Russia/Fiji cover the opposite side of the Earth.
  const pickRing = (ring) => {
    let previous = ring[0]?.[0] || 0;
    const points = ring.map(([lon, lat]) => {
      const x = lon + 360 * Math.round((previous - lon) / 360);
      previous = x;
      return [x, lat];
    });
    const xs = points.map(([x]) => x),
      ys = points.map(([, y]) => y);
    return {
      points,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };
  const outlines = map.countries.map((country) => {
    const paths = country.polygons.flatMap((polygon) =>
      polygon.map((ring) => ring.map(sphere)),
    );
    return {
      ...country,
      paths,
      projected: paths.map((ring) => ring.map(() => [0, 0, 0])),
      pickPolygons: country.polygons.map((polygon) => polygon.map(pickRing)),
    };
  });
  const outlineById = new Map(outlines.map((country) => [country.id, country]));
  const countryById = new Map(
    countryList.map((country) => {
      const outline = outlineById.get(country.id);
      const lon = Number.isFinite(country.lon)
        ? country.lon
        : Number.isFinite(outline?.lon)
          ? outline.lon
          : null;
      const lat = Number.isFinite(country.lat)
        ? country.lat
        : Number.isFinite(outline?.lat)
          ? outline.lat
          : null;
      return [country.id, { ...country, lon, lat }];
    }),
  );
  const available = (id) =>
    Boolean(
      readings.get(id)?.available ||
      readings.get(countryById.get(id)?.economicId)?.available,
    );
  const tooltip = document.createElement("div");
  tooltip.id = "globe-country-tooltip";
  tooltip.className = "globe-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.hidden = true;
  const tooltipSurface = document.createElement("div");
  tooltipSurface.className = "globe-tooltip-surface";
  tooltipSurface.dataset.state = "closed";
  tooltip.append(tooltipSurface);
  document.body.append(tooltip);
  const closeTooltip = () => {
    pointer = null;
    hover = null;
    tooltip.setAttribute("aria-hidden", "true");
    canvas.removeAttribute("aria-describedby");
    tooltipSurface.dataset.state = "closed";
    canvas.style.cursor = "grab";
  };
  listen(tooltipSurface, "animationend", () => {
    if (tooltipSurface.dataset.state === "closed") tooltip.hidden = true;
  });
  const updateHover = () => {
    if (!pointer) return;
    const id = hit(pointer);
    canvas.style.cursor = id ? "pointer" : "grab";
    if (!id) {
      hover = null;
      tooltip.setAttribute("aria-hidden", "true");
      canvas.removeAttribute("aria-describedby");
      tooltipSurface.dataset.state = "closed";
      return;
    }
    hover = id;
    tooltipSurface.textContent = countryById.get(id)?.name || id;
    tooltip.hidden = false;
    tooltip.setAttribute("aria-hidden", "false");
    canvas.setAttribute("aria-describedby", tooltip.id);
    tooltipSurface.dataset.state = "open";
    const tooltipWidth = tooltipSurface.offsetWidth;
    const tooltipHeight = tooltipSurface.offsetHeight;
    const x = Math.max(
      12,
      Math.min(
        innerWidth - tooltipWidth - 12,
        pointer.clientX - tooltipWidth / 2,
      ),
    );
    const top = pointer.clientY - tooltipHeight - 8;
    tooltip.dataset.side = top >= 12 ? "top" : "bottom";
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${top >= 12 ? top : pointer.clientY + 8}px`;
    tooltip.style.setProperty("--tooltip-anchor", `${pointer.clientX - x}px`);
  };
  // Coordinates are resolved once, so rendering and hit testing do not scan
  // or repeatedly convert the full catalog roster on every animation frame.
  const pins = [...countryById.values()]
    .filter(({ lon, lat }) => Number.isFinite(lon) && Number.isFinite(lat))
    .map((country) => ({
      ...country,
      vector: sphere([country.lon, country.lat]),
    }));
  let cosYaw, sinYaw, cosPitch, sinPitch;
  const orient = () => {
    cosYaw = Math.cos(yaw);
    sinYaw = Math.sin(yaw);
    cosPitch = Math.cos(pitch);
    sinPitch = Math.sin(pitch);
  };
  const project = ([x, y, z], output = [0, 0, 0]) => {
    const rx = x * cosYaw - z * sinYaw;
    const rz = x * sinYaw + z * cosYaw;
    const ry = y * cosPitch - rz * sinPitch;
    const depth = y * sinPitch + rz * cosPitch;
    output[0] = width / 2 + rx * radius;
    output[1] = height / 2 - ry * radius;
    output[2] = depth;
    return output;
  };
  function stroke(points, color, lineWidth = 0.7, projected = false) {
    context.beginPath();
    let started = false;
    for (const point of points) {
      const [x, y, z] = projected ? point : project(point);
      if (z < 0) {
        started = false;
        continue;
      }
      if (started) context.lineTo(x, y);
      else context.moveTo(x, y);
      started = true;
    }
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.stroke();
  }
  function fill(country, color) {
    context.beginPath();
    for (const points of country.projected) {
      let previous = points.at(-1),
        started = false;
      const add = (x, y) => {
        if (started) context.lineTo(x, y);
        else {
          context.moveTo(x, y);
          started = true;
        }
      };
      for (const point of points) {
        if (point[2] >= 0 !== previous[2] >= 0) {
          const t = previous[2] / (previous[2] - point[2]);
          const x = previous[0] + t * (point[0] - previous[0]) - width / 2;
          const y = previous[1] + t * (point[1] - previous[1]) - height / 2;
          const length = Math.hypot(x, y);
          if (length)
            add(
              width / 2 + (radius * x) / length,
              height / 2 + (radius * y) / length,
            );
        }
        if (point[2] >= 0) add(point[0], point[1]);
        previous = point;
      }
      context.closePath();
    }
    context.fillStyle = color;
    context.fill("evenodd");
  }
  const grid = [];
  for (let lat = -60; lat <= 60; lat += 30)
    grid.push(Array.from({ length: 121 }, (_, i) => sphere([i * 3, lat])));
  for (let lon = 0; lon < 360; lon += 30)
    grid.push(Array.from({ length: 61 }, (_, i) => sphere([lon, -90 + i * 3])));
  function draw() {
    if (!width || destroyed) return;
    orient();
    context.clearRect(0, 0, width, height);
    const glow = context.createRadialGradient(
      width / 2,
      height / 2,
      radius * 0.6,
      width / 2,
      height / 2,
      radius * 1.25,
    );
    glow.addColorStop(0, "rgba(207,185,125,.08)");
    glow.addColorStop(1, "rgba(207,185,125,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
    const ocean = context.createRadialGradient(
      width * 0.4,
      height * 0.32,
      0,
      width / 2,
      height / 2,
      radius,
    );
    ocean.addColorStop(0, "#35352e");
    ocean.addColorStop(0.72, "#2a2a26");
    ocean.addColorStop(1, "#20201e");
    context.beginPath();
    context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    context.fillStyle = ocean;
    context.fill();
    context.strokeStyle = "rgba(207,185,125,.3)";
    context.stroke();
    for (const points of grid) stroke(points, "rgba(207,185,125,.11)");
    for (const country of outlines) {
      for (let ring = 0; ring < country.paths.length; ring++)
        for (let point = 0; point < country.paths[ring].length; point++)
          project(country.paths[ring][point], country.projected[ring][point]);
      const emphasized = country.id === selected || country.id === hover;
      const hasData = available(country.id);
      fill(country, hasData ? "rgba(207,185,125,.3)" : "rgba(183,181,169,.09)");
      for (const points of country.projected)
        stroke(
          points,
          emphasized
            ? "rgba(253,229,182,.95)"
            : hasData
              ? "rgba(207,185,125,.7)"
              : "rgba(183,181,169,.28)",
          emphasized ? 1.5 : 0.8,
          true,
        );
    }
    for (const country of pins) {
      const [x, y, z] = project(country.vector);
      if (z < 0.04) continue;
      const emphasized = country.id === selected || country.id === hover;
      const hasData = available(country.id);
      context.beginPath();
      context.arc(x, y, emphasized ? 2.2 : 0.9, 0, Math.PI * 2);
      context.fillStyle = hasData
        ? emphasized
          ? "#fde5b6"
          : "#cfb97d"
        : emphasized
          ? "#d8d7d1"
          : "#77756e";
      context.fill();
      if (emphasized) {
        context.beginPath();
        context.arc(x, y, 4.5, 0, Math.PI * 2);
        context.strokeStyle = hasData
          ? "rgba(253,229,182,.55)"
          : "rgba(216,215,209,.45)";
        context.lineWidth = 0.55;
        context.stroke();
      }
    }
  }
  function animate(time) {
    frame = undefined;
    if (destroyed || !visible || document.hidden) return;
    if (time - last >= 33) {
      if (destination) {
        const delta = Math.atan2(
          Math.sin(destination.yaw - yaw),
          Math.cos(destination.yaw - yaw),
        );
        const latitude = destination.pitch - pitch;
        yaw += delta * 0.065;
        pitch += latitude * 0.065;
        if (Math.abs(delta) + Math.abs(latitude) < 0.002) destination = null;
      } else if (!start && !reduced.matches)
        yaw += Math.min(time - last, 100) * 0.000035;
      updateHover();
      draw();
      last = time;
    }
    if (!reduced.matches || destination) frame = requestAnimationFrame(animate);
  }
  const restart = () => {
    cancelAnimationFrame(frame);
    last = performance.now();
    draw();
    if (visible && !document.hidden && !reduced.matches && !start)
      frame = requestAnimationFrame(animate);
  };
  const release = () => {
    if (!start) return;
    start = null;
    dragging = false;
    restart();
  };
  function select(id) {
    const country = countryById.get(id);
    if (!country) return;
    selected = id;
    destination =
      Number.isFinite(country.lon) && Number.isFinite(country.lat)
        ? { yaw: country.lon * radians, pitch: country.lat * radians }
        : null;
    if (!destination) {
      restart();
      return;
    }
    if (reduced.matches) {
      yaw = destination.yaw;
      pitch = destination.pitch;
      destination = null;
    }
    restart();
  }
  function hit(event) {
    orient();
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left,
      y = event.clientY - bounds.top;
    let near,
      distance = event.pointerType === "touch" ? 22 : 10;
    for (const country of pins) {
      const [cx, cy, z] = project(country.vector);
      const delta = Math.hypot(cx - x, cy - y);
      if (z >= 0.04 && delta < distance) {
        distance = delta;
        near = country.id;
      }
    }
    // Only the visible marker itself outranks a land boundary. Enlarged island
    // targets apply over water, never over an adjacent country's territory.
    if (near && distance <= 2.5) return near;
    // Invert the front hemisphere so the full country area, not only its pin, responds.
    const sx = (x - width / 2) / radius,
      sy = -(y - height / 2) / radius;
    if (sx * sx + sy * sy > 1) return;
    const depth = Math.sqrt(1 - sx * sx - sy * sy);
    const ry = sy * Math.cos(pitch) + depth * Math.sin(pitch);
    const rz = depth * Math.cos(pitch) - sy * Math.sin(pitch);
    const lon = (Math.atan2(sx, rz) + yaw) / radians;
    const point = [((lon + 540) % 360) - 180, Math.asin(ry) / radians];
    const inside = ({ points: ring, minX, maxX, minY, maxY }) => {
      const px =
        point[0] + 360 * Math.round(((minX + maxX) / 2 - point[0]) / 360);
      if (px < minX || px > maxX || point[1] < minY || point[1] > maxY)
        return false;
      let result = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[i],
          [bx, by] = ring[j];
        if (
          ay > point[1] !== by > point[1] &&
          px < ((bx - ax) * (point[1] - ay)) / (by - ay) + ax
        )
          result = !result;
      }
      return result;
    };
    return (
      outlines.find((country) =>
        country.pickPolygons.some(
          ([outer, ...holes]) => inside(outer) && !holes.some(inside),
        ),
      )?.id || near
    );
  }
  listen(canvas, "pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    closeTooltip();
    start = { x: event.clientX, y: event.clientY, yaw, pitch };
    dragging = false;
    destination = null;
    canvas.setPointerCapture(event.pointerId);
    cancelAnimationFrame(frame);
  });
  listen(canvas, "pointermove", (event) => {
    if (start) {
      const dx = event.clientX - start.x,
        dy = event.clientY - start.y;
      if (!dragging && Math.hypot(dx, dy) > 6) {
        dragging = true;
      }
      if (dragging) {
        yaw = start.yaw - dx * 0.006;
        pitch = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, start.pitch + dy * 0.006),
        );
        draw();
      }
    } else {
      if (event.pointerType === "touch") return;
      pointer = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType,
      };
      updateHover();
      draw();
    }
  });
  listen(canvas, "pointerup", (event) => {
    if (
      start &&
      !dragging &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
    ) {
      const id = hit(event);
      if (id) {
        select(id);
        onSelect(id, countryById.get(id));
      }
    }
    release();
  });
  listen(canvas, "pointercancel", () => {
    closeTooltip();
    release();
  });
  listen(canvas, "lostpointercapture", release);
  listen(window, "blur", () => {
    closeTooltip();
    release();
  });
  listen(canvas, "pointerleave", () => {
    closeTooltip();
    draw();
  });
  listen(canvas, "keydown", (event) => {
    closeTooltip();
    if (["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      destination = null;
      pitch = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, pitch + (event.key === "ArrowUp" ? -0.2 : 0.2)),
      );
      restart();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    const index = countryList.findIndex(({ id }) => id === selected);
    const next =
      countryList[
        event.key === "Home"
          ? 0
          : (index +
              (event.key === "ArrowRight" ? 1 : -1) +
              countryList.length) %
            countryList.length
      ];
    if (next) {
      select(next.id);
      onSelect(next.id, countryById.get(next.id));
    }
  });
  const resize = new ResizeObserver(() => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    radius = Math.min(width, height) * 0.43;
    const ratio = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  });
  resize.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    restart();
  });
  intersection.observe(canvas);
  listen(document, "visibilitychange", () => {
    closeTooltip();
    restart();
  });
  listen(window, "scroll", closeTooltip);
  listen(reduced, "change", restart);
  return {
    select,
    setReadings(updated) {
      readings = updated;
      draw();
    },
    destroy() {
      destroyed = true;
      closeTooltip();
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      tooltip.remove();
      listeners.forEach((remove) => remove());
    },
  };
}
