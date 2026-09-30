import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

class MockEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const callbacks = this.listeners.get(type) || new Set();
    callbacks.add(listener);
    this.listeners.set(type, callbacks);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    for (const listener of [...(this.listeners.get(event.type) || [])])
      listener.call(this, event);
    return true;
  }

  listenerCount() {
    return [...this.listeners.values()].reduce(
      (count, listeners) => count + listeners.size,
      0,
    );
  }
}

class MockElement extends MockEventTarget {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.id = "";
    this.className = "";
    this.dataset = {};
    this.attributes = new Map();
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      },
    };
    this._text = "";
    this.classList = {
      add: (...names) => {
        const current = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => current.add(name));
        this.className = [...current].join(" ");
      },
      remove: (...names) => {
        const remove = new Set(names);
        this.className = this.className
          .split(/\s+/)
          .filter((name) => name && !remove.has(name))
          .join(" ");
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  set textContent(value) {
    this._text = String(value ?? "");
  }

  get textContent() {
    return (
      this._text || this.children.map((child) => child.textContent).join("")
    );
  }

  set innerText(value) {
    this.textContent = value;
  }

  get innerText() {
    return this.textContent;
  }

  set innerHTML(value) {
    this._text = String(value ?? "");
    this.children = [];
  }

  get innerHTML() {
    return this._text;
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === "id") this.id = text;
    if (name === "class") this.className = text;
    if (name === "role") this.role = text;
    if (name.startsWith("data-")) this.dataset[name.slice(5)] = text;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "id") this.id = "";
    if (name === "class") this.className = "";
    if (name === "role") this.role = undefined;
    if (name.startsWith("data-")) delete this.dataset[name.slice(5)];
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 120, height: 20 };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  contains(node) {
    return this === node || this.children.some((child) => child.contains(node));
  }

  querySelector(selector) {
    const selectors = selector.trim().split(/\s+/);
    const match = (node, token) => {
      if (token.startsWith("#")) return node.id === token.slice(1);
      if (token.startsWith(".")) return node.classList.contains(token.slice(1));
      const role = token.match(/^\[role=["']?([^\]"']+)["']?\]$/);
      return Boolean(role && node.getAttribute("role") === role[1]);
    };
    const descendants = (node) =>
      node.children.flatMap((child) => [child, ...descendants(child)]);
    let candidates = [this, ...descendants(this)];
    for (const token of selectors) {
      candidates = candidates.filter((node) => match(node, token));
      if (token !== selectors.at(-1))
        candidates = candidates.flatMap((node) => [node, ...descendants(node)]);
    }
    return candidates[0] || null;
  }
}

class MockDocument extends MockEventTarget {
  constructor() {
    super();
    this.hidden = false;
    this.body = new MockElement("body");
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }
}

class MockCanvas extends MockElement {
  constructor() {
    super("canvas");
    this.clientWidth = 400;
    this.clientHeight = 400;
    this.width = 0;
    this.height = 0;
    this.pointerCapture = new Set();
    this.pathPoints = [];
    const gradient = () => ({ addColorStop() {} });
    const methods = {
      beginPath() {},
      closePath() {},
      moveTo: (x, y) => this.pathPoints.push([x, y]),
      lineTo: (x, y) => this.pathPoints.push([x, y]),
      stroke() {},
      fill() {},
      clearRect() {},
      fillRect() {},
      arc() {},
      setTransform() {},
      createRadialGradient: gradient,
    };
    this.context = new Proxy(methods, {
      get(target, property) {
        if (!(property in target)) target[property] = () => {};
        return target[property];
      },
    });
  }

  getContext(type) {
    return type === "2d" ? this.context : null;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 400, height: 400 };
  }

  setPointerCapture(pointerId) {
    this.pointerCapture.add(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.pointerCapture.delete(pointerId);
  }
}

