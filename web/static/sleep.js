(function () {
  var sleepChartInstance = null;

  function parseMinutes(value) {
    if (!value) return null;
    var parts = value.split(":");
    if (parts.length < 2) return null;
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function computeSleepHours(bedtime, wakeTime) {
    var bt = parseMinutes(bedtime);
    var wt = parseMinutes(wakeTime);
    if (bt === null || wt === null) return "";
    var diff = wt - bt;
    if (diff <= 0) diff += 24 * 60;
    return (Math.round((diff / 60) * 10) / 10).toFixed(1);
  }

  function sleepZone(h) {
    if (h === null || h === undefined) return "neutral";
    if (h < 6 || h > 8) return "bad";
    return "good";
  }

  function sleepZoneClass(hours) {
    if (!hours) return "";
    var h = parseFloat(hours);
    if (isNaN(h)) return "";
    if (h < 6 || h > 8) return "sleep-bad";
    return "sleep-good";
  }

  function dotColor(h) {
    var z = sleepZone(h);
    if (z === "bad") return "#ef4444";
    if (z === "good") return "#22c55e";
    return "rgba(255,255,255,0.25)";
  }

  function updateSleepHours() {
    var bedtime = document.getElementById("bedtime");
    var wake = document.getElementById("wake_time");
    var out = document.getElementById("sleep_hours_display");
    if (!bedtime || !wake || !out) return;
    var val = computeSleepHours(bedtime.value, wake.value);
    out.textContent = val ? val + " h" : "—";
    out.classList.remove("sleep-good", "sleep-bad");
    var cls = sleepZoneClass(val);
    if (cls) out.classList.add(cls);
  }

  function applySleepRecord(data) {
    var bedtime = document.getElementById("bedtime");
    var wake = document.getElementById("wake_time");
    var out = document.getElementById("sleep_hours_display");
    if (bedtime) bedtime.value = data.bedtime_input || "";
    if (wake) wake.value = data.wake_input || "";
    if (out) {
      if (data.sleep_hours != null) {
        out.textContent = data.sleep_hours + " h";
        out.classList.remove("sleep-good", "sleep-bad");
        var cls = sleepZoneClass(String(data.sleep_hours));
        if (cls) out.classList.add(cls);
      } else {
        updateSleepHours();
      }
    }
  }

  function updateSleepChart(chartData) {
    if (!sleepChartInstance || !chartData) return;
    sleepChartInstance.data.labels = chartData.labels || [];
    sleepChartInstance.data.datasets[1].data = chartData.values || [];
    sleepChartInstance.data.datasets[1].pointBackgroundColor = (chartData.values || []).map(dotColor);
    sleepChartInstance.data.datasets[1].pointBorderColor = (chartData.values || []).map(dotColor);
    sleepChartInstance.update();
    var caption = document.querySelector(".sleep-chart-wrap + .chart-caption");
    if (caption && chartData.week_label) caption.textContent = chartData.week_label;
  }

  function initSleepChart(chartData) {
    var ctx = document.getElementById("sleepChart");
    if (!ctx || typeof Chart === "undefined" || !chartData) return;
    if (sleepChartInstance) sleepChartInstance.destroy();
    var labels = chartData.labels || [];
    var values = chartData.values || [];
    sleepChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "8 h goal",
            data: labels.map(function () { return 8; }),
            borderColor: "#22c55e",
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0,
          },
          {
            label: "Sleep hours",
            data: values,
            borderColor: "rgba(255,255,255,0.15)",
            backgroundColor: "rgba(34,197,94,0.08)",
            tension: 0.35,
            spanGaps: true,
            fill: true,
            pointRadius: 6,
            pointHoverRadius: 8,
            pointBackgroundColor: values.map(dotColor),
            pointBorderColor: values.map(dotColor),
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.06)" },
            ticks: { color: "rgba(255,255,255,0.45)" },
          },
          y: {
            beginAtZero: true,
            max: 12,
            grid: { color: "rgba(255,255,255,0.06)" },
            ticks: { color: "rgba(255,255,255,0.45)" },
            title: { display: true, text: "Hours", color: "rgba(255,255,255,0.45)" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                if (ctx.datasetIndex === 0) return "Goal: 8 h";
                var v = ctx.parsed.y;
                if (v === null) return "No data";
                var z = sleepZone(v);
                var tag = z === "good" ? " (green zone)" : z === "bad" ? " (red zone)" : "";
                return v + " h" + tag;
              },
            },
          },
        },
      },
    });
  }

  function refreshSleepChart(week) {
    var weekSelect = document.getElementById("sleep_week");
    var w = week || (weekSelect ? weekSelect.value : "");
    var url = "/api/sleep/week" + (w ? "?week=" + encodeURIComponent(w) : "");
    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data) updateSleepChart(data);
        return data;
      });
  }

  function saveSleepQuiet() {
    var form = document.getElementById("sleep_form");
    if (!form) return;
    var fd = new FormData(form);
    return fetch("/api/today/sleep", { method: "POST", body: fd })
      .then(function (r) {
        if (!r.ok) throw new Error("save failed");
        return r.json();
      })
      .then(function (data) {
        if (data.sleep) applySleepRecord(data.sleep);
        if (data.chart) updateSleepChart(data.chart);
      })
      .catch(function () {});
  }

  var sleepSaveTimer = null;
  function scheduleSleepSave() {
    if (sleepSaveTimer) window.clearTimeout(sleepSaveTimer);
    sleepSaveTimer = window.setTimeout(saveSleepQuiet, 600);
  }

  document.addEventListener("DOMContentLoaded", function () {
    window.sleepChart = true;
    if (window.sleepChartData) initSleepChart(window.sleepChartData);

    var bedtime = document.getElementById("bedtime");
    var wake = document.getElementById("wake_time");
    var logDate = document.getElementById("sleep_log_date");
    var sleepForm = document.getElementById("sleep_form");

    if (bedtime) {
      bedtime.addEventListener("input", updateSleepHours);
      bedtime.addEventListener("change", scheduleSleepSave);
    }
    if (wake) {
      wake.addEventListener("input", updateSleepHours);
      wake.addEventListener("change", scheduleSleepSave);
    }
    updateSleepHours();

    if (logDate) {
      logDate.addEventListener("change", function () {
        var moodDate = document.getElementById("mood_log_date");
        if (moodDate) moodDate.value = logDate.value;
        fetch("/api/sleep/day?date=" + encodeURIComponent(logDate.value))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (data) applySleepRecord(data);
          })
          .catch(function () {});
        scheduleSleepSave();
      });
    }

    if (sleepForm) {
      sleepForm.addEventListener("submit", function (e) {
        e.preventDefault();
        saveSleepQuiet();
      });
    }

    var weekSelect = document.getElementById("sleep_week");
    if (weekSelect) {
      weekSelect.addEventListener("change", function () {
        var url = new URL(window.location.href);
        url.searchParams.set("week", weekSelect.value);
        window.location.href = url.toString();
      });
    }
  });
})();
