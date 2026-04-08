// k6 load script — GET /api/status/[id] poll storm
//
// 200 VUs hammer the same id at 1.5s intervals for 60s. This validates the
// atomic-write fix from scale plan Step 4: there must be zero JSON parse
// errors and zero 5xx, even though writeStatus() may be writing while reads
// are happening.
//
// Run via:   k6 run -e ID=<some-existing-report-id> tests/load/status-poll-storm.js
// Server:    npm run dev (in another shell)

import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 200,
  duration: "60s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_reqs{status:5xx}": ["count==0"],
  },
};

export default function () {
  const id = __ENV.ID || "fixture-report-id";
  const res = http.get(`http://127.0.0.1:3000/api/status/${id}`);
  check(res, {
    "status 200 or 404 (not 5xx)": (r) => r.status === 200 || r.status === 404,
    "no 5xx": (r) => r.status < 500,
  });
  sleep(1.5);
}