const radians = Math.PI / 180;
const width = 400;
const height = 400;
const radius = 172;
function screenPoint(lon, lat, yawDegrees = -90, pitchDegrees = 24) {
  const a = lon * radians;
  const b = lat * radians;
  const x = Math.cos(b) * Math.sin(a);
  const y = Math.sin(b);
  const z = Math.cos(b) * Math.cos(a);
  const yaw = yawDegrees * radians;
  const pitch = pitchDegrees * radians;
  const rx = x * Math.cos(yaw) - z * Math.sin(yaw);
  const rz = x * Math.sin(yaw) + z * Math.cos(yaw);
  const ry = y * Math.cos(pitch) - rz * Math.sin(pitch);
  return [width / 2 + rx * radius, height / 2 - ry * radius];
}

function box(left, right, bottom = -2, top = 2) {
  return [
    [
      [
        [left, bottom],
        [right, bottom],
        [right, top],
        [left, top],
        [left, bottom],
      ],
    ],
  ];
}

const countries = [
  {
    id: "AAA",
    economicId: "ECON-AAA",
    name: "Alpha",
    lon: -92,
    lat: 0,
  },
  {
    id: "BBB",
    economicId: "ECON-BBB",
    name: "Beta",
    lon: -88,
    lat: 0,
  },
  {
    id: "CCC",
    economicId: "ECON-CCC",
    name: "Tiny Island",
    lon: -70,
    lat: 20,
  },
  {
    id: "DDD",
    economicId: "ECON-DDD",
    name: "Date Line",
    lon: 180,
    lat: 0,
  },
  {
    id: "CENTER",
    economicId: "ECON-CENTER",
    name: "Center Water Pin",
    lon: 0,
    lat: 0,
  },
];
const map = {
  countries: countries.slice(0, 4).map((country, index) => ({
    ...country,
    polygons:
      index === 0
        ? box(-94, -90)
        : index === 1
          ? box(-90, -86)
          : index === 2
            ? box(-70.2, -69.8, 19.8, 20.2)
            : box(179, -179, -2, 2),
  })),
};

const document = new MockDocument();
const window = new MockEventTarget();
window.matchMedia = () => media;
window.setInterval = () => 1;
globalThis.document = document;
globalThis.window = window;
globalThis.innerWidth = 400;
globalThis.devicePixelRatio = 1;
globalThis.matchMedia = () => media;
const media = new MockEventTarget();
media.matches = false;

let nextFrame = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextFrame;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
window.requestAnimationFrame = globalThis.requestAnimationFrame;
window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
const runFrame = (time = 1000) => {
  const entry = frames.entries().next().value;
  if (!entry) return false;
  frames.delete(entry[0]);
  entry[1](time);
  return true;
};

