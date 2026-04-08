// k6 load script — POST /api/analyze burst
//
// Run via:   k6 run tests/load/analyze-burst.js
// Requires:  brew install k6  (single Go binary, no service)
// Server:    npm run dev (in another shell)
//
// SLOs:
//   - p99 response time < 500 ms
//   - Zero 5xx
//   - Rate limiter returns 429 (not silently lets requests through)
//   - Browser process count never exceeds CRAWL_CONCURRENCY (verified
//     manually via `ps aux | grep -c '[H]eadless'` during the run)

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

export const options = {
  vus: 50,
  duration: "60s",
  thresholds: {
    http_req_duration: ["p(99)<500"],
    http_req_failed: ["rate<0.01"], // <1% failed (5xx); 429s are NOT failures
    "http_reqs{status:5xx}": ["count==0"],
  },
};

const status429 = new Counter("rate_limited_429");
const status200 = new Counter("accepted_200");

export default function () {
  const url = "http://127.0.0.1:3000/api/analyze";
  const payload = JSON.stringify({ url: "https://www.example.com" });
  const params = {
    headers: {
      "Content-Type": "application/json",
      // Each VU gets its own IP so we exercise the queue, not just rate limit
      "x-forwarded-for": `10.42.0.${__VU}`,
    },
  };
  const res = http.post(url, payload, params);
  check(res, {
    "status is 200 or 429": (r) => r.status === 200 || r.status === 429,
    "no 5xx": (r) => r.status < 500,
  });
  if (res.status === 429) status429.add(1);
  if (res.status === 200) status200.add(1);
  sleep(1);
}
