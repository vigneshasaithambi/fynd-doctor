// k6 load script — realistic mixed traffic
//
// Models a production-like burst:
//   - 5 analyze/min (1 every 12s per VU)
//   - 100 status polls/sec
//   - 10 pdf/min
//   - 50 report reads/min
//
// Ramped over 5 min. Asserts the system is still responsive at the end.
//
// Run via:   k6 run -e ID=fixture-report-id tests/load/mixed.js

import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    analyze: {
      executor: "constant-arrival-rate",
      rate: 5,
      timeUnit: "1m",
      duration: "5m",
      preAllocatedVUs: 5,
      exec: "doAnalyze",
    },
    status: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: 50,
      exec: "doStatus",
    },
    pdf: {
      executor: "constant-arrival-rate",
      rate: 10,
      timeUnit: "1m",
      duration: "5m",
      preAllocatedVUs: 5,
      exec: "doPdf",
    },
    report: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1m",
      duration: "5m",
      preAllocatedVUs: 5,
      exec: "doReport",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"], // ≤5% failures (allow rate-limit 429s)
    http_req_duration: ["p(95)<800"],
  },
};

const ID = __ENV.ID || "fixture-report-id";

export function doAnalyze() {
  const res = http.post(
    "http://127.0.0.1:3000/api/analyze",
    JSON.stringify({ url: "https://www.example.com" }),
    {
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": `10.44.${__VU}.1`,
      },
    },
  );
  check(res, { "no 5xx": (r) => r.status < 500 });
}

export function doStatus() {
  const res = http.get(`http://127.0.0.1:3000/api/status/${ID}`);
  check(res, { "200 or 404": (r) => r.status === 200 || r.status === 404 });
}

export function doPdf() {
  const res = http.get(`http://127.0.0.1:3000/api/pdf/${ID}`, {
    headers: { "x-forwarded-for": `10.44.${__VU}.2` },
  });
  check(res, { "no 5xx": (r) => r.status < 500 });
}

export function doReport() {
  const res = http.get(`http://127.0.0.1:3000/api/report/${ID}`);
  check(res, { "200 or 404": (r) => r.status === 200 || r.status === 404 });
}
