(function () {
  "use strict";

  var root = document.querySelector(".hygiene-guide");
  if (!root) return;

  root.querySelectorAll(".hygiene-guide-step-head").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var step = btn.closest(".hygiene-guide-step");
      if (!step) return;
      var body = step.querySelector(".hygiene-guide-step-body");
      if (!body) return;
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      step.classList.toggle("is-open", !open);
      body.hidden = open;
    });
  });
})();
