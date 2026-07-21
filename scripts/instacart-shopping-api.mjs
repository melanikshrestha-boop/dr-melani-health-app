function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length > 64_000) throw new Error("Shopping list is too large.");
  return JSON.parse(raw || "{}");
}

function normalizedItems(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      name: String(item?.name || "").trim(),
      quantity: Math.max(1, Math.min(99, Number(item?.quantity) || 1)),
    }))
    .filter((item) => item.name)
    .slice(0, 50);
}

export function instacartShoppingApi({ env = {} } = {}) {
  return {
    name: "wonder-instacart-shopping-api",
    configureServer(server) {
      server.middlewares.use("/api/instacart/shopping-list", async (req, res) => {
        if (req.method !== "POST") {
          json(res, 405, { error: "Method not allowed" });
          return;
        }

        const apiKey = String(env.INSTACART_API_KEY || process.env.INSTACART_API_KEY || "").trim();
        if (!apiKey) {
          json(res, 503, {
            configured: false,
            error: "Instacart shopping-list access is not configured.",
          });
          return;
        }

        try {
          const input = await readBody(req);
          const items = normalizedItems(input.items);
          if (!items.length) {
            json(res, 400, { error: "At least one shopping item is required." });
            return;
          }

          const baseUrl = String(
            env.INSTACART_API_BASE_URL
              || process.env.INSTACART_API_BASE_URL
              || "https://connect.instacart.com"
          ).replace(/\/$/, "");
          const response = await fetch(`${baseUrl}/idp/v1/products/products_link`, {
            method: "POST",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: String(input.title || "Wonder shopping list").slice(0, 120),
              link_type: "shopping_list",
              expires_in: 365,
              line_items: items.map((item) => ({
                name: item.name,
                display_text: item.quantity > 1 ? `${item.quantity} x ${item.name}` : item.name,
                line_item_measurements: [{ quantity: item.quantity, unit: "each" }],
              })),
            }),
            signal: AbortSignal.timeout(15_000),
          });
          const payload = await response.json().catch(() => ({}));
          const url = payload.products_link_url;
          if (!response.ok || typeof url !== "string") {
            json(res, response.status || 502, {
              configured: true,
              error: payload.error || payload.message || "Instacart could not create the shopping list.",
            });
            return;
          }
          json(res, 200, { configured: true, url });
        } catch (error) {
          json(res, 502, {
            configured: true,
            error: error instanceof Error ? error.message : "Shopping-list service is unavailable.",
          });
        }
      });
    },
  };
}
