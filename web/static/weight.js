(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var weekSelect = document.getElementById("weight_week");
    if (!weekSelect || !window.weightChart) return;
    weekSelect.addEventListener("change", function () {
      var url = new URL(window.location.href);
      url.searchParams.set("weight_week", weekSelect.value);
      window.location.href = url.toString();
    });
  });
})();
