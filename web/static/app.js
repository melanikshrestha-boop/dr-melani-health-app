(function () {
  var root = document.documentElement;
  var knownBuild = root.getAttribute("data-build") || "";

  function checkForUpdate() {
    fetch("/healthz", { cache: "no-store", credentials: "same-origin" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.build) return;
        if (knownBuild && data.build !== knownBuild) {
          location.reload();
          return;
        }
        knownBuild = data.build;
        root.setAttribute("data-build", data.build);
      })
      .catch(function () {});
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      checkForUpdate();
    }
  });

  window.addEventListener("pageshow", function (event) {
    if (event.persisted) {
      location.reload();
    } else {
      checkForUpdate();
    }
  });

  setInterval(checkForUpdate, 60000);
})();
