// DOM scrape body — exported as a raw string so bundlers (esbuild/Turbopack)
// don't inject helper symbols (e.g. `__name`) that don't exist in the browser
// context. Read by measure.ts and passed straight to page.evaluate(SCRAPE_JS).
//
// Returns:
//   {
//     lh:   { lcp, cls, fcp, ttfb, longTaskTotal },
//     seo:  { ... },
//     a11y: { ... },
//     bp:   { hasDoctype, hasCharset, imageAspectOkRatio }
//   }

export const SCRAPE_JS = `
(() => {
  var w = window;
  var lh = w.__lhLite || { lcp: 0, cls: 0, fcp: 0, ttfb: 0, longTaskTotal: 0 };

  var qsa = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var title = document.title || "";
  var metaDescEl = document.querySelector('meta[name="description"]');
  var metaDesc = metaDescEl ? (metaDescEl.content || "") : "";
  var viewport = !!document.querySelector('meta[name="viewport"]');
  var canonical = !!document.querySelector('link[rel="canonical"]');
  var lang = !!document.documentElement.getAttribute("lang");
  var robotsEl = document.querySelector('meta[name="robots"]');
  var robots = robotsEl ? (robotsEl.content || "") : "";
  var robotsAllow = !/noindex/i.test(robots);
  var h1Count = qsa("h1").length;

  var imgs = qsa("img");
  var imgWithAlt = 0;
  var imgAspectOk = 0;
  var imgAspectTotal = 0;
  for (var i = 0; i < imgs.length; i++) {
    var img = imgs[i];
    if ((img.getAttribute("alt") || "").trim().length > 0) imgWithAlt++;
    if (img.naturalWidth && img.naturalHeight && img.width && img.height) {
      imgAspectTotal++;
      var natRatio = img.naturalWidth / img.naturalHeight;
      var renderRatio = img.width / img.height;
      var delta = Math.abs(natRatio - renderRatio) / natRatio;
      if (delta < 0.1) imgAspectOk++;
    }
  }
  var imgWithAltRatio = imgs.length === 0 ? 1 : imgWithAlt / imgs.length;
  var imageAspectOkRatio = imgAspectTotal === 0 ? 1 : imgAspectOk / imgAspectTotal;

  var links = qsa("a");
  var linksWithText = 0;
  for (var j = 0; j < links.length; j++) {
    var a = links[j];
    var t = (a.textContent || "").trim();
    var aria = a.getAttribute("aria-label") || "";
    if (t.length > 0 || aria.length > 0) linksWithText++;
  }
  var linksWithTextRatio = links.length === 0 ? 1 : linksWithText / links.length;

  var rawInputs = qsa("input, select, textarea");
  var visibleInputs = [];
  for (var k = 0; k < rawInputs.length; k++) {
    var rin = rawInputs[k];
    if (rin.type !== "hidden" && rin.type !== "submit" && rin.type !== "button") {
      visibleInputs.push(rin);
    }
  }
  var inputsWithLabel = 0;
  for (var m = 0; m < visibleInputs.length; m++) {
    var inp = visibleInputs[m];
    var labeled = false;
    if (inp.getAttribute("aria-label")) labeled = true;
    else if (inp.getAttribute("aria-labelledby")) labeled = true;
    else if (inp.id && document.querySelector('label[for="' + inp.id + '"]')) labeled = true;
    else if (inp.closest && inp.closest("label")) labeled = true;
    if (labeled) inputsWithLabel++;
  }
  var inputsWithLabelRatio = visibleInputs.length === 0 ? 1 : inputsWithLabel / visibleInputs.length;

  var buttons = qsa("button, [role='button']");
  var buttonsWithName = 0;
  for (var n = 0; n < buttons.length; n++) {
    var b = buttons[n];
    var bt = (b.textContent || "").trim();
    var ba = b.getAttribute("aria-label") || "";
    var btitle = b.getAttribute("title") || "";
    if (bt.length > 0 || ba.length > 0 || btitle.length > 0) buttonsWithName++;
  }
  var buttonsWithNameRatio = buttons.length === 0 ? 1 : buttonsWithName / buttons.length;

  var hasMainLandmark = !!document.querySelector("main, [role='main']");

  var headings = qsa("h1,h2,h3,h4,h5,h6");
  var headingOrderOk = true;
  var prev = 0;
  for (var p = 0; p < headings.length; p++) {
    var lvl = Number(headings[p].tagName[1]);
    if (prev > 0 && lvl > prev + 1) { headingOrderOk = false; break; }
    prev = lvl;
  }

  var hasDoctype = !!document.doctype;
  var hasCharset = !!document.querySelector("meta[charset]");

  return {
    lh: lh,
    seo: {
      hasTitle: title.length > 0,
      titleLen: title.length,
      hasMetaDescription: metaDesc.length > 0,
      metaDescriptionLen: metaDesc.length,
      hasViewport: viewport,
      hasCanonical: canonical,
      hasLang: lang,
      h1Count: h1Count,
      imgWithAltRatio: imgWithAltRatio,
      hasRobotsAllow: robotsAllow,
      linksWithTextRatio: linksWithTextRatio
    },
    a11y: {
      imgWithAltRatio: imgWithAltRatio,
      inputsWithLabelRatio: inputsWithLabelRatio,
      buttonsWithNameRatio: buttonsWithNameRatio,
      hasLang: lang,
      hasMainLandmark: hasMainLandmark,
      headingOrderOk: headingOrderOk
    },
    bp: {
      hasDoctype: hasDoctype,
      hasCharset: hasCharset,
      imageAspectOkRatio: imageAspectOkRatio
    }
  };
})();
`;
