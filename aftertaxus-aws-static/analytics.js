(function () {
  try {
    if (window.__afterTaxAnalyticsLoaded) return;
    window.__afterTaxAnalyticsLoaded = true;

    var storageKey = "aftertaxus.visitorId";
    var visitorId = "";
    try {
      visitorId = localStorage.getItem(storageKey) || "";
      if (!visitorId) {
        visitorId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
        localStorage.setItem(storageKey, visitorId);
      }
    } catch (_) {
      visitorId = String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    }

    var knownPaths = ["/", "/index.html", "/app", "/app/", "/admin.html", "/privacy.html", "/terms.html", "/calculator.html", "/after-tax-calculator.html", "/after-tax-investment-calculator.html", "/after-tax-yield-calculator.html", "/federal-state-local-tax-calculator.html", "/roth-vs-taxable-calculator.html", "/taxable-income-calculator.html", "/snapshot-calculator", "/snapshot-calculator/"];
    var route = knownPaths.indexOf(location.pathname) >= 0 ? location.pathname : "/other";
    var referrer;
    try {
      var referrerUrl = new URL(document.referrer);
      if (referrerUrl.protocol === "https:" || referrerUrl.protocol === "http:") referrer = referrerUrl.origin;
    } catch (_) {}

    var payload = {
      calc: "ANALYTICS_TRACK",
      eventName: "page_view",
      path: route,
      referrer: referrer,
      visitorId: visitorId,
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: { width: window.screen && screen.width, height: window.screen && screen.height }
    };

    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      var sent = navigator.sendBeacon("/api/hello", new Blob([body], { type: "application/json" }));
      if (sent) return;
    }

    fetch("/api/hello", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true,
      credentials: "omit"
    }).catch(function () {});
  } catch (_) {}
})();