const observers = [];
globalThis.ResizeObserver = class {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    observers.push(this);
  }

  observe() {
    this.callback([{}]);
  }

  disconnect() {
    this.disconnected = true;
  }
};
globalThis.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback;
    this.kind = "intersection";
    this.disconnected = false;
    observers.push(this);
  }

  observe() {
    this.callback([{ isIntersecting: true }]);
  }

  disconnect() {
    this.disconnected = true;
  }
};
globalThis.fetch = async () =>
  new Response(JSON.stringify(map), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const { economicGlobe } = await import("../src/globe.js?verify=events");
const canvas = new MockCanvas();
const selections = [];
const readings = new Map([
  ["AAA", { available: true, value: 4.2, year: "2025", change: 1.2 }],
  ["ECON-AAA", { available: true, value: 4.2, year: "2025", change: 1.2 }],
  ["BBB", { available: false }],
  ["ECON-BBB", { available: false }],
  ["CCC", { available: false }],
  ["ECON-CCC", { available: false }],
  ["DDD", { available: false }],
  ["ECON-DDD", { available: false }],
  ["CENTER", { available: false }],
  ["ECON-CENTER", { available: false }],
]);
const api = await economicGlobe(
  canvas,
  (...args) => selections.push(args),
  readings,
  countries,
);

// Rendering remains finite at both polar clamps, including after repeated
// drags. The offscreen observer must also prevent draw/RAF work entirely.
const polarCanvas = new MockCanvas();
media.matches = true;
frames.clear();
const polarApi = await economicGlobe(
  polarCanvas,
  () => {},
  readings,
  countries,
);
const assertDiscPoints = (label) => {
  assert.ok(polarCanvas.pathPoints.length, `${label} emits path points`);
  for (const [x, y] of polarCanvas.pathPoints) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `${label} is finite`);
    assert.ok(
      Math.hypot(x - width / 2, y - height / 2) <= radius + 1,
      `${label} stays within the globe disc`,
    );
  }
};
polarApi.select("CENTER");
polarCanvas.pathPoints = [];
polarCanvas.dispatchEvent({
  type: "pointerdown",
  isPrimary: true,
  button: 0,
  pointerId: 101,
  clientX: width / 2,
  clientY: height / 2,
});
polarCanvas.dispatchEvent({
  type: "pointermove",
  pointerId: 101,
  clientX: width / 2,
  clientY: height / 2 + 400,
});
assert.ok(runFrame(1000), "south-polar render frame is runnable");
assertDiscPoints("south-polar render");
polarCanvas.dispatchEvent({
  type: "pointerup",
  pointerId: 101,
  clientX: width / 2,
  clientY: height / 2 + 400,
});
polarCanvas.pathPoints = [];
polarCanvas.dispatchEvent({
  type: "pointerdown",
  isPrimary: true,
  button: 0,
  pointerId: 102,
  clientX: width / 2,
  clientY: height / 2,
});
polarCanvas.dispatchEvent({
  type: "pointermove",
  pointerId: 102,
  clientX: width / 2,
  clientY: height / 2 - 400,
});
assert.ok(runFrame(1000), "north-polar render frame is runnable");
assertDiscPoints("north-polar render");
polarCanvas.dispatchEvent({
  type: "pointerup",
  pointerId: 102,
  clientX: width / 2,
  clientY: height / 2 - 400,
});
const polarIntersection = [...observers]
  .reverse()
  .find(
    (observer) => observer.kind === "intersection" && !observer.disconnected,
  );
assert.ok(polarIntersection);
polarIntersection.callback([{ isIntersecting: false }]);
const offscreenFrame = nextFrame;
assert.equal(frames.size, 0, "offscreen canvas has no pending RAF");
polarCanvas.dispatchEvent({
  type: "pointermove",
  clientX: width / 2,
  clientY: height / 2,
});
polarApi.select("CENTER");
assert.equal(frames.size, 0, "offscreen updates do not schedule RAF");
assert.equal(
  nextFrame,
  offscreenFrame,
  "offscreen updates do not allocate frames",
);
polarApi.destroy();
media.matches = false;

const tooltip = document.querySelector("#globe-country-tooltip");
assert.ok(tooltip, "globe tooltip is mounted in document.body");
assert.equal(tooltip.className, "globe-tooltip");
assert.equal(tooltip.getAttribute("role"), "tooltip");
const surface = tooltip.querySelector(".globe-tooltip-surface");
assert.ok(surface, "tooltip has a dedicated surface child");
assert.equal(surface.dataset.state, "closed");

// A point just inside no-data BBB is closer to AAA's pin than the old broad
// 22px pin hit area. The narrow pin radius must yield to BBB's actual polygon.
const neighboringPoint = screenPoint(-89.99, 0);
const tinyIslandPoint = screenPoint(-70, 20);
canvas.dispatchEvent({
  type: "pointermove",
  clientX: neighboringPoint[0],
  clientY: neighboringPoint[1],
});
assert.equal(canvas.title, undefined, "native canvas.title tooltip is unused");
assert.equal(tooltip.getAttribute("aria-hidden"), "false");
assert.equal(tooltip.hidden, false);
assert.equal(surface.dataset.state, "open");
assert.equal(surface.innerText, "Beta");
assert.equal(
  surface.dataset.available,
  "false",
  "no-data hover uses the authoritative availability reading",
);
assert.equal(canvas.getAttribute("aria-describedby"), tooltip.id);

