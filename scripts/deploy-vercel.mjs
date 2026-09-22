import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// Use only tracked application inputs. Never upload .env, .vercel, or other repos.
const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((path) =>
    /^(?:api\/[\w-]+\.js|src\/[\w-]+\.(?:js|css)|scripts\/build-data\.mjs|public\/(?:favicon\.svg|fonts\/[\w-]+\.(?:woff2|txt|md)|data\/(?:snapshot|version)\.json|data\/source-inventory\.(?:csv|md))|(?:index|dashboard|sources)\.html|package(?:-lock)?\.json|vite\.config\.js|vercel\.json)$/.test(
      path,
    ),
  );
const files = await Promise.all(
  paths.map(async (file) => ({ file, data: await readFile(file) })),
);
const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (process.argv.includes("--dry-run")) {
  console.log(
    JSON.stringify({
      files: paths,
      commitSha,
      bytes: files.reduce((total, { data }) => total + data.length, 0),
    }),
  );
} else {
  const {
    VERCEL_TOKEN: token,
    VERCEL_ORG_ID: teamId,
    VERCEL_PROJECT_ID: project,
  } = process.env;
  if (!token || !teamId || !project)
    throw new Error("Missing encrypted deployment configuration");
  const request = async (path, body, headers = {}) => {
    const response = await fetch(
      `https://api.vercel.com${path}?teamId=${encodeURIComponent(teamId)}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...headers,
        },
        ...(body
          ? { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }
          : {}),
        signal: AbortSignal.timeout(120000),
      },
    );
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const detail = String(
        failure.error?.message || failure.error?.code || "",
      ).replaceAll(token, "[redacted]");
      throw new Error(`Vercel ${path}: HTTP ${response.status} ${detail}`);
    }
    const result = await response.text();
    return result ? JSON.parse(result) : null;
  };
  // Content-addressed uploads keep the deployment manifest below the 10 MB limit.
  const manifest = [];
  for (let offset = 0; offset < files.length; offset += 4) {
    const uploaded = await Promise.all(
      files.slice(offset, offset + 4).map(async ({ file, data }) => {
        const content = Buffer.from(data);
        const sha = createHash("sha1").update(content).digest("hex");
        await request("/v2/files", content, {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(content.length),
          "x-vercel-digest": sha,
        });
        return { file, sha, size: content.length };
      }),
    );
    manifest.push(...uploaded);
  }
  const deployment = await request("/v13/deployments", {
    name: "macrotrace",
    project,
    target: "production",
    files: manifest,
    projectSettings: {
      framework: "vite",
      installCommand: "npm ci",
      buildCommand: "npm run build",
      outputDirectory: "dist",
    },
    meta: {
      githubCommitSha: commitSha,
      githubCommitRef: "main",
      githubRepo: "macrotrace",
      githubOrg: "Hutch2064",
    },
  });
  console.log(
    `Deployment ${deployment.id}: https://${deployment.url} (${commitSha})`,
  );
  let previousState;
  for (let attempt = 0; attempt < 45; attempt++) {
    const status = await request(`/v13/deployments/${deployment.id}`);
    if (status.readyState !== previousState)
      console.log(`Deployment state: ${status.readyState}`);
    previousState = status.readyState;
    if (status.readyState === "READY") process.exit(0);
    if (["ERROR", "CANCELED"].includes(status.readyState))
      throw new Error(`Deployment ${status.readyState}`);
    await new Promise((resolve) => setTimeout(resolve, 20000));
  }
  throw new Error("Deployment did not become ready within 15 minutes");
}
