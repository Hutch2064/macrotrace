import { execFileSync } from "node:child_process";

// Each check is isolated: persistence fixtures cannot modify another test's globals.
for (const file of [
  "tests/verify-world-development.mjs",
  "tests/verify-us-macro-expansion.mjs",
  "tests/verify-international-macro-expansion.mjs",
  "tests/verify-bis-macro.mjs",
  "tests/verify-eurostat-macro.mjs",
  "tests/verify-research-macro.mjs",
  "tests/verify-imf-macro.mjs",
  "tests/verify-international-supplement.mjs",
  "tests/verify-territory-data.mjs",
  "scripts/build-data.mjs",
  "tests/verify-data.mjs",
  "tests/verify-delivery.mjs",
  "tests/verify-panel.mjs",
  "tests/verify-globe.mjs",
  "tests/verify-globe-geometry.mjs",
  "tests/verify-country-selection.mjs",
  "tests/verify-geography-search.mjs",
  "tests/verify-macro-report.mjs",
  "tests/verify-parity.mjs",
  "tests/verify-countries.mjs",
  "tests/verify-site.mjs",
])
  execFileSync(process.execPath, [file], { stdio: "inherit" });