// Leaving immediately closes an open tooltip and restores the hidden state.
canvas.dispatchEvent({ type: "pointerleave" });
assert.equal(surface.dataset.state, "closed");
assert.equal(tooltip.getAttribute("aria-hidden"), "true");
assert.equal(canvas.getAttribute("aria-describedby"), null);
assert.equal(
  tooltip.hidden,
  false,
  "exit animation keeps tooltip mounted until animationend",
);
surface.dispatchEvent({ type: "animationend" });
assert.equal(tooltip.hidden, true, "animationend hides a closed tooltip");
canvas.dispatchEvent({
  type: "pointermove",
  clientX: neighboringPoint[0],
  clientY: neighboringPoint[1],
});
canvas.dispatchEvent({ type: "pointerleave" });
assert.equal(surface.dataset.state, "closed", "immediate leave closes tooltip");

// Geometry remains clickable even when its reading is unavailable. The second
// callback argument is the roster object; its economic ID need not equal the
// geographic geometry ID.
canvas.dispatchEvent({
  type: "pointerdown",
  isPrimary: true,
  button: 0,
  pointerId: 1,
  clientX: neighboringPoint[0],
  clientY: neighboringPoint[1],
});
canvas.dispatchEvent({
  type: "pointerup",
  pointerId: 1,
  clientX: neighboringPoint[0],
  clientY: neighboringPoint[1],
});
assert.equal(selections.length, 1);
assert.equal(selections[0][0], "BBB");
assert.equal(selections[0][1].id, "BBB");
assert.equal(selections[0][1].name, "Beta");
assert.equal(selections[0][1].economicId, "ECON-BBB");
assert.equal(
  surface.dataset.state,
  "open",
  "a no-data click keeps its tooltip open",
);
assert.equal(surface.innerText, "Beta", "a click keeps the hit country's name");
assert.equal(tooltip.getAttribute("aria-hidden"), "false");

// A tiny no-data island remains reachable through its marker/geometry.
canvas.dispatchEvent({
  type: "pointermove",
  clientX: tinyIslandPoint[0],
  clientY: tinyIslandPoint[1],
});
assert.equal(surface.innerText, "Tiny Island");
canvas.dispatchEvent({
  type: "pointerdown",
  isPrimary: true,
  button: 0,
  pointerId: 3,
  clientX: tinyIslandPoint[0],
  clientY: tinyIslandPoint[1],
});
canvas.dispatchEvent({
  type: "pointerup",
  pointerId: 3,
  clientX: tinyIslandPoint[0],
  clientY: tinyIslandPoint[1],
});
assert.equal(selections.length, 2);
assert.equal(selections[1][0], "CCC");
assert.equal(selections[1][1].economicId, "ECON-CCC");

// Dateline polygons must not wrap into the opposite hemisphere. With reduced
// motion enabled, API selection centers the globe synchronously for a stable
// hit-test fixture.
media.matches = true;
api.select("CENTER");
const unrelatedWater = screenPoint(4, 0, 0, 0);
canvas.dispatchEvent({
  type: "pointermove",
  clientX: unrelatedWater[0],
  clientY: unrelatedWater[1],
});
assert.notEqual(surface.innerText, "Date Line");
assert.equal(surface.dataset.state, "closed");

