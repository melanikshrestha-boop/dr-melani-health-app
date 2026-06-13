(function () {
  var SHOWER_TYPES = ["daily_shower", "everything_shower", "hair_care"];

  function initHygieneWeekPlan(opts) {
    var form = document.getElementById(opts.formId);
    if (!form) return;

    var order = opts.weekOrder || [];
    var types = opts.types || {};
    var typeKeys = opts.typeKeys || Object.keys(types);
    var hiddenWrap = document.getElementById(opts.hiddenWrapId);
    var alertBox = document.getElementById(opts.alertId);
    var details = document.getElementById(opts.detailsId);
    var stripId = opts.stripId;
    var showerOnly = !!opts.showerOnly;
    var exclusiveDay = !!opts.exclusiveDay;

    var planByType = {};
    Object.keys(types).forEach(function (t) {
      planByType[t] = [];
    });

    if (opts.weekPlan && typeof opts.weekPlan === "object") {
      var raw = opts.weekPlan;
      var sampleKey = Object.keys(raw)[0];
      if (sampleKey && order.indexOf(String(sampleKey).toLowerCase()) >= 0) {
        Object.keys(raw).forEach(function (day) {
          var kind = raw[day];
          if (kind && planByType[kind]) planByType[kind].push(String(day).toLowerCase());
        });
      } else {
        Object.keys(raw).forEach(function (kind) {
          if (!planByType[kind]) return;
          var days = raw[kind];
          if (Array.isArray(days)) {
            planByType[kind] = days.map(function (d) {
              return String(d).toLowerCase();
            });
          }
        });
      }
    } else {
      form.querySelectorAll(".gym-day-pick.is-on").forEach(function (btn) {
        var t = btn.dataset.workoutType;
        var d = btn.dataset.day;
        if (planByType[t] && planByType[t].indexOf(d) < 0) planByType[t].push(d);
      });
    }

    function showAlert(message) {
      if (!alertBox) return;
      alertBox.className = "gym-plan-alert gym-plan-alert-block";
      alertBox.textContent = message;
      alertBox.hidden = false;
      if (details && !details.open) details.open = true;
    }

    function clearAlert() {
      if (alertBox) alertBox.hidden = true;
    }

    function dayLabel(day) {
      var btn = form.querySelector(
        '.gym-day-pick[data-day="' + day + '"] .gym-day-pick-label'
      );
      return (btn && btn.textContent.trim()) || day;
    }

    function routinesOnDay(day) {
      var out = [];
      typeKeys.forEach(function (type) {
        if ((planByType[type] || []).indexOf(day) >= 0) out.push(type);
      });
      return out;
    }

    function routineOnDay(day) {
      var onDay = routinesOnDay(day);
      return onDay.length ? onDay[0] : null;
    }

    function typeLabel(type) {
      var meta = types[type] || {};
      return meta.short_label || meta.label || type;
    }

    function takenMessage(day, blockerType) {
      var blocker = types[blockerType] || {};
      return (
        dayLabel(day) +
        " is already " +
        (blocker.emoji ? blocker.emoji + " " : "") +
        typeLabel(blockerType) +
        ". Tap that row to unpick it first."
      );
    }

    function showerOnDay(day) {
      return routinesOnDay(day).filter(function (t) {
        return SHOWER_TYPES.indexOf(t) >= 0;
      });
    }

    function dayRoutinesValid(onDay) {
      if (!showerOnly) return true;
      var shower = onDay.filter(function (t) {
        return SHOWER_TYPES.indexOf(t) >= 0;
      });
      if (shower.length <= 1) return true;
      return (
        shower.length === 2 &&
        shower.indexOf("everything_shower") >= 0 &&
        shower.indexOf("hair_care") >= 0
      );
    }

    function conflictMessage(day, onDay, newType) {
      if (!showerOnly) return "";
      if (SHOWER_TYPES.indexOf(newType) < 0) return "";
      var combined = onDay.slice();
      if (combined.indexOf(newType) < 0) combined.push(newType);
      if (dayRoutinesValid(combined)) return "";
      var label = dayLabel(day);
      if (
        combined.indexOf("daily_shower") >= 0 &&
        combined.indexOf("everything_shower") >= 0
      ) {
        return label + " — pick daily shower or everything shower, not both.";
      }
      return label + " — only everything shower + hair care can share a day.";
    }

    function validatePlan() {
      var type, meta, count, day, onDay, i, skincare;
      for (type in types) {
        if (!types.hasOwnProperty(type)) continue;
        meta = types[type];
        if (!meta.max_days) continue;
        count = (planByType[type] || []).length;
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
      if (!showerOnly) {
        for (i = 0; i < order.length; i++) {
          day = order[i];
          skincare = routinesOnDay(day);
          if (skincare.length > 1) {
            return dayLabel(day) + " — pick one PM skincare night only.";
          }
        }
        return "";
      }
      for (i = 0; i < order.length; i++) {
        day = order[i];
        onDay = routinesOnDay(day);
        if (onDay.length > 1 && !dayRoutinesValid(onDay)) {
          return conflictMessage(day, onDay.slice(0, -1), onDay[onDay.length - 1]);
        }
      }
      return "";
    }

    function countType(type) {
      return (planByType[type] || []).length;
    }

    function isOn(type, day) {
      return (planByType[type] || []).indexOf(day) >= 0;
    }

    function canAssign(day, type) {
      if (isOn(type, day)) return { ok: true };

      if (exclusiveDay) {
        var assigned = routineOnDay(day);
        if (assigned && assigned !== type) {
          return { ok: false, code: "taken", message: takenMessage(day, assigned) };
        }
      }

      var onDay = routinesOnDay(day);
      var conflict = conflictMessage(day, onDay, type);
      if (conflict) {
        return { ok: false, code: "taken", message: conflict };
      }

      if (
        types[type] &&
        types[type].max_days &&
        types[type].max_days !== 1 &&
        countType(type) >= types[type].max_days
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

      return { ok: true };
    }

    function syncHiddenFields() {
      if (!hiddenWrap) return;
      hiddenWrap.innerHTML = "";
      typeKeys.forEach(function (type) {
        (planByType[type] || []).forEach(function (day) {
          var input = document.createElement("input");
          input.type = "hidden";
          input.name = type;
          input.value = day;
          hiddenWrap.appendChild(input);
        });
      });
    }

    function setOn(btn, on) {
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }

    function badgeEl(btn) {
      return btn.querySelector(".gym-day-pick-badge");
    }

    function hrefForDay(onDay) {
      if (onDay.length === 1) {
        var hrefs = {
          daily_shower: "/hygiene/daily-shower",
          everything_shower: "/hygiene/everything-shower",
          hair_care: "/hygiene/hair-care",
          pm_mark_fading: "/hygiene/pm-mark-fading",
          pm_retinol: "/hygiene/pm-retinol",
          pm_clay_night: "/hygiene/pm-clay-night",
          pm_panoxyl: "/hygiene/pm-panoxyl",
        };
        if (hrefs[onDay[0]]) return hrefs[onDay[0]];
      }
      return "/hygiene";
    }

    function emojiForDay(onDay) {
      if (exclusiveDay && onDay.length) {
        var only = onDay[0];
        return (types[only] && types[only].emoji) || "";
      }
      return onDay
        .map(function (t) {
          return (types[t] && types[t].emoji) || "";
        })
        .join("");
    }

    function labelForDay(onDay) {
      if (exclusiveDay && onDay.length) {
        return typeLabel(onDay[0]);
      }
      return onDay
        .map(function (t) {
          return typeLabel(t);
        })
        .join(" + ");
    }

    function syncWeekStrip() {
      var strip = document.getElementById(stripId);
      if (!strip) return;
      strip.querySelectorAll(".gym-week-day[data-day]").forEach(function (el) {
        var day = el.dataset.day;
        var onDay = routinesOnDay(day);
        var tag = el.querySelector(".gym-week-tag");
        var isToday = el.classList.contains("is-today");

        if (tag) {
          tag.textContent = emojiForDay(onDay) || (isToday ? "•" : "");
        }

        el.className = el.className.replace(/\bis-workout-[\w-]+\b/g, "").trim();
        if (isToday) el.classList.add("is-today");
        el.classList.add("gym-week-day");
        if (exclusiveDay && onDay.length) {
          if (types[onDay[0]] && types[onDay[0]].css) {
            el.classList.add("is-workout-" + types[onDay[0]].css);
          }
        } else {
          onDay.forEach(function (t) {
            if (types[t] && types[t].css) {
              el.classList.add("is-workout-" + types[t].css);
            }
          });
        }

        el.href = hrefForDay(onDay);
        var full = el.dataset.full || day.charAt(0).toUpperCase() + day.slice(1);
        el.title = onDay.length ? full + " · " + labelForDay(onDay) : full;
      });
    }

    function syncUIFromPlan() {
      form.querySelectorAll(".gym-day-pick").forEach(function (btn) {
        var day = btn.dataset.day;
        var type = btn.dataset.workoutType;
        var isSelected = isOn(type, day);
        var assigned = exclusiveDay ? routineOnDay(day) : null;
        var takenByOther = exclusiveDay && assigned && assigned !== type;
        var blocker = takenByOther ? types[assigned] || {} : null;
        var onDay = routinesOnDay(day).filter(function (t) {
          return t !== type;
        });
        var blocked = !exclusiveDay && onDay.length > 0 && conflictMessage(day, onDay, type);
        var check =
          !isSelected && !takenByOther && !blocked ? canAssign(day, type) : { ok: true };
        var badge = badgeEl(btn);

        btn.removeAttribute("disabled");
        setOn(btn, isSelected);
        btn.classList.toggle("is-taken", !!takenByOther || !!blocked);
        btn.classList.toggle("is-blocked", !isSelected && !takenByOther && !blocked && !check.ok);
        btn.classList.toggle("is-open", !isSelected && !takenByOther && !blocked && check.ok);

        if (badge) {
          if (takenByOther && blocker && blocker.emoji) {
            badge.textContent = blocker.emoji;
          } else if (blocked && onDay.length) {
            var other = types[onDay[0]] || {};
            badge.textContent = other.emoji || "";
          } else {
            badge.textContent = "";
          }
        }

        if (takenByOther) {
          btn.setAttribute(
            "aria-label",
            (btn.dataset.dayLabel || day) + " — " + typeLabel(assigned)
          );
        } else if (!check.ok && check.message) {
          btn.setAttribute("title", check.message);
          btn.removeAttribute("aria-label");
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

      if (isOn(type, day)) {
        planByType[type] = (planByType[type] || []).filter(function (d) {
          return d !== day;
        });
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
        planByType[type] = [];
      }
      if (!showerOnly && !exclusiveDay) {
        typeKeys.forEach(function (other) {
          if (other !== type) {
            planByType[other] = (planByType[other] || []).filter(function (d) {
              return d !== day;
            });
          }
        });
      }
      if (!planByType[type]) planByType[type] = [];
      planByType[type].push(day);
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
      var err = validatePlan();
      if (err) {
        ev.preventDefault();
        showAlert(err);
      }
    });
  }

  var order = window.hygieneWeekOrder || [];
  var weekPlan = window.hygieneWeekPlan || {};

  initHygieneWeekPlan({
    formId: "hygiene_week_plan_form",
    stripId: "hygiene_week_strip",
    hiddenWrapId: "hygiene_plan_hidden_fields",
    alertId: "hygiene_plan_alert",
    detailsId: "hygiene_week_plan_details",
    types: window.hygieneRoutineTypes || {},
    typeKeys: Object.keys(window.hygieneRoutineTypes || {}),
    weekOrder: order,
    weekPlan: weekPlan,
    showerOnly: true,
  });

  initHygieneWeekPlan({
    formId: "hygiene_skincare_week_plan_form",
    stripId: "hygiene_skincare_week_strip",
    hiddenWrapId: "hygiene_skincare_plan_hidden_fields",
    alertId: "hygiene_skincare_plan_alert",
    detailsId: "hygiene_skincare_week_plan_details",
    types: window.hygieneSkincareRoutineTypes || {},
    typeKeys: Object.keys(window.hygieneSkincareRoutineTypes || {}),
    weekOrder: order,
    weekPlan: weekPlan,
    showerOnly: false,
    exclusiveDay: true,
  });
})();
