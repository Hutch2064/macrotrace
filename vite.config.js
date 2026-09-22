import { resolve } from "node:path";
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export default defineConfig({
  base: "./",
  define: {
    __SNAPSHOT_VERSION__: JSON.stringify(
      createHash("sha256")
        .update(
          readFileSync(new URL("./public/data/snapshot.json", import.meta.url)),
        )
        .digest("hex")
        .slice(0, 16),
    ),
  },
  build: {
    rollupOptions: {
      input: {
        report: resolve(import.meta.dirname, "index.html"),
        dashboard: resolve(import.meta.dirname, "dashboard.html"),
        sources: resolve(import.meta.dirname, "sources.html"),
      },
    },
  },
});
