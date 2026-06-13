(function () {
  "use strict";

  var chartData = window.runChartData || {};
  var todayRun = window.runToday;
  var distChart = null;
  var paceChart = null;

  function $(id) {
    return document.getElementById(id);
  }

  function parseNum(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function formatPace(secPerMi) {
    if (!secPerMi || secPerMi <= 0) return "—";
    var total = Math.round(secPerMi);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ":" + (s < 10 ? "0" : "") + s + "/mi";
  }

  function updatePacePreview() {
    var miles = parseNum($("run_miles") && $("run_miles").value);
    var hours = parseNum($("run_hours") && $("run_hours").value);
    var minutes = parseNum($("run_minutes") && $("run_minutes").value);
    var totalSec = hours * 3600 + minutes * 60;
    var out = $("run_pace_preview");
    if (!out) return;
    if (miles > 0 && totalSec > 0) {
      out.textContent = formatPace(totalSec / miles);
    } else {
      out.textContent = "—";
    }
  }

  function fillDurationFromRun(run) {
    if (!run || !run.duration_sec) return;
    var h = Math.floor(run.duration_sec / 3600);
    var m = Math.floor((run.duration_sec % 3600) / 60);
    if ($("run_hours")) $("run_hours").value = h || "";
    if ($("run_minutes")) $("run_minutes").value = m || "";
    updatePacePreview();
  }

  function initFormDefaults() {
    var dayInput = $("run_day");
    if (dayInput && !dayInput.value) {
      dayInput.value = new Date().toISOString().slice(0, 10);
    }
    if (todayRun) {
      fillDurationFromRun(todayRun);
    }
    ["run_miles", "run_hours", "run_minutes"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("input", updatePacePreview);
    });
    updatePacePreview();
  }

  function chartOptions(yMin, yMax, yLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(25,25,25,0.95)",
          titleColor: "#e5e5e5",
          bodyColor: "#a3a3a3",
          borderColor: "rgba(134,239,172,0.35)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "#737373", maxRotation: 45, minRotation: 0 },
        },
        y: {
          min: yMin,
          max: yMax,
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: {
            color: "#737373",
            callback: function (v) {
              return yLabel ? yLabel(v) : v;
            },
          },
        },
      },
    };
  }

  function initCharts() {
    if (typeof Chart === "undefined") return;
    var labels = chartData.labels || [];
    var distances = chartData.distances || [];
    var targets = chartData.targets || [];
    var paces = chartData.paces || [];
    var paceLabels = chartData.pace_labels || [];

    var distCtx = $("run_dist_chart");
    if (distCtx) {
      distChart = new Chart(distCtx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Miles",
              data: distances,
              borderColor: "#34d399",
              backgroundColor: "rgba(52,211,153,0.15)",
              pointBackgroundColor: "#6ee7b7",
              pointBorderColor: "#34d399",
              pointRadius: 5,
              tension: 0.25,
              fill: true,
            },
            {
              label: "Target",
              data: targets,
              borderColor: "rgba(134,239,172,0.45)",
              borderDash: [6, 4],
              pointRadius: 0,
              tension: 0,
              fill: false,
            },
          ],
        },
        options: chartOptions(chartData.y_dist_min, chartData.y_dist_max, function (v) {
          return v.toFixed(1) + " mi";
        }),
      });
    }

    var paceCtx = $("run_pace_chart");
    if (paceCtx) {
      paceChart = new Chart(paceCtx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Pace",
              data: paces,
              borderColor: "#60a5fa",
              backgroundColor: "rgba(96,165,250,0.12)",
              pointBackgroundColor: "#93c5fd",
              pointBorderColor: "#60a5fa",
              pointRadius: 5,
              tension: 0.25,
              fill: true,
            },
          ],
        },
        options: Object.assign(chartOptions(chartData.y_pace_min, chartData.y_pace_max, function (v) {
          var m = Math.floor(v);
          var s = Math.round((v - m) * 60);
          if (s === 60) { m += 1; s = 0; }
          return m + ":" + (s < 10 ? "0" : "") + s + "/mi";
        }), {
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  var i = ctx.dataIndex;
                  return paceLabels[i] || ctx.formattedValue;
                },
              },
            },
          },
        }),
      });
    }
  }

  function showMsg(text, ok) {
    var el = $("run_form_msg");
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.className = "run-form-msg" + (ok ? " is-ok" : " is-err");
  }

  function bindForm() {
    var form = $("run_log_form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var payload = {
        day: $("run_day").value,
        miles: parseNum($("run_miles").value),
        hours: parseInt($("run_hours").value || "0", 10),
        minutes: parseInt($("run_minutes").value || "0", 10),
        notes: ($("run_notes") && $("run_notes").value) || "",
      };
      fetch("/api/runs/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) {
            showMsg(data.error || "Could not save.", false);
            return;
          }
          showMsg("Saved — reloading…", true);
          setTimeout(function () { window.location.reload(); }, 600);
        })
        .catch(function () {
          showMsg("Something went wrong.", false);
        });
    });
  }

  initFormDefaults();
  initCharts();
  bindForm();
})();
