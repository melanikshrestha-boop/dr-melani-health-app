(function () {
  var page = document.querySelector(".gym-session");
  if (!page) return;

  var dayKey = page.dataset.day;
  var celebrateEl = document.getElementById("set_celebrate");
  var celebrateMsg = document.getElementById("celebrate_msg");
  var celebrateTimer = document.getElementById("celebrate_timer");
  var celebrateTimerCount = document.getElementById("celebrate_timer_count");
  var celebrateTimerHint = document.getElementById("celebrate_timer_hint");
  var confettiLayer = document.getElementById("confetti_layer");
  var timerInterval = null;
  var timerRemaining = 0;
  var busy = false;
  var celebratePhaseTimer = null;

  var NORMAL_MSGS = [
    "Set done — that's the work.",
    "Checked off. Keep stacking.",
    "One down. Breathe.",
    "Nice. Rest up.",
    "You showed up for that one.",
  ];
  var FAILURE_MSGS = [
    "True failure. 0 RIR — beast mode.",
    "You went to failure. That's growth.",
    "Empty tank on that set. Respect.",
    "Failure reps hit. Glutes heard that.",
  ];

  function api(path, body) {
    return fetch("/api/gym/" + dayKey + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.detail || data.error || ("Error " + r.status));
        return data;
      });
    });
  }

  function pickMessage(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function clearTimerInterval() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function clearCelebrateTimers() {
    clearTimerInterval();
    if (celebratePhaseTimer) {
      clearTimeout(celebratePhaseTimer);
      celebratePhaseTimer = null;
    }
  }

  function hideCelebrate() {
    clearCelebrateTimers();
    if (celebrateEl) celebrateEl.hidden = true;
    if (celebrateMsg) {
      celebrateMsg.hidden = false;
      celebrateMsg.textContent = "";
    }
    if (celebrateTimer) celebrateTimer.hidden = true;
    if (confettiLayer) confettiLayer.innerHTML = "";
  }

  function launchConfetti() {
    if (!confettiLayer) return;
    confettiLayer.innerHTML = "";
    var colors = ["#60a5fa", "#a78bfa", "#f472b6", "#34d399", "#c4b5fd", "#93c5fd"];
    for (var i = 0; i < 48; i++) {
      var bit = document.createElement("span");
      bit.className = "confetti-bit";
      bit.style.left = Math.random() * 100 + "%";
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = Math.random() * 0.4 + "s";
      bit.style.animationDuration = 1.8 + Math.random() * 1.2 + "s";
      confettiLayer.appendChild(bit);
    }
  }

  function renderCelebrateTimer() {
    if (celebrateTimerCount) celebrateTimerCount.textContent = formatTime(timerRemaining);
  }

  function startOverlayRest(seconds, label) {
    if (!celebrateTimer) return;
    celebrateMsg.hidden = true;
    celebrateTimer.hidden = false;
    timerRemaining = parseInt(seconds, 10) || 120;
    if (celebrateTimerHint) {
      celebrateTimerHint.textContent = label ? label : "";
    }
    renderCelebrateTimer();
    clearTimerInterval();
    timerInterval = setInterval(function () {
      timerRemaining -= 1;
      renderCelebrateTimer();
      if (timerRemaining <= 0) {
        hideCelebrate();
        if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
      }
    }, 1000);
  }

  function showCelebrate(opts) {
    if (!celebrateEl || !celebrateMsg) return;
    clearCelebrateTimers();
    celebrateEl.hidden = false;
    celebrateMsg.hidden = false;
    celebrateTimer.hidden = true;
    celebrateMsg.textContent = opts.message;
    celebrateEl.classList.toggle("is-failure", !!opts.isFailure);
    if (opts.isFailure) launchConfetti();

    var restSec = parseInt(opts.restSec, 10) || 120;
    celebratePhaseTimer = setTimeout(function () {
      startOverlayRest(restSec, opts.restLabel || "");
    }, opts.isFailure ? 2200 : 1600);
  }

  document.getElementById("celebrate_skip")?.addEventListener("click", hideCelebrate);
  document.getElementById("celebrate_add_30")?.addEventListener("click", function () {
    timerRemaining += 30;
    renderCelebrateTimer();
  });

  function updateCard(card) {
    var allDone = true;
    card.querySelectorAll(".set-check-item").forEach(function (row) {
      if (!row.classList.contains("set-done")) allDone = false;
    });
    card.classList.toggle("exercise-done", allDone);
  }

  page.querySelectorAll(".exercise-card").forEach(function (card) {
    var itemId = card.dataset.itemId;
    card.querySelectorAll(".set-check-item").forEach(function (row) {
      var setIndex = parseInt(row.dataset.setIndex, 10);
      var isFailure = row.dataset.failure === "true";
      var cb = row.querySelector(".set-check");
      if (!cb) return;

      cb.addEventListener("change", function () {
        if (busy) return;
        var turningOn = cb.checked;
        busy = true;
        api("/set", {
          item_id: itemId,
          set_index: setIndex,
          done: turningOn,
        })
          .then(function (data) {
            row.classList.toggle("set-done", turningOn);
            updateCard(card);
            if (turningOn) {
              var failure = data.is_failure || isFailure;
              showCelebrate({
                message: failure ? pickMessage(FAILURE_MSGS) : pickMessage(NORMAL_MSGS),
                restSec: data.rest_sec || 120,
                restLabel: data.rest_label || "",
                isFailure: failure,
              });
            } else {
              hideCelebrate();
            }
          })
          .catch(function (err) {
            cb.checked = !turningOn;
            alert(err.message || "Could not save — try again.");
          })
          .finally(function () {
            busy = false;
          });
      });
    });
  });

  document.getElementById("reset_workout")?.addEventListener("click", function () {
    if (!confirm("Reset all sets for this workout?")) return;
    hideCelebrate();
    api("/item", { action: "reset" }).then(function () {
      location.reload();
    });
  });
})();
