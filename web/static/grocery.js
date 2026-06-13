(function () {
  var scanResult = document.getElementById("scan_result");
  var scanData = null;
  var html5QrCode = null;

  function showResult(data) {
    if (!data || !data.ok) {
      alert(data && data.error ? data.error : "Could not scan product.");
      return;
    }
    scanData = data;
    document.getElementById("scan_name").textContent = data.name || "Product";
    document.getElementById("scan_verdict").textContent = data.verdict + " · " + data.score + "/100";
    var badge = document.getElementById("scan_score_badge");
    badge.textContent = data.score;
    badge.className = "score-badge score-" + (data.color || "blue");
    var ul = document.getElementById("scan_notes");
    ul.innerHTML = "";
    (data.notes || []).forEach(function (n) {
      var li = document.createElement("li");
      li.textContent = n;
      ul.appendChild(li);
    });
    scanResult.hidden = false;
    scanResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function stopScanner() {
    var reader = document.getElementById("barcode_reader");
    if (html5QrCode && html5QrCode.isScanning) {
      html5QrCode.stop().then(function () {
        reader.hidden = true;
      }).catch(function () { reader.hidden = true; });
    } else {
      reader.hidden = true;
    }
  }

  document.getElementById("scan_barcode_btn").addEventListener("click", function () {
    var reader = document.getElementById("barcode_reader");
    if (typeof Html5Qrcode === "undefined") {
      var code = prompt("Enter barcode number (or use Label scan):");
      if (code) lookupBarcode(code.trim());
      return;
    }
    reader.hidden = false;
    if (!html5QrCode) html5QrCode = new Html5Qrcode("barcode_reader");
    if (html5QrCode.isScanning) {
      stopScanner();
      return;
    }
    var config = { fps: 8, qrbox: { width: 260, height: 100 } };
    if (window.Html5QrcodeSupportedFormats) {
      var f = window.Html5QrcodeSupportedFormats;
      config.formatsToSupport = [f.EAN_13, f.EAN_8, f.UPC_A, f.UPC_E, f.CODE_128];
    }
    html5QrCode.start(
      { facingMode: "environment" },
      config,
      function (decoded) {
        stopScanner();
        lookupBarcode(decoded);
      },
      function () {}
    ).catch(function () {
      reader.hidden = true;
      var code = prompt("Camera blocked — enter barcode digits:");
      if (code) lookupBarcode(code.trim());
    });
  });

  function lookupBarcode(barcode) {
    fetch("/api/grocery/scan/barcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcode: barcode }),
    })
      .then(function (r) { return r.json(); })
      .then(showResult)
      .catch(function () { alert("Scan failed — check connection."); });
  }

  document.getElementById("scan_label_input").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var fd = new FormData();
    fd.append("photo", file);
    fetch("/api/grocery/scan/photo", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(showResult)
      .catch(function () { alert("Label scan failed."); });
    e.target.value = "";
  });

  document.getElementById("scan_add_btn").addEventListener("click", function () {
    if (!scanData) return;
    fetch("/api/grocery/add-scanned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scanData),
    })
      .then(function (r) { return r.json(); })
      .then(function () { window.location.reload(); })
      .catch(function () { alert("Could not add item."); });
  });
})();
