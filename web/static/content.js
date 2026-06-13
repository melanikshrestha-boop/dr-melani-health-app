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
    }
  });

  setInterval(checkForUpdate, 90000);

  function renderHashtags(tags) {
    var box = document.getElementById("hashtag_preview");
    var chips = document.getElementById("hashtag_chips");
    var count = document.getElementById("hashtag_count");
    if (!box || !chips || !count) return;
    chips.innerHTML = "";
    if (!tags || !tags.length) {
      box.hidden = true;
      return;
    }
    tags.forEach(function (tag) {
      var span = document.createElement("span");
      span.className = "tag-chip";
      span.textContent = "#" + String(tag).replace(/^#/, "");
      chips.appendChild(span);
    });
    count.textContent = tags.length + " hashtag" + (tags.length === 1 ? "" : "s") + " ready for all platforms";
    box.hidden = false;
  }

  function refreshHashtags() {
    var caption = document.getElementById("caption");
    var hashtags = document.getElementById("hashtags");
    if (!caption || !hashtags) return;
    var body = new FormData();
    body.append("caption", caption.value || "");
    body.append("hashtags", hashtags.value || "");
    fetch("/api/content/parse-hashtags", {
      method: "POST",
      body: body,
      credentials: "same-origin",
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        renderHashtags(data.tags || []);
      })
      .catch(function () {});
  }

  var captionEl = document.getElementById("caption");
  var hashtagsEl = document.getElementById("hashtags");
  if (captionEl && hashtagsEl) {
    ["input", "paste", "change"].forEach(function (evt) {
      captionEl.addEventListener(evt, function () {
        setTimeout(refreshHashtags, 0);
      });
      hashtagsEl.addEventListener(evt, function () {
        setTimeout(refreshHashtags, 0);
      });
    });
    refreshHashtags();
  }
})();
