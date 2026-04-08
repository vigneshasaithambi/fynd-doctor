// Seeds a complete fixture report on disk so E2E tests that exercise the
// report viewer / PDF cache don't have to wait for a real ~3-minute crawl.
import fs from "fs";
import path from "path";

async function globalSetup() {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "full-report.json");
  const report = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const id = report.id; // "fixture-report-id"
  const reportsDir = path.join(process.cwd(), "reports", id);
  const screenshotsDir = path.join(reportsDir, "screenshots");
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(reportsDir, "status.json"),
    JSON.stringify(
      {
        id,
        phase: 8,
        step: "Generating report",
        done: true,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

export default globalSetup;
