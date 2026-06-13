(function () {
  var form = document.getElementById("bowel_note_form");
  var input = document.getElementById("bowel_note_input");
  var status = document.getElementById("bowel_note_status");
  if (!form || !input) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = (input.value || "").trim();
    if (!text) return;

    var btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    fetch("/api/today/bowel-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: text }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("save failed");
        return r.json();
      })
      .then(function () {
        input.value = "";
        if (status) {
          status.hidden = false;
          window.setTimeout(function () {
            status.hidden = true;
          }, 4000);
        }
        var details = form.closest("details");
        if (details) details.open = false;
      })
      .catch(function () {})
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  });
})();
