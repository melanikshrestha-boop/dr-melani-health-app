(function () {
  var form = document.getElementById("gym_week_plan_form");
  if (!form) return;

  var order = window.gymWeekOrder || [];
  var types = window.gymPlanTypes || {};
  var hiddenWrap = document.getElementById("gym_plan_hidden_fields");
  var alertBox = document.getElementById("gym_plan_alert");

  var plan = {};
  if (window.gymWeekPlan && typeof window.gymWeekPlan === "object") {
    Object.keys(window.gymWeekPlan).forEach(function (day) {
      var kind = window.gymWeekPlan[day];
      if (kind) plan[String(day).toLowerCase()] = String(kind).toLowerCase();
    });
  } else {
    form.querySelectorAll(".gym-day-pick.is-on").forEach(function (btn) {
      plan[btn.dataset.day] = btn.dataset.workoutType;
    });
  }

  function showAlert(message, level) {
    level = level || "block";
    if (!alertBox) return;
    alertBox.className = "gym-plan-alert gym-plan-alert-" + level;
    alertBox.textContent = message;
    alertBox.hidden = false;
  }

  function clearAlert() {
    if (alertBox) alertBox.hidden = true;
  }

  function dayLabel(day) {
    var idx = order.indexOf(day);
    if (idx < 0) return day;
    var btn = form.querySelector(
      '.gym-day-pick[data-day="' + day + '"] .gym-day-pick-label'
    );
    return (btn && btn.textContent.trim()) || day;
  }

  function lowerIndices(p) {
    return order
      .map(function (dk, i) {
        return p[dk] === "lower" ? i : -1;
      })
      .filter(function (i) {
        return i >= 0;
      });
  }

  function validatePlan(p) {
    var t, meta, count, wtype, a, b, gap, minGap, i, d1, d2, t1, t2;

    for (wtype in types) {
      if (!types.hasOwnProperty(wtype)) continue;
      meta = types[wtype];
      if (!meta.max_days) continue;
      count = 0;
      for (t in p) {
        if (p[t] === wtype) count += 1;
      }
      if (count > meta.max_days) {
        return (
          meta.emoji +
          " " +
          meta.label +
          " is " +
          meta.max_days +
          "× this week max — unpick one first."
        );
      }
    }

    var lowers = lowerIndices(p);
    minGap = (types.lower && types.lower.min_gap) || 1;
    for (a = 0; a < lowers.length; a++) {
      for (b = a + 1; b < lowers.length; b++) {
        gap = lowers[b] - lowers[a];
        if (gap < minGap + 1) {
          return (
            dayLabel(order[lowers[b]]) +
            " is too close to another lower body day — leave one day in between."
          );
        }
      }
    }

    return "";
  }

  function countType(type) {
    var n = 0;
    Object.keys(plan).forEach(function (day) {
      if (plan[day] === type) n += 1;
    });
    return n;
  }

  function trialPlan(day, type) {
    var trial = Object.assign({}, plan);
    if (types[type] && types[type].max_days === 1) {
      Object.keys(trial).forEach(function (d) {
        if (trial[d] === type) delete trial[d];
      });
    }
    trial[day] = type;
    return trial;
  }

  function canAssign(day, type) {
    var assigned = plan[day];
    if (assigned && assigned !== type) {
      var blocker = types[assigned] || {};
      return {
        ok: false,
        code: "taken",
        message:
          dayLabel(day) +
          " is already " +
          (blocker.emoji ? blocker.emoji + " " : "") +
          (blocker.label || assigned) +
          ". Tap that row to unpick it first.",
      };
    }
    if (
      types[type] &&
      types[type].max_days === 1 &&
      countType(type) >= 1 &&
      assigned !== type
    ) {
      var moveMeta = types[type] || {};
      var errMove = validatePlan(trialPlan(day, type));
      if (errMove) {
        return { ok: false, code: "rule", message: dayLabel(day) + ": " + errMove };
      }
      return { ok: true, move: true };
    }
    if (
      types[type] &&
      types[type].max_days &&
      types[type].max_days !== 1 &&
      countType(type) >= types[type].max_days &&
      assigned !== type
    ) {
      var meta = types[type] || {};
      return {
        ok: false,
        code: "max",
        message:
          meta.emoji +
          " " +
          meta.label +
          " is " +
          meta.max_days +
          "× this week max — unpick one first.",
      };
    }
    var err = validatePlan(trialPlan(day, type));
    if (err) {
      return { ok: false, code: "rule", message: dayLabel(day) + ": " + err };
    }
    return { ok: true };
  }

  function syncHiddenFields() {
    if (!hiddenWrap) return;
    hiddenWrap.innerHTML = "";
    Object.keys(plan).forEach(function (day) {
      var type = plan[day];
      if (!type) return;
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = type;
      input.value = day;
      hiddenWrap.appendChild(input);
    });
  }

  function setOn(btn, on) {
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function badgeEl(btn) {
    return btn.querySelector(".gym-day-pick-badge");
  }

  function hrefForDay(day, wt) {
    if (wt === "lower") return "/gym/lower";
    if (wt === "upper_abs") return "/gym/upper";
    if (wt === "cardio") return "/gym/cardio";
    if (wt === "rest") return "/gym/" + day;
    return "/gym/" + day;
  }

  function syncWeekStrip() {
    var strip = document.getElementById("gym_week_strip");
    if (!strip) return;
    strip.querySelectorAll(".gym-week-day[data-day]").forEach(function (el) {
      var day = el.dataset.day;
      var wt = plan[day] || "";
      var meta = types[wt] || {};
      var tag = el.querySelector(".gym-week-tag");
      var isToday = el.classList.contains("is-today");

      if (tag) {
        tag.textContent = meta.emoji || (isToday ? "•" : "");
      }

      el.classList.remove(
        "is-workout-cardio",
        "is-workout-lower",
        "is-workout-upper",
        "is-workout-upper-abs",
        "is-workout-rest"
      );
      if (meta.css) {
        el.classList.add("is-workout-" + meta.css);
      }

      el.href = hrefForDay(day, wt);
      var full = el.dataset.full || day.charAt(0).toUpperCase() + day.slice(1);
      if (meta.label) {
        el.title = full + " · " + meta.label;
      } else {
        el.title = full;
      }
    });
  }

  function syncUIFromPlan() {
    form.querySelectorAll(".gym-day-pick").forEach(function (btn) {
      var day = btn.dataset.day;
      var type = btn.dataset.workoutType;
      var assigned = plan[day];
      var isSelected = assigned === type;
      var takenByOther = assigned && assigned !== type;
      var blocker = takenByOther ? types[assigned] || {} : null;
      var badge = badgeEl(btn);
      var check = !isSelected && !takenByOther ? canAssign(day, type) : { ok: true };

      btn.removeAttribute("disabled");
      setOn(btn, isSelected);
      btn.classList.toggle("is-taken", !!takenByOther);
      btn.classList.toggle("is-blocked", !isSelected && !takenByOther && !check.ok);
      btn.classList.toggle("is-open", !isSelected && !takenByOther && check.ok);

      if (badge) {
        badge.textContent = takenByOther && blocker && blocker.emoji ? blocker.emoji : "";
      }

      if (takenByOther) {
        btn.setAttribute(
          "aria-label",
          (btn.dataset.dayLabel || day) + " — " + (blocker.label || assigned)
        );
      } else if (!check.ok && check.message) {
        btn.setAttribute("title", check.message);
      } else {
        btn.removeAttribute("aria-label");
        btn.removeAttribute("title");
      }
    });
    syncHiddenFields();
    syncWeekStrip();
  }

  function flashBtn(btn, cls) {
    btn.classList.add(cls);
    window.setTimeout(function () {
      btn.classList.remove(cls);
    }, 420);
  }

  function handlePick(btn) {
    var type = btn.dataset.workoutType;
    var day = btn.dataset.day;
    var assigned = plan[day];
    var isOn = assigned === type;

    if (isOn) {
      delete plan[day];
      clearAlert();
      syncUIFromPlan();
      return;
    }

    var check = canAssign(day, type);
    if (!check.ok) {
      flashBtn(btn, check.code === "taken" ? "is-nudge" : "is-shake");
      showAlert(check.message);
      return;
    }

    if (types[type] && types[type].max_days === 1) {
      Object.keys(plan).forEach(function (d) {
        if (plan[d] === type) delete plan[d];
      });
    }
    plan[day] = type;
    clearAlert();
    syncUIFromPlan();
  }

  form.addEventListener("click", function (ev) {
    var btn = ev.target.closest(".gym-day-pick");
    if (!btn || !form.contains(btn)) return;
    handlePick(btn);
  });

  syncUIFromPlan();

  form.addEventListener("submit", function (ev) {
    var err = validatePlan(plan);
    if (err) {
      ev.preventDefault();
      showAlert(err);
    }
  });
})();
