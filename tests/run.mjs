import { execFileSync } from "node:child_process";

// Each check is isolated: persistence fixtures cannot modify another test's globals.
for (const file of [
  "scripts/build-data.mjs",
  "tests/verify-data.mjs",
  "tests/verify-delivery.mjs",
  "tests/verify-panel.mjs",
  "tests/verify-macro-report.mjs",
  "tests/verify-parity.mjs",
  "tests/verify-countries.mjs",
  "tests/verify-site.mjs",
])
  execFileSync(process.execPath, [file], { stdio: "inherit" });
