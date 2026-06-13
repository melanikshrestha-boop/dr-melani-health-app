(function () {
  var row = document.getElementById("brain_fog_week_row");
  if (!row) return;

  var todayIso = row.dataset.today || "";
  var dateInputs = document.querySelectorAll(".brain-fog-log-date");
  var yesBtn = document.querySelector(".bf-yes-btn");
  var noBtn = document.querySelector(".bf-no-btn");
  var hintLabel = document.getElementById("brain_fog_editing_label");
  var picks = row.querySelectorAll(".bf-day-pick");

  function setActiveButtons(yesVal) {
    if (yesBtn) {
      yesBtn.classList.toggle("status-bad-active", yesVal === "1");
    }
    if (noBtn) {
      noBtn.classList.toggle("status-good-active", yesVal === "0");
    }
  }

  function selectDay(day, label, yesVal) {
    dateInputs.forEach(function (input) {
      input.value = day;
    });
    picks.forEach(function (btn) {
      btn.classList.toggle("bf-day-selected", btn.dataset.day === day);
    });
    if (hintLabel) {
      hintLabel.textContent = day === todayIso ? "today" : label || day;
    }
    if (yesVal === "1" || yesVal === "0") {
      setActiveButtons(yesVal);
    } else {
      if (yesBtn) yesBtn.classList.remove("status-bad-active");
      if (noBtn) noBtn.classList.remove("status-good-active");
    }
  }

  var initial = row.querySelector('.bf-day-pick[data-day="' + todayIso + '"]');
  if (initial) {
    selectDay(todayIso, initial.dataset.label || "today", initial.dataset.yes || "");
  }

  picks.forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectDay(btn.dataset.day, btn.dataset.label, btn.dataset.yes || "");
    });
  });
})();