api.select("DDD");
const datelineSide = screenPoint(179.5, 1.5, 180, 0);
canvas.dispatchEvent({
  type: "pointermove",
  clientX: datelineSide[0],
  clientY: datelineSide[1],
});
assert.equal(surface.innerText, "Date Line");
canvas.dispatchEvent({
  type: "pointerdown",
  isPrimary: true,
  button: 0,
  pointerId: 4,
  clientX: datelineSide[0],
  clientY: datelineSide[1],
});
canvas.dispatchEvent({
  type: "pointerup",
  pointerId: 4,
  clientX: datelineSide[0],
  clientY: datelineSide[1],
});
assert.equal(selections.length, 3);
assert.equal(selections[2][0], "DDD");
const pinnedCountryName = surface.innerText;
media.matches = false;
api.select("DDD");
assert.ok(runFrame(2000), "center animation frame is runnable after a click");
assert.equal(
  surface.innerText,
  pinnedCountryName,
  "center animation does not retarget a pinned tooltip",
);

// Touch gets a larger water fallback target (22px), while the mouse target is
// narrower (10px). Both still keep a real polygon ahead of the fallback.
media.matches = true;
api.select("BBB");
const nearbyWater = screenPoint(-88, 6, -88, 0);
canvas.dispatchEvent({
  type: "pointerdown",
  pointerType: "touch",
  isPrimary: true,
  button: 0,
  pointerId: 5,
  clientX: nearbyWater[0],
  clientY: nearbyWater[1],
});
canvas.dispatchEvent({
  type: "pointerup",
  pointerType: "touch",
  pointerId: 5,
  clientX: nearbyWater[0],
  clientY: nearbyWater[1],
});
assert.equal(selections.length, 4);
assert.equal(selections[3][0], "BBB");
assert.equal(surface.dataset.state, "open", "a touch tap reopens the tooltip");
canvas.dispatchEvent({ type: "pointerleave", pointerType: "touch" });
assert.equal(
  surface.dataset.state,
  "open",
  "Automatic touch leave retains the tap label",
);
document.dispatchEvent({ type: "pointerdown", target: document.body });
assert.equal(
  surface.dataset.state,
  "closed",
  "A tap outside dismisses the label",
);
assert.equal(
  surface.innerText,
  "Beta",
  "touch tap identifies the tapped country",
);
const selectionCountAfterTouch = selections.length;
canvas.dispatchEvent({
  type: "pointerdown",
  pointerType: "mouse",
  isPrimary: true,
  button: 0,
  pointerId: 6,
  clientX: nearbyWater[0],
  clientY: nearbyWater[1],
});
canvas.dispatchEvent({
  type: "pointerup",
  pointerType: "mouse",
  pointerId: 6,
  clientX: nearbyWater[0],
  clientY: nearbyWater[1],
});
assert.equal(selections.length, selectionCountAfterTouch);
media.matches = false;

// Dragging closes the tooltip and release restarts autonomous animation.
media.matches = true;
api.select("BBB");
media.matches = false;
const dragPoint = screenPoint(-89.99, 0, -88, 0);
canvas.dispatchEvent({
  type: "pointermove",
  clientX: dragPoint[0],
  clientY: dragPoint[1],
});
assert.equal(surface.dataset.state, "open");
const requestedBeforeDrag = nextFrame;
canvas.dispatchEvent({
  type: "pointerdown",
  isPrimary: true,
  button: 0,
  pointerId: 2,
  clientX: dragPoint[0],
  clientY: dragPoint[1],
});
canvas.dispatchEvent({
  type: "pointermove",
  pointerId: 2,
  clientX: dragPoint[0] + 24,
  clientY: dragPoint[1] + 4,
});
assert.equal(surface.dataset.state, "closed", "drag closes an open tooltip");
canvas.dispatchEvent({
  type: "pointerup",
  pointerId: 2,
  clientX: dragPoint[0] + 24,
  clientY: dragPoint[1] + 4,
});
assert.ok(nextFrame > requestedBeforeDrag, "drag release resumes RAF rotation");

// Programmatic selection with normal motion schedules a destination animation.
const requestedBeforeSelect = nextFrame;
api.select("CCC");
assert.ok(
  nextFrame > requestedBeforeSelect,
  "API select schedules destination motion",
);
assert.equal(selections.length, 4, "API select does not synthesize onSelect");
assert.ok(runFrame(2000), "scheduled destination RAF is runnable");

