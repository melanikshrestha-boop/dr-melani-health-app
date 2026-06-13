(function () {
  var dayKey = document.querySelector(".gym-page")?.dataset.day;
  if (!dayKey) return;

  var editMode = false;

  function api(path, body) {
    return fetch("/api/gym/" + dayKey + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || ("Error " + r.status));
        return data;
      });
    });
  }

  document.querySelectorAll(".item-check").forEach(function (cb) {
    cb.addEventListener("change", function () {
      var li = cb.closest(".workout-item");
      var id = li.dataset.itemId;
      api("/toggle", { item_id: id, checked: cb.checked }).then(function () {
        li.classList.toggle("done", cb.checked);
      }).catch(function () {
        cb.checked = !cb.checked;
      });
    });
  });

  document.getElementById("reset_workout")?.addEventListener("click", function () {
    if (!confirm("Reset all checkboxes for this day?")) return;
    api("/item", { action: "reset" }).then(function () { location.reload(); });
  });

  document.getElementById("edit_mode_toggle")?.addEventListener("click", function () {
    editMode = !editMode;
    document.querySelectorAll(".item-text").forEach(function (el) {
      el.contentEditable = editMode ? "true" : "false";
    });
    this.textContent = editMode ? "Done editing" : "Edit plan";
  });

  document.querySelectorAll(".item-text").forEach(function (el) {
    el.addEventListener("blur", function () {
      if (!editMode) return;
      var id = el.closest(".workout-item").dataset.itemId;
      api("/item", { item_id: id, text: el.innerText.trim() }).catch(function () {});
    });
  });

  document.querySelectorAll(".add-item-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sid = btn.dataset.section;
      var panel = document.querySelector('.add-item-panel[data-section="' + sid + '"]');
      if (!panel) return;
      panel.hidden = false;
      var input = panel.querySelector(".add-item-input");
      input.value = "";
      input.focus();
      btn.hidden = true;
    });
  });

  document.querySelectorAll(".add-item-panel").forEach(function (panel) {
    var sid = panel.dataset.section;
    var btn = document.querySelector('.add-item-btn[data-section="' + sid + '"]');
    var input = panel.querySelector(".add-item-input");
    var select = panel.querySelector(".add-item-select");

    select?.addEventListener("change", function () {
      if (select.value) input.value = select.value;
    });

    function closePanel() {
      panel.hidden = true;
      if (btn) btn.hidden = false;
    }

    panel.querySelector(".add-item-cancel")?.addEventListener("click", closePanel);

    function saveItem() {
      var text = (input.value || "").trim();
      if (!text) {
        input.focus();
        return;
      }
      api("/item", { action: "add", section_id: sid, text: text })
        .then(function () { location.reload(); })
        .catch(function (err) {
          alert(err.message || "Could not add exercise.");
        });
    }

    panel.querySelector(".add-item-save")?.addEventListener("click", saveItem);
    input?.addEventListener("keydown", function (e) {
      if (e.key === "Enter") saveItem();
    });
  });

  var sectionPanel = document.getElementById("add_section_panel");
  var sectionBtn = document.getElementById("add_section_btn");
  var sectionInput = document.getElementById("add_section_input");

  sectionBtn?.addEventListener("click", function () {
    sectionPanel.hidden = false;
    sectionBtn.hidden = true;
    sectionInput.value = "";
    sectionInput.focus();
  });

  document.getElementById("add_section_cancel")?.addEventListener("click", function () {
    sectionPanel.hidden = true;
    sectionBtn.hidden = false;
  });

  function saveSection() {
    var title = (sectionInput.value || "").trim();
    if (!title) {
      sectionInput.focus();
      return;
    }
    api("/item", { action: "add_section", title: title })
      .then(function () { location.reload(); })
      .catch(function (err) {
        alert(err.message || "Could not add section.");
      });
  }

  document.getElementById("add_section_save")?.addEventListener("click", saveSection);
  sectionInput?.addEventListener("keydown", function (e) {
    if (e.key === "Enter") saveSection();
  });
})();
