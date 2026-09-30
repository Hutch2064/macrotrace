import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Execute the actual report controller with a tiny DOM, including async races.
const source = await readFile(
  new URL("../src/report.js", import.meta.url),
  "utf8",
);
const elements = new Map();
for (const id of ["#headline-metrics", "#globe-country-name"])
  elements.set(id, {
    innerHTML: "",
    textContent: "",
    dataset: {},
    attributes: {},
    setAttribute(key, value) {
      this.attributes[key] = value;
    },
    animate() {
      return { cancel() {} };
    },
  });
let pending;
const readings = new Map([
  ["USA", 3.2],
  ["FRA", 1.5],
  ["EMPTY", null],
]);
const context = vm.createContext({
  document: { querySelector: (id) => elements.get(id) },
  matchMedia: () => ({ matches: true }),
  loadHistories: async () => {
    if (pending) await pending;
  },
  countryIds: (id) => [id],
  countryReadout: (_, id) => [
    {
      label: "Inflation",
      unit: "%",
      value: readings.get(id),
      date: "2025-01-01",
      frequency: "annual",
    },
  ],
  escape: String,
  format: String,
  compact: String,
  dateLabel: String,
});
vm.runInContext(
  source.slice(source.indexOf("const charts"), source.indexOf("const reveal")) +
    `
snapshot = {};
setCountries([{id:"USA",name:"United States"},{id:"FRA",name:"France"},{id:"EMPTY",name:"Empty economy"}]);
globalThis.choose = renderCountry;
globalThis.refresh = () => renderCountry(metricCountry || country, metricLocation, Boolean(metricCountry));
`,
  context,
);
const host = elements.get("#headline-metrics");
const caption = elements.get("#globe-country-name");
await context.choose("USA");
const original = host.innerHTML;
assert.equal(host.dataset.country, "USA");
await context.choose("ATA", { id: "ATA", name: "Antarctica" });
assert.equal(caption.textContent, "Antarctica");
assert.equal(
  host.innerHTML,
  original,
  "No-data selection retains the cards exactly",
);
assert.equal(host.dataset.country, "USA");
readings.set("USA", 3.4);
await context.refresh();
assert.equal(
  caption.textContent,
  "Antarctica",
  "Refresh does not reset geographic selection",
);
assert.match(host.innerHTML, /3.4/);
await context.choose("FRA");
assert.equal(host.dataset.country, "FRA");
const france = host.innerHTML;
await context.choose("EMPTY");
assert.equal(
  host.innerHTML,
  france,
  "An empty catalog economy is also no-data",
);
let resolve;
pending = new Promise((done) => {
  resolve = done;
});
const loading = context.choose("USA");
await context.choose("ATA", { id: "ATA", name: "Antarctica" });
resolve();
await loading;
assert.equal(
  host.innerHTML,
  france,
  "A late request cannot overwrite retained cards",
);
assert.equal(host.attributes["aria-busy"], "false");
assert.equal(host.attributes["aria-label"], "Economic metrics for France");
console.log(
  "Verified no-data metric retention, refresh attribution and late-request safety.",
);
