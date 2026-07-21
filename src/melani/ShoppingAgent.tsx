import {
  ArrowRight,
  ArrowSquareOut,
  Check,
  Plus,
  ShoppingCartSimple,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import {
  COSTCO_LOGIN_URL,
  COSTCO_STOREFRONT_URL,
  costcoSameDaySearchUrl,
  loadCostcoPlan,
  loadInventory,
  missingItems,
  saveCostcoPlan,
  saveInventory,
  SHOPPING_EVENT,
  storeSearchUrl,
  type CostcoPlan,
  type HomeItem,
  type StockState,
} from "./shoppingStore";
import "./shopping-agent.css";

const STATES: StockState[] = ["out", "low", "stocked"];

export function ShoppingAgent() {
  const [items, setItems] = useState<HomeItem[]>(loadInventory);
  const [plan, setPlan] = useState<CostcoPlan | null>(loadCostcoPlan);
  const [name, setName] = useState("");
  const [area, setArea] = useState("Home");
  const [launching, setLaunching] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const sync = () => {
      setItems(loadInventory());
      setPlan(loadCostcoPlan());
    };
    window.addEventListener(SHOPPING_EVENT, sync);
    return () => window.removeEventListener(SHOPPING_EVENT, sync);
  }, []);

  const missing = useMemo(() => missingItems(items), [items]);
  const areas = useMemo(() => [...new Set(items.map((item) => item.area))], [items]);
  const activePlanItems = plan?.items.filter((item) => !item.done) || [];

  function update(id: string, state: StockState) {
    const next = items.map((item) =>
      item.id === id ? { ...item, state, updatedAt: new Date().toISOString() } : item
    );
    setItems(next);
    saveInventory(next);
  }

  function add() {
    const clean = name.trim();
    if (!clean) return;
    const next = [
      ...items,
      {
        id: `home-${Date.now()}`,
        name: clean,
        area,
        state: "low" as const,
        preferredStore: "either" as const,
        updatedAt: new Date().toISOString(),
      },
    ];
    setItems(next);
    saveInventory(next);
    setName("");
  }

  function patchPlan(next: CostcoPlan | null) {
    setPlan(next);
    saveCostcoPlan(next);
  }

  function removePlanItem(id: string) {
    if (!plan) return;
    const nextItems = plan.items.filter((item) => item.id !== id);
    patchPlan(nextItems.length ? { ...plan, items: nextItems } : null);
  }

  function finishPlanItem(id: string) {
    if (!plan) return;
    patchPlan({
      ...plan,
      items: plan.items.map((item) => item.id === id ? { ...item, done: true } : item),
    });
  }

  async function launchCostcoPlan() {
    if (!plan || !activePlanItems.length || launching) return;
    const popup = window.open("about:blank", "wonder-costco-shopping");
    if (popup) popup.opener = null;
    setLaunching(true);
    setNotice("");
    let destination = costcoSameDaySearchUrl(activePlanItems[0].name);
    let usedShoppingList = false;
    try {
      const response = await fetch("/api/instacart/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Melani Costco run",
          items: activePlanItems.map((item) => ({ name: item.name, quantity: item.quantity })),
        }),
      });
      const payload = await response.json() as { url?: string };
      if (response.ok && payload.url) {
        destination = payload.url;
        usedShoppingList = true;
      }
    } catch {
      /* Costco Same-Day search remains the no-setup fallback. */
    }

    if (popup) popup.location.href = destination;
    else window.open(destination, "_blank", "noopener,noreferrer");
    const launched = {
      ...plan,
      launchedAt: new Date().toISOString(),
      launchUrl: destination,
    };
    patchPlan(launched);
    setNotice(
      usedShoppingList
        ? "Shopping list opened. Review the matched products, choose Costco, then add them to your cart."
        : "Costco Same-Day opened on the first item. Use the item links here to finish the run."
    );
    setLaunching(false);
  }

  return (
    <div className="shop-agent">
      <header className="shop-hero">
        <p className="shop-eyebrow">House intelligence</p>
        <h1>{missing.length ? `${missing.length} things need attention` : "The house is stocked"}</h1>
        <p>Tell Mel what is low, or give Mel a Costco list. Your account and payment stay with Costco.</p>
      </header>

      <section className="shop-costco">
        <div className="shop-costco-head">
          <div>
            <p>Costco Same-Day</p>
            <h2>{activePlanItems.length ? `${activePlanItems.length} items ready` : "Your Costco account"}</h2>
          </div>
          <div className="shop-costco-links">
            <a href={COSTCO_LOGIN_URL} target="_blank" rel="noreferrer">Sign in <ArrowSquareOut size={13} /></a>
            <a href={COSTCO_STOREFRONT_URL} target="_blank" rel="noreferrer">Open store <ArrowSquareOut size={13} /></a>
          </div>
        </div>

        {plan?.items.length ? (
          <div className="shop-costco-plan">
            {plan.items.map((item) => (
              <div key={item.id} className={item.done ? "is-done" : ""}>
                <span className="shop-costco-qty">{item.quantity}</span>
                <strong>{item.name}</strong>
                <a
                  href={costcoSameDaySearchUrl(item.name)}
                  target="_blank"
                  rel="noreferrer"
                  title={`Find ${item.name} at Costco`}
                >
                  Find <ArrowSquareOut size={12} />
                </a>
                <button type="button" onClick={() => finishPlanItem(item.id)} title="Mark added">
                  <Check size={14} />
                </button>
                <button type="button" onClick={() => removePlanItem(item.id)} title="Remove from list">
                  <X size={13} />
                </button>
              </div>
            ))}
            <footer>
              <button type="button" className="shop-costco-launch" onClick={() => void launchCostcoPlan()} disabled={!activePlanItems.length || launching}>
                <ShoppingCartSimple size={16} />
                {launching ? "Preparing" : "Confirm and shop"}
                <ArrowRight size={14} />
              </button>
              <button type="button" className="shop-costco-clear" onClick={() => patchPlan(null)}>Clear</button>
            </footer>
            {notice ? <p className="shop-costco-notice">{notice}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="shop-missing">
        <div className="shop-section-head">
          <div><p>Next order</p><h2>Missing and running low</h2></div><span>{missing.length}</span>
        </div>
        {!missing.length ? (
          <p className="shop-empty"><Check size={18} /> No restock needed.</p>
        ) : (
          <div className="shop-order-list">
            {missing.map((item) => (
              <article key={item.id}>
                <div><strong>{item.name}</strong><span>{item.area} · {item.state}</span></div>
                <div className="shop-store-actions">
                  <a href={storeSearchUrl("costco", item.name)} target="_blank" rel="noreferrer" title="Find at Costco">Costco <ArrowSquareOut size={13} /></a>
                  <a href={storeSearchUrl("walmart", item.name)} target="_blank" rel="noreferrer" title="Find at Walmart">Walmart <ArrowSquareOut size={13} /></a>
                  <button onClick={() => update(item.id, "stocked")} title="Mark stocked"><Check size={15} /></button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="shop-inventory">
        <div className="shop-section-head"><div><p>Live inventory</p><h2>What is in your house</h2></div></div>
        <div className="shop-add">
          <input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} placeholder="Add an item" />
          <select value={area} onChange={(event) => setArea(event.target.value)}>
            {[...areas, ...(areas.includes("Home") ? [] : ["Home"])].map((value) => <option key={value}>{value}</option>)}
          </select>
          <button onClick={add} aria-label="Add item"><Plus size={16} /></button>
        </div>
        <div className="shop-areas">
          {areas.map((areaName) => (
            <div key={areaName} className="shop-area">
              <h3>{areaName}</h3>
              {items.filter((item) => item.area === areaName).map((item) => (
                <div className="shop-stock-row" key={item.id}>
                  <span>{item.name}</span>
                  <div>{STATES.map((state) => <button key={state} className={item.state === state ? "is-active" : ""} onClick={() => update(item.id, state)}>{state}</button>)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function isShoppingAgentPage(pageId: string) {
  return pageId === "pg-agent-shopping";
}
