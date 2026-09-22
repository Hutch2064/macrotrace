import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Use only tracked application inputs. Never upload .env, .vercel, or other repos.
const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((path) =>
    /^(?:api\/[\w-]+\.js|src\/[\w-]+\.(?:js|css)|public\/(?:favicon\.svg|data\/(?:snapshot|version)\.json|data\/source-inventory\.(?:csv|md))|(?:index|dashboard|sources)\.html|package(?:-lock)?\.json|vite\.config\.js|vercel\.json)$/.test(
      path,
    ),
  );
const files = await Promise.all(
  paths.map(async (file) => ({ file, data: await readFile(file, "utf8") })),
);
const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (process.argv.includes("--dry-run")) {
  console.log(
    JSON.stringify({
      files: paths,
      commitSha,
      bytes: Buffer.byteLength(JSON.stringify(files)),
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
  const request = async (path, body) => {
    const response = await fetch(
      `https://api.vercel.com${path}?teamId=${encodeURIComponent(teamId)}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(120000),
      },
    );
    if (!response.ok)
      throw new Error(`Vercel ${path}: HTTP ${response.status}`);
    return response.json();
  };
  const deployment = await request("/v13/deployments", {
    name: "macrotrace",
    project,
    target: "production",
    files,
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
