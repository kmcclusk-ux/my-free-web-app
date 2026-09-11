const { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { dirname, join } = require("node:path");
const { execFileSync } = require("node:child_process");

function sourceFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : sourceFiles(join(directory, entry.name), relative + "/");
    }
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [relative] : [];
  }).sort();
}

function checksum(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const checkOnly = process.argv.includes("--check");
const sourceDirectory = join(__dirname, "src");
const buildDirectory = join(__dirname, "build");
const manifestPath = join(buildDirectory, "artifact-manifest.json");
const previous = checkOnly ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const entries = sourceFiles(sourceDirectory).map((source) => {
  const compiled = source.replace(/\.ts$/, ".js");
  const artifact = join(buildDirectory, compiled);
  const entry = { source, compiled, sourceSha256: checksum(join(sourceDirectory, source)), sha256: checksum(artifact) };
  for (const directory of [__dirname, sourceDirectory]) {
    const destination = join(directory, compiled);
    if (checkOnly) {
      if (checksum(destination) !== entry.sha256) throw new Error("Generated artifact differs: " + compiled);
    } else {
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(artifact, destination);
    }
  }
  return entry;
});

if (checkOnly) {
  if (JSON.stringify(previous.files) !== JSON.stringify(entries)) throw new Error("Sources changed since build; rebuild before testing or releasing.");
  process.stdout.write("Generated Lambda copies and source hashes match.\n");
} else {
  let revision = process.env.GITHUB_SHA || process.env.CODEBUILD_RESOLVED_SOURCE_VERSION;
  if (!revision) {
    try {
      revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: __dirname, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      revision = "local";
    }
  }
  const manifest = { schemaVersion: 1, revision, taxYear: 2025, node: process.version, files: entries };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  process.stdout.write("Built and synchronized " + entries.length + " Lambda modules.\n");
}
