(function () {
  function updateWater(data) {
    var total = data.total_ml || 0;
    var goal = data.goal_ml || 4000;
    var liters = document.getElementById("water_liters");
    var bar = document.getElementById("water_progress");
    if (liters) {
      liters.textContent = (Math.round(total / 100) / 10).toFixed(1);
    }
    if (bar) {
      bar.style.width = Math.min(100, Math.round((100 * total) / goal)) + "%";
    }
  }

  function postWater(action, fd, btn) {
    if (btn) btn.disabled = true;
    return fetch(action, { method: "POST", body: fd, credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("water update failed");
        return r.json();
      })
      .then(updateWater)
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function bindWaterForms() {
    var section = document.getElementById("water_section");
    if (!section) return;

    section.querySelectorAll(".water-add-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ml = parseInt(btn.getAttribute("data-ml") || "0", 10);
        if (!ml) return;
        var fd = new FormData();
        fd.set("amount_ml", String(ml));
        postWater("/api/today/water", fd, btn).catch(function () {
          window.location.reload();
        });
      });
    });

    section.querySelectorAll("form[data-water-action]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var action = form.getAttribute("data-water-action");
        var btn = form.querySelector('button[type="submit"]');
        postWater(action, new FormData(form), btn).catch(function () {
          window.location.reload();
        });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindWaterForms);
  } else {
    bindWaterForms();
  }
})();
