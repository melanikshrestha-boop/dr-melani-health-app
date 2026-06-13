(function () {
  const dataEl = document.getElementById("cycle_phase_data");
  const infoBox = document.getElementById("cycle_phase_info");
  if (!dataEl || !infoBox) return;

  let guide = {};
  try {
    guide = JSON.parse(dataEl.textContent || "{}");
  } catch (_) {
    return;
  }

  const titleEl = document.getElementById("cycle_phase_title");
  const whenEl = document.getElementById("cycle_phase_when");
  const bodyEl = document.getElementById("cycle_phase_body");
  const listEl = document.getElementById("cycle_phase_symptoms");
  const tipEl = document.getElementById("cycle_phase_tip");
  const chips = document.querySelectorAll(".cycle-phase-chip");
  let openId = null;

  function renderPhase(id) {
    const p = guide[id];
    if (!p) return;

    if (openId === id) {
      infoBox.hidden = true;
      openId = null;
      chips.forEach((c) => c.classList.remove("is-open"));
      return;
    }

    openId = id;
    titleEl.textContent = p.title || p.label;
    whenEl.textContent = p.when || "";
    bodyEl.textContent = p.body || "";
    listEl.innerHTML = "";
    (p.symptoms || []).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      listEl.appendChild(li);
    });
    tipEl.textContent = p.tip ? "Tip: " + p.tip : "";

    infoBox.hidden = false;
    chips.forEach((c) => {
      c.classList.toggle("is-open", c.dataset.phase === id);
    });
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => renderPhase(chip.dataset.phase));
  });

  const current = document.querySelector(".cycle-phase-chip.is-current");
  if (current) {
    current.classList.add("is-current");
  }
})();
