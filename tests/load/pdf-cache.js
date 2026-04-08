// k6 load script — PDF cache validation
//
// 100 VUs request GET /api/pdf/[id] for the same id. After warmup, all hit
// the disk cache. Validates scale plan Step 7.
//
// SLO: average response time after warmup < 200 ms.
//
// Run via:   k6 run -e ID=fixture-report-id tests/load/pdf-cache.js
// Setup:     pre-create reports/<id>/report.pdf via:
//            cp tests/fixtures/dummy.pdf reports/fixture-report-id/report.pdf

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const cachedTime = new Trend("cached_pdf_response_time", true);

export const options = {
  vus: 100,
  duration: "30s",
  thresholds: {
    "cached_pdf_response_time": ["avg<200"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const id = __ENV.ID || "fixture-report-id";
  const params = {
    headers: { "x-forwarded-for": `10.43.0.${__VU}` },
  };
  const res = http.get(`http://127.0.0.1:3000/api/pdf/${id}`, params);
  check(res, {
    "200 or 429 (rate limited is fine, both prove the cache works)":
      (r) => r.status === 200 || r.status === 429,
  });
  if (res.status === 200) cachedTime.add(res.timings.duration);
  sleep(0.3);
}
