// Bootstrap script injected via page.evaluateOnNewDocument BEFORE navigation.
// Captures Core Web Vitals + a TBT proxy by hooking PerformanceObserver as early
// as possible and stashes the result on window.__lhLite for the host script to
// read after load.
//
// Notes on accuracy:
// - LCP: last largest-contentful-paint entry before user input.
// - CLS: sum of layout-shift entry values where hadRecentInput=false.
// - FCP: first paint entry of type 'first-contentful-paint'.
// - TTFB: navigation entry's responseStart (relative to navigationStart).
// - TBT proxy: sum of (longtask.duration - 50) for all long tasks captured
//   between FCP and load. Real TBT ends at TTI which we don't compute, so this
//   is a slight over-count for slow sites — acceptable for a heuristic.

export const OBSERVER_BOOTSTRAP = `
(() => {
  if (window.__lhLite) return;
  const state = {
    lcp: 0,
    cls: 0,
    fcp: 0,
    ttfb: 0,
    longTaskTotal: 0,
    longTaskCount: 0,
  };
  window.__lhLite = state;

  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) state.lcp = last.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) state.cls += entry.value || 0;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') state.fcp = entry.startTime;
      }
    }).observe({ type: 'paint', buffered: true });
  } catch (e) {}

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const over = (entry.duration || 0) - 50;
        if (over > 0) {
          state.longTaskTotal += over;
          state.longTaskCount += 1;
        }
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch (e) {}

  // TTFB from the navigation entry — captured once it exists.
  const grabNav = () => {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) state.ttfb = nav.responseStart;
  };
  if (document.readyState === 'complete') grabNav();
  else window.addEventListener('load', grabNav);
})();
`;
