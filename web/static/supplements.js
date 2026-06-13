(function () {
  var section = document.getElementById("supplements_section");
  if (!section) return;

  var summaryEl = document.getElementById("supplement_summary");
  var logAllBtn = document.getElementById("supplement_log_all");

  function updateSummary(data) {
    if (summaryEl && data.summary) {
      summaryEl.textContent = data.summary;
    }
    (data.items || []).forEach(function (item) {
      var row = section.querySelector('.supplement-row[data-id="' + item.id + '"]');
      if (!row) return;
      row.classList.toggle("done", !!item.taken);
      var btn = row.querySelector(".supplement-check");
      if (btn) {
        btn.setAttribute("aria-pressed", item.taken ? "true" : "false");
        btn.textContent = item.taken ? "✓" : "";
      }
    });
  }

  function toggle(id, taken) {
    return fetch("/api/supplements/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplement_id: id, taken: taken }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("toggle failed");
        return r.json();
      })
      .then(updateSummary);
  }

  section.querySelectorAll(".supplement-check").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var row = btn.closest(".supplement-row");
      if (!row) return;
      var id = parseInt(row.dataset.id, 10);
      var next = !row.classList.contains("done");
      btn.disabled = true;
      toggle(id, next)
        .catch(function () {})
        .finally(function () {
          btn.disabled = false;
        });
    });
  });

  if (logAllBtn) {
    logAllBtn.addEventListener("click", function () {
      logAllBtn.disabled = true;
      fetch("/api/supplements/log-all", { method: "POST" })
        .then(function (r) {
          if (!r.ok) throw new Error("log all failed");
          return r.json();
        })
        .then(updateSummary)
        .catch(function () {})
        .finally(function () {
          logAllBtn.disabled = false;
        });
    });
  }
})();
