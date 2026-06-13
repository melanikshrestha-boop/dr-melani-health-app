(function () {
  const view = document.getElementById("preset_ingredients_view");
  const editBtn = document.getElementById("preset_edit_btn");
  const form = document.getElementById("preset_edit_form");
  const rows = document.getElementById("preset_edit_rows");
  const addBtn = document.getElementById("preset_add_row");
  const cancelBtn = document.getElementById("preset_edit_cancel");

  if (!view || !editBtn || !form || !rows) return;

  function rowTemplate(value) {
    const wrap = document.createElement("div");
    wrap.className = "preset-edit-row";
    wrap.innerHTML =
      '<input type="text" name="ingredients" value="' +
      (value || "").replace(/"/g, "&quot;") +
      '" placeholder="Ingredient">' +
      '<button type="button" class="preset-row-del" aria-label="Remove">×</button>';
    return wrap;
  }

  function bindRow(row) {
    const del = row.querySelector(".preset-row-del");
    if (del) {
      del.addEventListener("click", function () {
        if (rows.children.length <= 1) {
          row.querySelector("input").value = "";
          return;
        }
        row.remove();
      });
    }
  }

  rows.querySelectorAll(".preset-edit-row").forEach(bindRow);

  function showEdit() {
    view.hidden = true;
    editBtn.hidden = true;
    form.hidden = false;
  }

  function hideEdit() {
    view.hidden = false;
    editBtn.hidden = false;
    form.hidden = true;
  }

  editBtn.addEventListener("click", showEdit);
  if (cancelBtn) cancelBtn.addEventListener("click", hideEdit);
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      const row = rowTemplate("");
      rows.appendChild(row);
      bindRow(row);
      row.querySelector("input").focus();
    });
  }

  document.querySelectorAll("[data-meal-action]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      var action = form.getAttribute("data-meal-action");
      if (!action) return;
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      var opts = { method: "POST" };
      if (action.indexOf("/clear") >= 0) {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify({ slot: form.getAttribute("data-meal-slot") || "" });
      }
      fetch(action, opts)
        .then(function (r) {
          if (!r.ok) throw new Error("undo failed");
          return r.json();
        })
        .then(function () {
          location.reload();
        })
        .catch(function () {
          form.submit();
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  });
})();

