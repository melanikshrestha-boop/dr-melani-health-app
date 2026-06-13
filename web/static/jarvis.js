(function () {
  var panel = document.getElementById("jarvis_panel");
  var toggle = document.getElementById("jarvis_toggle");
  var closeBtn = document.getElementById("jarvis_close");
  var input = document.getElementById("jarvis_input");
  var sendBtn = document.getElementById("jarvis_send");
  var attachBtn = document.getElementById("jarvis_attach");
  var imageInput = document.getElementById("jarvis_image_input");
  var imagePreview = document.getElementById("jarvis_image_preview");
  var previewImg = document.getElementById("jarvis_preview_img");
  var clearImageBtn = document.getElementById("jarvis_clear_image");
  var newChatBtn = document.getElementById("jarvis_reset_chat");
  var messages = document.getElementById("jarvis_messages");
  var nudgesEl = document.getElementById("jarvis_nudges");
  var supplementPick = document.getElementById("jarvis_supplement_pick");
  var photoMode = document.getElementById("jarvis_photo_mode");

  if (!panel || !toggle) return;

  var supplementCatalog = [];
  var selectedSupplementId = "";

  var pendingImage = null;
  var pendingPreviewUrl = null;
  var fabDrag = { active: false, moved: false, suppressClick: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 };
  var FAB_POS_KEY = "dr_melani_fab_pos";

  function clampFab(x, y) {
    var pad = 8;
    var navH = 56;
    var maxX = window.innerWidth - toggle.offsetWidth - pad;
    var maxY = window.innerHeight - toggle.offsetHeight - pad - navH;
    return {
      x: Math.max(pad, Math.min(x, maxX)),
      y: Math.max(pad, Math.min(y, maxY)),
    };
  }

  function applyFabPosition(x, y) {
    var p = clampFab(x, y);
    toggle.style.left = p.x + "px";
    toggle.style.top = p.y + "px";
    toggle.style.right = "auto";
    toggle.style.bottom = "auto";
    toggle.classList.add("is-docked-custom");
    return p;
  }

  function saveFabPosition() {
    var rect = toggle.getBoundingClientRect();
    localStorage.setItem(FAB_POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
  }

  function loadFabPosition() {
    try {
      var raw = localStorage.getItem(FAB_POS_KEY);
      if (!raw) return;
      var pos = JSON.parse(raw);
      if (typeof pos.x === "number" && typeof pos.y === "number") {
        applyFabPosition(pos.x, pos.y);
      }
    } catch (e) {}
  }

  loadFabPosition();
  loadSupplementCatalog();
  function loadSupplementCatalog() {
    if (!supplementPick) return;
    fetch("/api/supplements/catalog")
      .then(function (r) {
        return r.ok ? r.json() : { items: [] };
      })
      .then(function (data) {
        supplementCatalog = data.items || [];
        supplementPick.innerHTML = '<option value="">Review a supplement…</option>';
        supplementCatalog.forEach(function (item) {
          var opt = document.createElement("option");
          opt.value = String(item.id);
          var label = item.name;
          if (item.dose) label += " · " + item.dose;
          if (!item.daily_track) label += " (considering)";
          opt.textContent = label;
          supplementPick.appendChild(opt);
        });
      })
      .catch(function () {});
  }

  function supplementPrompt(item) {
    if (!item) return "";
    var brand = item.dose ? " (" + item.dose + ")" : "";
    if ((item.schedule || "").toLowerCase() === "considering") {
      return (
        "I'm thinking about " + item.name + brand +
        ". Be honest — is it actually good for me? Check the brand quality and whether I should ask Dr. Ververis first."
      );
    }
    return (
      "Review my " + item.name + brand +
      ". Is it actually good for me? Critique the brand — I don't want sketchy product. Cross-check with my labs and migraines."
    );
  }

  if (supplementPick) {
    supplementPick.addEventListener("change", function () {
      selectedSupplementId = supplementPick.value || "";
      if (!selectedSupplementId) return;
      var item = supplementCatalog.find(function (s) {
        return String(s.id) === selectedSupplementId;
      });
      if (item) {
        input.value = supplementPrompt(item);
        if (photoMode) photoMode.value = "supplement";
        input.focus();
      }
    });
  }

  window.addEventListener("resize", function () {
    if (!toggle.classList.contains("is-docked-custom")) return;
    var rect = toggle.getBoundingClientRect();
    var p = applyFabPosition(rect.left, rect.top);
    saveFabPosition();
  });

  toggle.title = "Drag to move · Tap to open";

  toggle.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    fabDrag.active = true;
    fabDrag.moved = false;
    var rect = toggle.getBoundingClientRect();
    fabDrag.offsetX = e.clientX - rect.left;
    fabDrag.offsetY = e.clientY - rect.top;
    fabDrag.startX = e.clientX;
    fabDrag.startY = e.clientY;
    toggle.setPointerCapture(e.pointerId);
  });

  toggle.addEventListener("pointermove", function (e) {
    if (!fabDrag.active) return;
    if (Math.abs(e.clientX - fabDrag.startX) + Math.abs(e.clientY - fabDrag.startY) < 8) return;
    fabDrag.moved = true;
    toggle.classList.add("is-dragging");
    applyFabPosition(e.clientX - fabDrag.offsetX, e.clientY - fabDrag.offsetY);
  });

  function endFabDrag(e) {
    if (!fabDrag.active) return;
    fabDrag.active = false;
    toggle.classList.remove("is-dragging");
    if (e && e.pointerId != null) {
      try { toggle.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    if (fabDrag.moved) {
      saveFabPosition();
      fabDrag.suppressClick = true;
    }
  }

  toggle.addEventListener("pointerup", endFabDrag);
  toggle.addEventListener("pointercancel", endFabDrag);

  function openPanel() {
    panel.hidden = false;
    toggle.classList.add("open");
    document.body.classList.add("jarvis-open");
    loadNudges();
    input.focus();
  }

  function closePanel() {
    panel.hidden = true;
    toggle.classList.remove("open");
    document.body.classList.remove("jarvis-open");
  }

  function showWelcome() {
    addBubble("Hi Melani, let's get to work.", "assistant");
  }

  function renderHistory(items) {
    messages.innerHTML = "";
    (items || []).forEach(function (item) {
      if (!item || !item.content) return;
      var role = item.role === "user" ? "user" : "assistant";
      addBubble(item.content, role, null, item.gif_url || null);
    });
  }

  function loadChatHistory() {
    return fetch("/api/jarvis/history")
      .then(function (r) {
        return r.ok ? r.json() : { messages: [] };
      })
      .then(function (data) {
        var items = data.messages || [];
        if (items.length) {
          renderHistory(items);
        } else if (!messages.children.length) {
          showWelcome();
        }
      })
      .catch(function () {
        if (!messages.children.length) {
          showWelcome();
        }
      });
  }

  function resetChatUi() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    setBusy(false);
    removeThinking();
    clearPendingImage();
    messages.innerHTML = "";
    if (nudgesEl) nudgesEl.innerHTML = "";
    if (input) input.value = "";
    if (supplementPick) {
      supplementPick.value = "";
      selectedSupplementId = "";
    }
    if (photoMode) photoMode.value = "auto";
  }

  function startNewChat() {
    if (!window.confirm("Clear this conversation and start fresh?")) return;
    if (newChatBtn) newChatBtn.disabled = true;
    resetChatUi();
    fetch("/api/jarvis/new-chat", { method: "POST" })
      .then(function (r) {
        if (!r.ok) throw new Error("reset failed");
        return r.json();
      })
      .then(function () {
        showWelcome();
        if (input) input.focus();
      })
      .catch(function () {
        addBubble("Could not reset chat — try again.", "assistant");
      })
      .finally(function () {
        if (newChatBtn) newChatBtn.disabled = false;
      });
  }

  if (newChatBtn) {
    newChatBtn.addEventListener("click", startNewChat);
  }

  toggle.addEventListener("click", function () {
    if (fabDrag.suppressClick) {
      fabDrag.suppressClick = false;
      return;
    }
    if (panel.hidden) openPanel();
    else closePanel();
  });
  if (closeBtn) closeBtn.addEventListener("click", closePanel);

  function clearPendingImage() {
    pendingImage = null;
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = null;
    }
    if (imagePreview) imagePreview.hidden = true;
    if (previewImg) previewImg.removeAttribute("src");
    if (imageInput) imageInput.value = "";
    if (attachBtn) attachBtn.classList.remove("has-image");
  }

  function setPendingImage(file) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0) return;
    clearPendingImage();
    pendingImage = file;
    pendingPreviewUrl = URL.createObjectURL(file);
    if (previewImg) previewImg.src = pendingPreviewUrl;
    if (imagePreview) imagePreview.hidden = false;
    if (attachBtn) attachBtn.classList.add("has-image");
    input.focus();
  }

  if (attachBtn && imageInput) {
    attachBtn.addEventListener("click", function () {
      imageInput.click();
    });
    imageInput.addEventListener("change", function () {
      if (imageInput.files && imageInput.files[0]) {
        setPendingImage(imageInput.files[0]);
      }
    });
  }
  if (clearImageBtn) {
    clearImageBtn.addEventListener("click", clearPendingImage);
  }

  function isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.indexOf("image/") === 0) return true;
    return /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(file.name || "");
  }

  function extractImageFile(dataTransfer) {
    if (!dataTransfer) return null;
    if (dataTransfer.files && dataTransfer.files.length) {
      for (var i = 0; i < dataTransfer.files.length; i++) {
        if (isImageFile(dataTransfer.files[i])) return dataTransfer.files[i];
      }
    }
    if (dataTransfer.items) {
      for (var j = 0; j < dataTransfer.items.length; j++) {
        var item = dataTransfer.items[j];
        if (item.kind === "file") {
          var f = item.getAsFile();
          if (isImageFile(f)) return f;
        }
      }
    }
    return null;
  }

  function dragHasImage(dataTransfer) {
    if (!dataTransfer || !dataTransfer.types) return false;
    for (var i = 0; i < dataTransfer.types.length; i++) {
      if (dataTransfer.types[i] === "Files") return true;
    }
    return false;
  }

  function setupDragDrop() {
    var dragDepth = 0;

    function endDrag() {
      dragDepth = 0;
      panel.classList.remove("jarvis-drag-over");
    }

    panel.addEventListener("dragenter", function (e) {
      if (!dragHasImage(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth++;
      if (dragDepth === 1) panel.classList.add("jarvis-drag-over");
    });

    panel.addEventListener("dragover", function (e) {
      if (!dragHasImage(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });

    panel.addEventListener("dragleave", function (e) {
      if (!dragHasImage(e.dataTransfer)) return;
      dragDepth--;
      if (dragDepth <= 0) endDrag();
    });

    panel.addEventListener("drop", function (e) {
      e.preventDefault();
      endDrag();
      var file = extractImageFile(e.dataTransfer);
      if (file) setPendingImage(file);
    });

    toggle.addEventListener("dragover", function (e) {
      if (!dragHasImage(e.dataTransfer)) return;
      e.preventDefault();
      if (panel.hidden) openPanel();
    });

    toggle.addEventListener("drop", function (e) {
      if (!dragHasImage(e.dataTransfer)) return;
      e.preventDefault();
      if (panel.hidden) openPanel();
      var file = extractImageFile(e.dataTransfer);
      if (file) setPendingImage(file);
    });
  }

  function setupPaste() {
    panel.addEventListener("paste", function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf("image/") === 0) {
          e.preventDefault();
          var blob = items[i].getAsFile();
          if (blob) {
            var shot = new File([blob], "screenshot.png", { type: blob.type || "image/png" });
            setPendingImage(shot);
          }
          return;
        }
      }
    });
  }

  setupDragDrop();
  setupPaste();

  function formatJarvisText(text) {
    var wrap = document.createElement("div");
    wrap.className = "jarvis-formatted";
    var lines = (text || "").split("\n");
    lines.forEach(function (line, li) {
      if (li > 0) wrap.appendChild(document.createElement("br"));
      var re = /\*\*([^*]+)\*\*/g;
      var last = 0;
      var m;
      while ((m = re.exec(line)) !== null) {
        if (m.index > last) {
          wrap.appendChild(document.createTextNode(line.slice(last, m.index)));
        }
        var strong = document.createElement("strong");
        strong.textContent = m[1];
        wrap.appendChild(strong);
        last = m.index + m[0].length;
      }
      if (last < line.length) {
        wrap.appendChild(document.createTextNode(line.slice(last)));
      }
    });
    return wrap;
  }

  function addBubble(text, role, links, imageUrl) {
    var div = document.createElement("div");
    div.className = "jarvis-bubble " + role.replace(" thinking", "");
    if (role.indexOf("thinking") >= 0) div.classList.add("thinking");

    if (imageUrl) {
      var img = document.createElement("img");
      img.src = imageUrl;
      img.alt = "Attached image";
      img.className = "jarvis-bubble-image";
      div.appendChild(img);
    }

    if (text) {
      if (role.indexOf("thinking") >= 0 || role === "user") {
        var textEl = document.createElement("div");
        textEl.textContent = text;
        div.appendChild(textEl);
      } else {
        div.appendChild(formatJarvisText(text));
      }
    }

    messages.appendChild(div);
    if (links && links.length) {
      links.forEach(function (link) {
        var a = document.createElement("a");
        a.href = link.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "jarvis-link";
        a.textContent = link.store + " →";
        messages.appendChild(a);
      });
    }
    messages.scrollTop = messages.scrollHeight;
  }

  function removeThinking() {
    var t = messages.querySelector(".thinking");
    if (t) t.remove();
  }

  // ── Non-blocking chat: fire the job, then poll for the answer. This survives
  // tab switches / page reloads — the answer keeps generating on the server and
  // shows up whenever you come back. ──────────────────────────────────────────
  var pollTimer = null;

  function setBusy(busy) {
    if (sendBtn) sendBtn.disabled = busy;
    if (attachBtn) attachBtn.disabled = busy;
  }

  function attachExtrasToLastAssistant(links, gifUrl) {
    if (!gifUrl && (!links || !links.length)) return;
    var bubbles = messages.querySelectorAll(".jarvis-bubble.assistant");
    var last = bubbles[bubbles.length - 1];
    if (gifUrl) {
      var img = document.createElement("img");
      img.src = gifUrl;
      img.alt = "result";
      img.className = "jarvis-bubble-image";
      if (last) last.appendChild(img);
    }
    if (links && links.length) {
      links.forEach(function (link) {
        var a = document.createElement("a");
        a.href = link.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "jarvis-link";
        a.textContent = link.store + " →";
        messages.appendChild(a);
      });
    }
    messages.scrollTop = messages.scrollHeight;
  }

  function finishJob(result) {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    removeThinking();
    // Reload canonical history (saved on the server), then attach any links/gif.
    loadChatHistory().then(function () {
      attachExtrasToLastAssistant(result && result.links, result && result.gif_url);
      setBusy(false);
      if (supplementPick && selectedSupplementId) {
        supplementPick.value = "";
        selectedSupplementId = "";
      }
    });
  }

  function pollStatus() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    fetch("/api/jarvis/status")
      .then(function (r) { return r.ok ? r.json() : { pending: false }; })
      .then(function (s) {
        if (s.pending) {
          pollTimer = setTimeout(pollStatus, 700);
        } else {
          finishJob(s.result);
        }
      })
      .catch(function () {
        pollTimer = setTimeout(pollStatus, 1500);
      });
  }

  function showThinkingFor(question, kind) {
    var hint = kind === "image" ? "Reading your image…" : (kind === "log" || looksLikeLog(question) ? "Saving…" : "Thinking…");
    addBubble(hint, "assistant thinking");
    messages.scrollTop = messages.scrollHeight;
  }

  // If a previous question is still generating (e.g. you switched tabs), pick it
  // back up and show it resolving — nothing is lost.
  function resumePending() {
    fetch("/api/jarvis/status")
      .then(function (r) { return r.ok ? r.json() : { pending: false }; })
      .then(function (s) {
        if (!s.pending) return;
        if (s.question) addBubble(s.question, "user");
        showThinkingFor(s.question, s.kind);
        setBusy(true);
        pollStatus();
      })
      .catch(function () {});
  }

  function sendChat() {
    var q = (input.value || "").trim();
    if (!q && !pendingImage) return;
    if (sendBtn && sendBtn.disabled) return; // a job is already running

    var imageToSend = pendingImage;
    var bubbleUrl = imageToSend ? URL.createObjectURL(imageToSend) : null;
    addBubble(q || "📷 Image", "user", null, bubbleUrl);
    input.value = "";
    clearPendingImage();

    setBusy(true);
    showThinkingFor(q, imageToSend ? "image" : null);

    var fetchOpts = { method: "POST" };
    var mode = photoMode ? photoMode.value : "auto";
    if (imageToSend) {
      var form = new FormData();
      form.append("question", q);
      form.append("image", imageToSend, imageToSend.name || "photo.jpg");
      form.append("photo_mode", mode);
      if (selectedSupplementId) form.append("supplement_id", selectedSupplementId);
      fetchOpts.body = form;
    } else {
      fetchOpts.headers = { "Content-Type": "application/json" };
      var payload = { question: q, photo_mode: mode };
      if (selectedSupplementId) payload.supplement_id = parseInt(selectedSupplementId, 10);
      fetchOpts.body = JSON.stringify(payload);
    }

    fetch("/api/jarvis/chat", fetchOpts)
      .then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            throw new Error(d.detail || ("Server error " + r.status));
          });
        }
        return r.json();
      })
      .then(function () {
        // Job started — poll for the result (works even if you navigate away).
        pollStatus();
      })
      .catch(function (err) {
        removeThinking();
        addBubble(
          "Chat couldn't start. Refresh the page and try again.\n\n" + (err.message || ""),
          "assistant"
        );
        setBusy(false);
      });
  }

  sendBtn.addEventListener("click", sendChat);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendChat();
  });

  function looksLikeLog(text) {
    var q = (text || "").toLowerCase();
    if (!q) return false;
    return /(slept|sleep|brain fog|drank|water|ate|had|breakfast|lunch|dinner|weigh|period|workout|log |ml| lbs|felt|sick|fatigue|fog|vitamin|supplement|creatine|ashwagandha)/.test(q);
  }

  function renderNudges(nudges) {
    nudgesEl.innerHTML = "";
    (nudges || []).forEach(function (n) {
      var box = document.createElement("div");
      box.className = "jarvis-nudge";
      var p = document.createElement("p");
      p.textContent = n.message;
      box.appendChild(p);
      if (n.yes_no) {
        var row = document.createElement("div");
        row.className = "row";
        ["Yes", "No"].forEach(function (label) {
          var btn = document.createElement("button");
          btn.className = "secondary small";
          btn.textContent = label;
          btn.addEventListener("click", function () {
            fetch("/api/jarvis/nudge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: n.id, answer: label.toLowerCase() }),
            }).then(function () {
              box.remove();
              addBubble(label, "user");
              addBubble(
                label.toLowerCase() === "yes" ? "Logged brain fog: yes." : "Logged brain fog: no.",
                "assistant"
              );
            });
          });
          row.appendChild(btn);
        });
        box.appendChild(row);
      } else {
        var ok = document.createElement("button");
        ok.className = "secondary small";
        ok.textContent = "Got it";
        ok.addEventListener("click", function () {
          fetch("/api/jarvis/nudge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: n.id, answer: "ok" }),
          }).then(function () { box.remove(); });
        });
        box.appendChild(ok);
      }
      nudgesEl.appendChild(box);
    });
  }

  function loadNudges() {
    fetch("/api/jarvis/nudges")
      .then(function (r) { return r.ok ? r.json() : { nudges: [] }; })
      .then(function (data) { renderNudges(data.nudges || []); })
      .catch(function () {});
  }

  loadNudges();
  setInterval(loadNudges, 60000);

  loadChatHistory().then(resumePending);
})();
