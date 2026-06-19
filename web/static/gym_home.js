(function () {
  "use strict";

  var card = document.getElementById("gym_warmup_card");
  if (!card) return;

  var dayKey = new Date().toISOString().slice(0, 10);
  var storageKey = "gym_warmup_" + dayKey;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveState(state) {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  var state = loadState();

  card.querySelectorAll(".workout-item[data-warmup-id]").forEach(function (li) {
    var id = li.dataset.warmupId;
    var cb = li.querySelector(".warmup-check");
    if (!cb) return;

    if (state[id]) {
      cb.checked = true;
      li.classList.add("done");
    }

    cb.addEventListener("change", function () {
      state[id] = cb.checked;
      saveState(state);
      li.classList.toggle("done", cb.checked);
    });
  });
})();
