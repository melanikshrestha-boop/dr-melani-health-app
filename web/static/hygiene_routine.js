(function () {
  function api(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || data.detail || "Request failed");
        return data;
      });
    });
  }

  var root = document.getElementById("hygiene_routine_page");
  if (!root) return;

  var group = window.hygieneRoutineGroup || "daily_shower";
  var summaryEl = root.querySelector(".hygiene-summary");
  var editBtn = root.querySelector(".hygiene-edit-toggle");
  var logAllBtn = root.querySelector(".hygiene-log-all");
  var addBtn = root.querySelector(".hygiene-add-btn");
  var addPanel = root.querySelector(".hygiene-add-panel");
  var addInput = root.querySelector(".hygiene-add-input");
  var routineBody = root.querySelector(".hygiene-routine-body");
  var editMode = false;

  function updateSummary(data) {
    if (summaryEl && data.summary) summaryEl.textContent = data.summary;
    (data.items || []).forEach(function (item) {
      var row = root.querySelector('.workout-item[data-item-id="' + item.id + '"]');
      if (!row) return;
      row.classList.toggle("done", !!item.done);
      var cb = row.querySelector(".hygiene-check");
      if (cb) cb.checked = !!item.done;
    });
  }

  root.querySelectorAll(".hygiene-check").forEach(function (cb) {
    cb.addEventListener("change", function () {
      var row = cb.closest(".workout-item");
      var id = parseInt(row.dataset.itemId, 10);
      api("/api/hygiene/toggle", { item_id: id, done: cb.checked })
        .then(updateSummary)
        .catch(function (err) {
          cb.checked = !cb.checked;
          alert(err.message || "Could not save step.");
        });
    });
  });

  function setEditMode(on) {
    editMode = on;
    if (editBtn) editBtn.textContent = on ? "Done editing" : "Edit routine";
    if (routineBody) routineBody.classList.toggle("is-editing", on);
    root.querySelectorAll(".item-text").forEach(function (el) {
      el.contentEditable = on ? "true" : "false";
    });
    root.querySelectorAll(".hygiene-delete").forEach(function (btn) {
      btn.hidden = !on;
    });
  }

  editBtn?.addEventListener("click", function () {
    setEditMode(!editMode);
  });

  root.querySelectorAll(".item-text").forEach(function (el) {
    el.addEventListener("blur", function () {
      if (!editMode) return;
      var row = el.closest(".workout-item");
      var id = parseInt(row.dataset.itemId, 10);
      var text = el.innerText.trim();
      if (!text) return;
      api("/api/hygiene/item", { action: "update", item_id: id, text: text }).catch(function () {});
    });
  });

  root.querySelectorAll(".hygiene-delete").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var row = btn.closest(".workout-item");
      var id = parseInt(row.dataset.itemId, 10);
      if (!confirm("Remove this step?")) return;
      api("/api/hygiene/item", { action: "delete", item_id: id })
        .then(function () {
          row.remove();
        })
        .catch(function (err) {
          alert(err.message || "Could not remove step.");
        });
    });
  });

  addBtn?.addEventListener("click", function () {
    addPanel.hidden = false;
    addBtn.hidden = true;
    addInput.value = "";
    addInput.focus();
  });

  root.querySelector(".hygiene-add-cancel")?.addEventListener("click", function () {
    addPanel.hidden = true;
    addBtn.hidden = false;
  });

  function saveNewStep() {
    var text = (addInput.value || "").trim();
    if (!text) {
      addInput.focus();
      return;
    }
    api("/api/hygiene/item", { action: "add", routine_group: group, text: text })
      .then(function (data) {
        var list = root.querySelector(".hygiene-list");
        var li = document.createElement("li");
        li.className = "workout-item";
        li.dataset.itemId = String(data.items[data.items.length - 1].id);
        li.innerHTML =
          '<div class="check-row">' +
          '<input type="checkbox" class="hygiene-check" aria-label="Mark done">' +
          '<span class="item-text" contenteditable="false"></span>' +
          "</div>" +
          '<button type="button" class="hygiene-delete secondary small" hidden aria-label="Delete step">×</button>';
        li.querySelector(".item-text").textContent = text;
        list.appendChild(li);
        addPanel.hidden = true;
        addBtn.hidden = false;
        updateSummary(data);
      })
      .catch(function (err) {
        alert(err.message || "Could not add step.");
      });
  }

  root.querySelector(".hygiene-add-save")?.addEventListener("click", saveNewStep);
  addInput?.addEventListener("keydown", function (e) {
    if (e.key === "Enter") saveNewStep();
  });

  logAllBtn?.addEventListener("click", function () {
    logAllBtn.disabled = true;
    api("/api/hygiene/log-all", { routine_group: group })
      .then(function (data) {
        updateSummary(data);
        root.querySelectorAll(".hygiene-check").forEach(function (cb) {
          cb.checked = true;
        });
        root.querySelectorAll(".workout-item").forEach(function (row) {
          row.classList.add("done");
        });
      })
      .catch(function (err) {
        alert(err.message || "Could not mark all done.");
      })
      .finally(function () {
        logAllBtn.disabled = false;
      });
  });
})();
