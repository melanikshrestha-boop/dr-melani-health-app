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

  function updateProductsSummary(summary) {
    var meta = document.getElementById("hygiene_products_meta");
    if (meta && summary) meta.textContent = summary;
  }

  function laneListId(lane) {
    if (lane === "buy_next") return "hygiene_products_buy_next";
    if (lane === "researching") return "hygiene_products_researching";
    return "hygiene_products_using";
  }

  function ensureLaneEmpty(lane) {
    var list = document.getElementById(laneListId(lane));
    if (!list) return;
    var panel = list.closest(".hygiene-lane-panel");
    var empty = panel && panel.querySelector('[data-lane-empty="' + lane + '"]');
    if (!list.children.length && !empty && panel) {
      var hint = document.createElement("p");
      hint.className = "zone-hint hygiene-products-empty";
      hint.dataset.laneEmpty = lane;
      hint.textContent =
        lane === "using"
          ? "Products you use now — mark Low or Out when restocking."
          : lane === "researching"
            ? "Things you're looking into — add a short note why."
            : "Decided purchases — push to Shop when ready.";
      list.after(hint);
    } else if (list.children.length && empty) {
      empty.remove();
    }
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  function renderUsingRow(p) {
    var li = document.createElement("li");
    li.className = "hygiene-product-row product-level-" + p.level;
    li.dataset.productId = p.id;
    li.dataset.lane = "using";
    li.innerHTML =
      '<span class="hygiene-product-name"></span>' +
      '<div class="hygiene-product-levels">' +
      ["ok", "low", "out"]
        .map(function (lvl) {
          return (
            '<button type="button" class="hygiene-level-btn' +
            (p.level === lvl ? " active" : "") +
            '" data-level="' +
            lvl +
            '">' +
            (lvl === "ok" ? "OK" : lvl === "low" ? "Low" : "Out") +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<button type="button" class="secondary small hygiene-product-move" data-lane="researching" title="Move to Researching">→</button>' +
      '<button type="button" class="hygiene-product-delete secondary small" aria-label="Remove product">×</button>';
    li.querySelector(".hygiene-product-name").innerHTML =
      escapeHtml(p.name) + '<small class="hygiene-product-cat">' + escapeHtml(p.category || "other") + "</small>";
    return li;
  }

  function renderResearchRow(p) {
    var li = document.createElement("li");
    li.className = "hygiene-product-row";
    li.dataset.productId = p.id;
    li.dataset.lane = "researching";
    li.innerHTML =
      '<div class="hygiene-product-info">' +
      '<span class="hygiene-product-name"></span>' +
      (p.note ? '<span class="hygiene-product-note"></span>' : "") +
      "</div>" +
      '<button type="button" class="secondary small hygiene-product-move" data-lane="buy_next">Buy next</button>' +
      '<button type="button" class="secondary small hygiene-product-move" data-lane="using">Using</button>' +
      '<button type="button" class="hygiene-product-delete secondary small" aria-label="Remove product">×</button>';
    li.querySelector(".hygiene-product-name").innerHTML =
      escapeHtml(p.name) + '<small class="hygiene-product-cat">' + escapeHtml(p.category || "other") + "</small>";
    if (p.note) li.querySelector(".hygiene-product-note").textContent = p.note;
    return li;
  }

  function renderBuyNextRow(p) {
    var li = document.createElement("li");
    li.className = "hygiene-product-row" + (p.shop_added ? " hygiene-product-shopped" : "");
    li.dataset.productId = p.id;
    li.dataset.lane = "buy_next";
    var shopBtn = p.shop_added
      ? '<span class="hygiene-shop-added muted">In Shop</span>'
      : '<button type="button" class="btn small hygiene-shop-add">Add to Shop</button>';
    li.innerHTML =
      '<div class="hygiene-product-info">' +
      '<span class="hygiene-product-name"></span>' +
      (p.note ? '<span class="hygiene-product-note"></span>' : "") +
      "</div>" +
      shopBtn +
      '<button type="button" class="secondary small hygiene-product-move" data-lane="using">Using</button>' +
      '<button type="button" class="hygiene-product-delete secondary small" aria-label="Remove product">×</button>';
    li.querySelector(".hygiene-product-name").innerHTML =
      escapeHtml(p.name) + '<small class="hygiene-product-cat">' + escapeHtml(p.category || "other") + "</small>";
    if (p.note) li.querySelector(".hygiene-product-note").textContent = p.note;
    return li;
  }

  function renderProductRow(p) {
    var lane = p.lane || "using";
    if (lane === "researching") return renderResearchRow(p);
    if (lane === "buy_next") return renderBuyNextRow(p);
    return renderUsingRow(p);
  }

  function refreshProductLanes(byLane, summary) {
    ["using", "researching", "buy_next"].forEach(function (lane) {
      var list = document.getElementById(laneListId(lane));
      if (!list) return;
      list.innerHTML = "";
      (byLane[lane] || []).forEach(function (p) {
        list.appendChild(renderProductRow(p));
      });
      ensureLaneEmpty(lane);
    });
    updateProductsSummary(summary);
  }

  var productsCard = document.getElementById("hygiene_products_card");
  if (!productsCard) return;

  productsCard.querySelectorAll(".hygiene-lane-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var lane = tab.dataset.lane;
      productsCard.querySelectorAll(".hygiene-lane-tab").forEach(function (t) {
        t.classList.toggle("active", t === tab);
      });
      productsCard.querySelectorAll(".hygiene-lane-panel").forEach(function (panel) {
        panel.classList.toggle("active", panel.dataset.lanePanel === lane);
      });
    });
  });

  productsCard.addEventListener("click", function (e) {
    var levelBtn = e.target.closest(".hygiene-level-btn");
    if (levelBtn) {
      var row = levelBtn.closest(".hygiene-product-row");
      api("/api/hygiene/product", { action: "level", product_id: row.dataset.productId, level: levelBtn.dataset.level })
        .then(function (data) {
          refreshProductLanes(data.products_by_lane, data.summary);
        })
        .catch(function (err) {
          alert(err.message || "Could not update product.");
        });
      return;
    }

    var moveBtn = e.target.closest(".hygiene-product-move");
    if (moveBtn) {
      var moveRow = moveBtn.closest(".hygiene-product-row");
      api("/api/hygiene/product", {
        action: "lane",
        product_id: moveRow.dataset.productId,
        lane: moveBtn.dataset.lane,
      })
        .then(function (data) {
          refreshProductLanes(data.products_by_lane, data.summary);
        })
        .catch(function (err) {
          alert(err.message || "Could not move product.");
        });
      return;
    }

    var shopBtn = e.target.closest(".hygiene-shop-add");
    if (shopBtn) {
      var shopRow = shopBtn.closest(".hygiene-product-row");
      shopBtn.disabled = true;
      api("/api/hygiene/product", { action: "shop", product_id: shopRow.dataset.productId })
        .then(function (data) {
          refreshProductLanes(data.products_by_lane, data.summary);
        })
        .catch(function (err) {
          alert(err.message || "Could not add to Shop.");
        })
        .finally(function () {
          shopBtn.disabled = false;
        });
      return;
    }

    var delBtn = e.target.closest(".hygiene-product-delete");
    if (delBtn) {
      var rowDel = delBtn.closest(".hygiene-product-row");
      if (!confirm("Remove this product?")) return;
      api("/api/hygiene/product", { action: "delete", product_id: rowDel.dataset.productId })
        .then(function (data) {
          refreshProductLanes(data.products_by_lane, data.summary);
        })
        .catch(function (err) {
          alert(err.message || "Could not remove product.");
        });
    }
  });

  var productInput = document.getElementById("hygiene_product_input");
  var productCategory = document.getElementById("hygiene_product_category");
  var productLane = document.getElementById("hygiene_product_lane");
  var productNote = document.getElementById("hygiene_product_note");
  var productAdd = document.getElementById("hygiene_product_add");

  function addProduct() {
    var name = (productInput.value || "").trim();
    if (!name) {
      productInput.focus();
      return;
    }
    productAdd.disabled = true;
    api("/api/hygiene/product", {
      action: "add",
      name: name,
      category: productCategory ? productCategory.value : "other",
      lane: productLane ? productLane.value : "using",
      note: productNote ? productNote.value : "",
    })
      .then(function (data) {
        refreshProductLanes(data.products_by_lane, data.summary);
        productInput.value = "";
        if (productNote) productNote.value = "";
        var lane = productLane ? productLane.value : "using";
        productsCard.querySelectorAll(".hygiene-lane-tab").forEach(function (t) {
          t.classList.toggle("active", t.dataset.lane === lane);
        });
        productsCard.querySelectorAll(".hygiene-lane-panel").forEach(function (panel) {
          panel.classList.toggle("active", panel.dataset.lanePanel === lane);
        });
      })
      .catch(function (err) {
        alert(err.message || "Could not add product.");
      })
      .finally(function () {
        productAdd.disabled = false;
      });
  }

  productAdd?.addEventListener("click", addProduct);
  productInput?.addEventListener("keydown", function (e) {
    if (e.key === "Enter") addProduct();
  });
})();