const canvasListenersBeforeDestroy = canvas.listenerCount();
assert.ok(canvasListenersBeforeDestroy > 0);
api.destroy();
assert.equal(document.querySelector("#globe-country-tooltip"), null);
assert.equal(canvas.listenerCount(), 0, "destroy removes canvas listeners");
assert.equal(window.listenerCount(), 0, "destroy removes window listeners");
assert.ok(observers.every((observer) => observer.disconnected));
assert.equal(frames.size, 0, "destroy cancels pending animation");

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
for (const [state, animation] of [
  ["open", "globe-tooltip-enter"],
  ["closed", "globe-tooltip-exit"],
]) {
  assert.match(
    styles,
    new RegExp(
      `\\.globe-tooltip-surface\\[data-state="${state}"\\][\\s\\S]*?animation: ${animation} 300ms cubic-bezier\\(0\\.215, 0\\.61, 0\\.355, 1\\) both;`,
    ),
    `${state} tooltip uses the bounded scale animation`,
  );
}
assert.match(
  styles,
  /\.globe-tooltip-surface\[data-available="false"\][\s\S]*?border-color: var\(--negative\);/,
  "no-data tooltip uses a red border",
);

// Audit every finite-coordinate unit in the real bundled map, including tiny
// islands and gray/selectable territories that are absent from the economic
// roster. Reduced motion makes each API selection center synchronously.
const realWorld = JSON.parse(
  await readFile(new URL("../public/world.json", import.meta.url)),
);
assert.equal(
  new Set(realWorld.countries.map(({ id }) => id)).size,
  realWorld.countries.length,
  "real map unit IDs are unique",
);
const realCountries = realWorld.countries.filter(
  ({ id, name, lon, lat }) =>
    id && name && Number.isFinite(lon) && Number.isFinite(lat),
);
assert.ok(realCountries.length >= 200);
globalThis.fetch = async () =>
  new Response(JSON.stringify(realWorld), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
media.matches = true;
const realCanvas = new MockCanvas();
const realSelections = [];
const realApi = await economicGlobe(
  realCanvas,
  (...args) => realSelections.push(args),
  new Map(),
  [],
);
const realTooltip = document.querySelector("#globe-country-tooltip");
const realSurface = realTooltip.querySelector(".globe-tooltip-surface");
for (const country of realCountries) {
  realApi.select(country.id);
  realCanvas.dispatchEvent({
    type: "pointermove",
    clientX: realCanvas.clientWidth / 2,
    clientY: realCanvas.clientHeight / 2,
  });
  assert.equal(
    realSurface.innerText,
    country.name,
    `${country.id}: centered hover resolves the selected map-unit name`,
  );
}
const clickCountry = realCountries[0];
realApi.select(clickCountry.id);
realCanvas.dispatchEvent({
  type: "pointerdown",
  isPrimary: true,
  button: 0,
  pointerId: 7,
  clientX: realCanvas.clientWidth / 2,
  clientY: realCanvas.clientHeight / 2,
});
realCanvas.dispatchEvent({
  type: "pointerup",
  pointerId: 7,
  clientX: realCanvas.clientWidth / 2,
  clientY: realCanvas.clientHeight / 2,
});
assert.equal(realSelections.length, 1, "real map click emits one selection");
assert.equal(realSelections[0][0], clickCountry.id);
assert.equal(realSelections[0][1].id, clickCountry.id);
assert.equal(realSelections[0][1].name, clickCountry.name);
realApi.destroy();
assert.equal(document.querySelector("#globe-country-tooltip"), null);
assert.equal(realCanvas.listenerCount(), 0);
assert.equal(frames.size, 0);

console.log(
  `Verified globe geometry hit testing, no-data selection, tooltip lifecycle/animation, drag rotation restart, API selection animation, teardown cleanup, and ${realCountries.length} real map-unit centered hover targets.`,
);