// ── Food & macro history: collapsible chart + table ─────────────────────────
(function () {
  var root = document.getElementById("macro_history");
  if (!root) return;
  var rangeEl = document.getElementById("mh_range");
  var avgEl = document.getElementById("mh_averages");
  var tbody = document.getElementById("mh_tbody");
  var emptyEl = document.getElementById("mh_empty");
  var canvas = document.getElementById("mh_chart");
  var loaded = {};
  var currentDays = 7;
  var didInit = false;

  function fmt(n) { return (n || 0).toLocaleString(); }

  function renderAverages(data) {
    var a = data.averages || {};
    var g = data.goals || {};
    if (!data.logged_days) {
      avgEl.innerHTML = "";
      return;
    }
    function chip(label, val, goal, unit) {
      var goalTxt = goal ? " / " + fmt(goal) : "";
      return '<div class="mh-chip"><span class="mh-chip-label">' + label +
        '</span><span class="mh-chip-val">' + fmt(val) + goalTxt + (unit || "") + "</span></div>";
    }
    avgEl.innerHTML =
      '<p class="mh-avg-title">Daily average · ' + data.logged_days + ' logged days</p>' +
      '<div class="mh-chip-row">' +
      chip("Cal", a.calories, g.calories, "") +
      chip("Protein", a.protein_g, g.protein_g, "g") +
      chip("Carbs", a.carbs_g, g.carbs_g, "g") +
      chip("Fat", a.fat_g, g.fat_g, "g") +
      "</div>";
  }

  function renderTable(data) {
    tbody.innerHTML = "";
    var days = (data.days || []).slice().reverse(); // newest first
    var anyLogged = false;
    days.forEach(function (d) {
      if (!d.meals) return;
      anyLogged = true;
      var tr = document.createElement("tr");
      tr.className = "mh-row";
      tr.innerHTML =
        "<td>" + d.date_label + "</td>" +
        "<td>" + fmt(d.calories) + "</td>" +
        "<td>" + fmt(d.protein_g) + "</td>" +
        "<td>" + fmt(d.carbs_g) + "</td>" +
        "<td>" + fmt(d.fat_g) + "</td>" +
        "<td>" + d.meals + "</td>";
      tbody.appendChild(tr);

      var detail = document.createElement("tr");
      detail.className = "mh-foods-row";
      detail.hidden = true;
      var td = document.createElement("td");
      td.colSpan = 6;
      if (d.foods && d.foods.length) {
        td.innerHTML = d.foods.map(function (f) {
          var macro = (f.calories ? f.calories + " cal" : "") +
            (f.protein_g ? " · " + f.protein_g + "g P" : "");
          return '<div class="mh-food"><span class="mh-food-name">' +
            (f.name || "—") + '</span><span class="mh-food-macro">' + macro + "</span></div>";
        }).join("");
      } else {
        td.innerHTML = '<span class="mh-food-name">No detail saved.</span>';
      }
      detail.appendChild(td);
      tbody.appendChild(detail);

      tr.addEventListener("click", function () {
        detail.hidden = !detail.hidden;
        tr.classList.toggle("open", !detail.hidden);
      });
    });
    if (emptyEl) emptyEl.hidden = anyLogged;
  }

  function drawChart(data) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var W = canvas.width, H = canvas.height;
    var padL = 38, padR = 38, padT = 14, padB = 22;
    ctx.clearRect(0, 0, W, H);

    var days = data.days || [];
    if (!days.length) return;

    var cals = days.map(function (d) { return d.calories; });
    var prots = days.map(function (d) { return d.protein_g; });
    var calGoal = (data.goals && data.goals.calories) || 0;
    var protGoal = (data.goals && data.goals.protein_g) || 0;
    var maxCal = Math.max.apply(null, cals.concat([calGoal, 1])) * 1.15;
    var maxProt = Math.max.apply(null, prots.concat([protGoal, 1])) * 1.15;

    var n = days.length;
    function x(i) { return padL + (n <= 1 ? 0 : (i * (W - padL - padR) / (n - 1))); }
    function yCal(v) { return H - padB - (v / maxCal) * (H - padT - padB); }
    function yProt(v) { return H - padB - (v / maxProt) * (H - padT - padB); }

    var styles = getComputedStyle(document.body);
    var border = styles.getPropertyValue("--border") || "#333";
    var muted = styles.getPropertyValue("--muted") || "#888";

    // baseline
    ctx.strokeStyle = border.trim() || "#333";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke();

    // calorie goal dashed line
    if (calGoal) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,159,67,0.5)";
      ctx.beginPath(); ctx.moveTo(padL, yCal(calGoal)); ctx.lineTo(W - padR, yCal(calGoal)); ctx.stroke();
      ctx.restore();
    }

    function line(points, color, yFn) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      var started = false;
      points.forEach(function (v, i) {
        if (days[i].meals === 0) { started = false; return; } // gap on unlogged days
        var px = x(i), py = yFn(v);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      // dots
      ctx.fillStyle = color;
      points.forEach(function (v, i) {
        if (days[i].meals === 0) return;
        ctx.beginPath(); ctx.arc(x(i), yFn(v), 2.5, 0, Math.PI * 2); ctx.fill();
      });
    }

    line(cals, "#ff9f43", yCal);
    line(prots, "#54a0ff", yProt);

    // y labels (left = cal, right = protein)
    ctx.fillStyle = (muted.trim() || "#888");
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(Math.round(maxCal), padL - 4, padT + 8);
    ctx.textAlign = "left";
    ctx.fillText(Math.round(maxProt) + "g", W - padR + 4, padT + 8);
    // x labels: first + last
    ctx.textAlign = "center";
    if (days[0]) ctx.fillText(days[0].date_label, x(0), H - 6);
    if (days[n - 1]) ctx.fillText(days[n - 1].date_label, x(n - 1), H - 6);
  }

  function render(data) {
    renderAverages(data);
    renderTable(data);
    drawChart(data);
  }

  function load(days) {
    currentDays = days;
    if (loaded[days]) { render(loaded[days]); return; }
    fetch("/api/meals/history?days=" + days)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        loaded[days] = data;
        render(data);
      })
      .catch(function () {});
  }

  if (rangeEl) {
    rangeEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".mh-range-btn");
      if (!btn) return;
      rangeEl.querySelectorAll(".mh-range-btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      load(parseInt(btn.getAttribute("data-days"), 10) || 7);
    });
  }

  // Lazy-load when the dropdown is first opened (keeps the page fast).
  root.addEventListener("toggle", function () {
    if (root.open && !didInit) {
      didInit = true;
      load(currentDays);
    } else if (root.open && loaded[currentDays]) {
      drawChart(loaded[currentDays]); // canvas needs redraw if it was hidden
    }
  });
})();
