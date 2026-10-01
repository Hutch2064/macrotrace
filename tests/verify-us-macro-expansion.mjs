import assert from "node:assert/strict";
import { fredSeries } from "../scripts/catalog.mjs";
import { extendedFredSeries } from "../scripts/extended-macro-catalog.mjs";
import { additionalFredSeries } from "../scripts/us-macro-expansion.mjs";
import {
  canonicalMacroCategory,
  isMacroSeries,
  macroFrequencies,
} from "../scripts/macro-scope.mjs";

const existingIds = new Set(
  [...fredSeries, ...extendedFredSeries].map(([id]) => id),
);
const addedIds = new Set();

assert(
  additionalFredSeries.length >= 100 && additionalFredSeries.length <= 150,
  `Expected 100-150 useful additions; got ${additionalFredSeries.length}.`,
);

for (const spec of additionalFredSeries) {
  assert.equal(spec.length, 7, `Invalid tuple length for ${spec[0]}.`);
  const [id, name, category, unit, frequency, transform, metadata] = spec;
  assert.match(id, /^[A-Z0-9_]+$/, `Invalid FRED identifier: ${id}.`);
  assert(!existingIds.has(id), `New series duplicates an existing catalog: ${id}.`);
  assert(!addedIds.has(id), `New catalog contains duplicate identifier: ${id}.`);
  addedIds.add(id);
  assert(name && category && unit, `Incomplete tuple labels for ${id}.`);
  assert.equal(transform, "identity", `${id} must preserve source values.`);
  assert(macroFrequencies.includes(frequency), `Invalid frequency for ${id}.`);
  assert(
    isMacroSeries({ id, name, category, unit, frequency, ...metadata }),
    `Out-of-scope security or non-macro series: ${id}.`,
  );
  assert.equal(
    canonicalMacroCategory({ id, category, ...metadata }),
    category,
    `Category is not canonical for ${id}.`,
  );

  assert.equal(
    metadata.sourceUrl,
    `https://fred.stlouisfed.org/series/${id}`,
    `Source URL must identify the exact FRED series for ${id}.`,
  );
  for (const field of [
    "semantic",
    "changeType",
    "provider",
    "sourceFamily",
    "methodology",
    "nativeUnits",
    "seasonalAdjustment",
    "validationNote",
    "lastVerifiedDate",
  ]) {
    assert(metadata[field], `${id} is missing required source metadata: ${field}.`);
  }
  assert.equal(metadata.lastVerifiedDate, "2026-09-30");
  assert.match(metadata.validationNote, /FRED.*CSV.*observation/i);
  assert.match(metadata.methodology, /\S/);
  assert.match(
    `${metadata.nativeUnits} ${metadata.seasonalAdjustment}`,
    /seasonally adjusted|not seasonally adjusted|end of period/i,
    `${id} must preserve source seasonal/frequency semantics.`,
  );
  assert.doesNotMatch(
    `${id} ${name} ${metadata.provider} ${metadata.sourceFamily}`,
    /Yahoo Finance|ETF|equity index|security price|forecast|projection/i,
    `${id} looks like a security or speculative feed.`,
  );

  if (metadata.semantic === "contribution") {
    assert.equal(metadata.changeType, "points");
    assert.equal(unit, "percentage points");
  }
  if (metadata.semantic === "signed_quantity") {
    assert.equal(
      metadata.changeType,
      "points",
      `${id} is signed and must use native-point changes.`,
    );
  }
  if (metadata.sourceFamily.includes("Senior Loan Officer")) {
    assert.equal(metadata.semantic, "rate");
    assert.equal(metadata.changeType, "points");
    assert.equal(metadata.seasonalAdjustment, "Not seasonally adjusted");
  }
}

const categories = new Set(additionalFredSeries.map(([, , category]) => category));
for (const required of ["Growth", "Labor", "Credit", "Fiscal"])
  assert(categories.has(required), `Missing expansion category: ${required}.`);

console.log(
  `Verified ${additionalFredSeries.length} unique, source-backed U.S. macro additions across ${categories.size} categories.`,
);

