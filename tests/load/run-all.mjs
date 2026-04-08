// Sequence the four k6 scripts and print a summary table.
// Run via:  npm run test:load
// Requires: k6 in PATH (brew install k6)

import { execSync, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ID = process.env.ID || "fixture-report-id";

// Sanity check k6 is installed
try {
  execSync("k6 version", { stdio: "ignore" });
} catch {
  console.error("k6 is not installed. Install via: brew install k6");
  console.error("Or download a single binary from https://k6.io/docs/get-started/installation/");
  process.exit(1);
}

// Sanity check that the dev server is up
try {
  execSync("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/", { stdio: "pipe" });
} catch {
  console.warn("[load] Couldn't reach http://127.0.0.1:3000 — start dev server first: `npm run dev`");
}

// Pre-seed a fixture report so the status / pdf / report scripts have something to hit.
const fixturePath = path.join(here, "..", "fixtures", "full-report.json");
if (fs.existsSync(fixturePath)) {
  const report = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const reportsDir = path.join(here, "..", "..", "reports", report.id);
  fs.mkdirSync(path.join(reportsDir, "screenshots"), { recursive: true });
  fs.writeFileSync(path.join(reportsDir, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(reportsDir, "status.json"),
    JSON.stringify({
      id: report.id,
      phase: 8,
      step: "Generating report",
      done: true,
      updatedAt: new Date().toISOString(),
    }),
  );
  // Seed a fake PDF cache so pdf-cache.js exercises the cache path
  fs.writeFileSync(
    path.join(reportsDir, "report.pdf"),
    Buffer.from("%PDF-1.4\n% k6 fixture\n%%EOF"),
  );
}

const scripts = [
  { name: "analyze-burst", file: "analyze-burst.js" },
  { name: "status-poll-storm", file: "status-poll-storm.js" },
  { name: "pdf-cache", file: "pdf-cache.js" },
  { name: "mixed", file: "mixed.js" },
];

const summary = [];

for (const s of scripts) {
  console.log(`\n=== Running ${s.name} ===`);
  const t0 = Date.now();
  const res = spawnSync(
    "k6",
    ["run", "--quiet", "-e", `ID=${ID}`, path.join(here, s.file)],
    { stdio: "inherit" },
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  summary.push({ script: s.name, status: res.status === 0 ? "PASS" : "FAIL", elapsed: `${elapsed}s` });
}

console.log("\n=== Load test summary ===");
console.table(summary);

const failed = summary.filter((r) => r.status === "FAIL").length;
process.exit(failed > 0 ? 1 : 0);
