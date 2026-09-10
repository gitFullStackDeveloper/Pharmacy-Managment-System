import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout, RequireRole } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logAudit, formatCurrency } from "@/lib/audit";
import { Search, Minus, Plus, Trash2, Receipt, ChevronRight, Tag, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pos")({
  component: () => <RequireRole allow={["admin", "counter"]}><POSPage /></RequireRole>,
});

type MedicineType = "tablet" | "capsule" | "syrup" | "injection" | "cream" | "drops" | "powder" | "other";
type MedicineUnit = "piece" | "ml" | "gram";
type SaleType = "variable" | "fixed";

type Product = {
  id: string; name: string; price: number; stock: number;
  category: string | null; medicine_type: MedicineType; unit: MedicineUnit; sale_type: SaleType;
  is_piece_able: boolean; dosage_strength: string | null;
  strength_value: number | null; strength_unit: string | null;
};
type CartItem = { product: Product; qty: number };
type DiscountRule = { id: string; name: string; type: "percentage" | "fixed"; value: number; min_subtotal: number };

function variantLabel(p: Product): string {
  if (p.strength_value != null && p.strength_unit) return `${p.strength_value}${p.strength_unit}`;
  return p.dosage_strength ?? "Standard";
}

function POSPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [selected, setSelected] = useState<Product | null>(null);
  const [variantGroup, setVariantGroup] = useState<Product[] | null>(null);
  const [qty, setQty] = useState("1");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState("");
  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const [lastSale, setLastSale] = useState<{ invoice_number: string; total: number; items: CartItem[]; subtotal: number; discount: number; created_at: string; customer: string } | null>(null);

  const load = async () => {
    const { data } = await supabase.from("products")
      .select("id,name,price,stock,category,medicine_type,unit,sale_type,is_piece_able,dosage_strength,strength_value,strength_unit")
      .gt("stock", 0).order("name");
    setProducts((data ?? []).map((p) => ({
      ...p,
      price: Number(p.price),
      stock: Number(p.stock),
      strength_value: p.strength_value != null ? Number(p.strength_value) : null,
    })) as unknown as Product[]);
  };
  const loadRules = async () => {
    const { data } = await supabase.from("discount_rules").select("*").eq("active", true);
    setRules((data ?? []).map((r) => ({ ...r, value: Number(r.value), min_subtotal: Number(r.min_subtotal) })) as DiscountRule[]);
  };
  useEffect(() => { load(); loadRules(); }, []);

  // Group products by base name (case-insensitive). Each suggestion represents
  // a base medicine; if multiple dosage/weight variants exist, we'll prompt the
  // cashier to pick one.
  type Suggestion = { key: string; name: string; variants: Product[] };
  const suggestions = useMemo<Suggestion[]>(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    // Support multi-token search like "panadol 500mg" — every token must match
    // somewhere in the searchable string (name + variant + type + category).
    const tokens = q.split(/\s+/).filter(Boolean);
    const matches = products.filter((p) => {
      const hay = [
        p.name,
        variantLabel(p),
        p.dosage_strength ?? "",
        p.category ?? "",
        p.medicine_type,
        p.unit,
      ].join(" ").toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
    const groups = new Map<string, Suggestion>();
    for (const p of matches) {
      const key = p.name.toLowerCase();
      const ex = groups.get(key);
      if (ex) ex.variants.push(p);
      else groups.set(key, { key, name: p.name, variants: [p] });
    }
    return Array.from(groups.values()).slice(0, 8);
  }, [products, search]);

  useEffect(() => { setHighlight(0); }, [search]);

  const subtotal = cart.reduce((s, it) => s + it.product.price * it.qty, 0);
  const { discount, appliedRule } = useMemo(() => {
    let best = 0; let rule: DiscountRule | null = null;
    for (const r of rules) {
      if (subtotal < r.min_subtotal) continue;
      const amt = r.type === "percentage" ? Math.min(subtotal, (subtotal * r.value) / 100) : Math.min(subtotal, r.value);
      if (amt > best) { best = amt; rule = r; }
    }
    return { discount: best, appliedRule: rule };
  }, [rules, subtotal]);
  const total = Math.max(0, subtotal - discount);

  const pickProduct = (p: Product) => {
    setSelected(p);
    setShowSuggest(false);
    setQty("1");
    setTimeout(() => qtyInputRef.current?.focus(), 0);
  };

  const pickSuggestion = (s: Suggestion) => {
    setShowSuggest(false);
    if (s.variants.length === 1) {
      pickProduct(s.variants[0]);
    } else {
      // Multiple dosage/weight variants — let the cashier choose.
      setVariantGroup(s.variants);
      setSelected(null);
      setSearch(s.name);
    }
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggest || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => {
        const next = Math.min(h + 1, suggestions.length - 1);
        const s = suggestions[next];
        if (s) setSearch(s.variants.length === 1 ? `${s.name} ${variantLabel(s.variants[0])}` : s.name);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => {
        const next = Math.max(h - 1, 0);
        const s = suggestions[next];
        if (s) setSearch(s.variants.length === 1 ? `${s.name} ${variantLabel(s.variants[0])}` : s.name);
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = suggestions[highlight];
      if (s) pickSuggestion(s);
    } else if (e.key === "Escape") {
      setShowSuggest(false);
    }
  };

  const addToCart = () => {
    if (!selected) return toast.error("Select a medicine first");
    let q = Number(qty);
    if (!q || q <= 0) return toast.error("Enter a valid quantity");
    if (!selected.is_piece_able) {
      if (!Number.isInteger(q)) return toast.error("This item is sold as a fixed product — whole units only");
    } else if (selected.unit === "piece" && !Number.isInteger(q)) {
      return toast.error("Piece-based items must be whole numbers");
    }
    const inCart = cart.find((c) => c.product.id === selected.id)?.qty ?? 0;
    if (inCart + q > selected.stock) return toast.error(`Only ${selected.stock - inCart} ${selected.unit} available`);
    setCart((c) => {
      const ex = c.find((it) => it.product.id === selected.id);
      if (ex) return c.map((it) => it.product.id === selected.id ? { ...it, qty: it.qty + q } : it);
      return [...c, { product: selected, qty: q }];
    });
    toast.success(`${selected.name} added (${q} ${selected.unit})`);
    setSelected(null);
    setQty("1");
    // Keep the variant picker open so cashier can add another size/strength
    // of the same medicine without re-searching. If there were no variants
    // (single product), clear the search to start a new lookup.
    if (!variantGroup) {
      setSearch("");
    } else {
      setTimeout(() => {
        const el = document.getElementById("variant-picker");
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 0);
    }
  };

  const change = (id: string, delta: number) => {
    setCart((c) => c.flatMap((it) => {
      if (it.product.id !== id) return [it];
      const step = it.product.sale_type === "fixed" ? 1 : (it.product.unit === "piece" ? 1 : 1);
      const q = it.qty + delta * step;
      if (q <= 0) return [];
      if (q > it.product.stock) { toast.error("Not enough stock"); return [it]; }
      return [{ ...it, qty: q }];
    }));
  };
  const remove = (id: string) => setCart((c) => c.filter((it) => it.product.id !== id));

  const checkout = async () => {
    if (!user) return;
    if (cart.length === 0) return toast.error("Cart is empty");
    setSubmitting(true);
    try {
      const invoice_number = `INV-${Date.now()}`;
      const { data: sale, error } = await supabase.from("sales").insert({
        invoice_number, cashier_id: user.id, customer_name: customer || null,
        subtotal, discount, total,
      }).select().single();
      if (error) throw error;

      const items = cart.map((it) => ({
        sale_id: sale.id, product_id: it.product.id, product_name: it.product.name,
        quantity: it.qty, unit_price: it.product.price, line_total: it.product.price * it.qty,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;

      await Promise.all(cart.map((it) =>
        supabase.from("products").update({ stock: it.product.stock - it.qty }).eq("id", it.product.id)
      ));

      await logAudit("sale.create", "sale", { invoice_number, total });
      setLastSale({ invoice_number, total, items: [...cart], subtotal, discount, created_at: new Date().toISOString(), customer: customer || "Walk-in" });
      setCart([]); setCustomer("");
      load();
      toast.success(`Sale ${invoice_number} completed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout title="Point of Sale">
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Steps header */}
          <div className="flex items-center gap-2 text-xs">
            <Step n={1} label="Search" active={!selected} done={!!selected} />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Step n={2} label="Quantity" active={!!selected} done={false} />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Step n={3} label="Cart" active={cart.length > 0} done={false} />
          </div>

          {/* Step 1: search */}
          <Card className="p-4 border-border/60">
            <Label className="text-xs mb-1.5 block">Step 1 — Search medicine</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
              <Input className="pl-9" placeholder="Type medicine name, type or category…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowSuggest(true); setSelected(null); }}
                onFocus={() => setShowSuggest(true)}
                onKeyDown={onSearchKeyDown}
                onBlur={() => setTimeout(() => setShowSuggest(false), 150)} />
              {showSuggest && suggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-[var(--shadow-elegant)] overflow-hidden max-h-80 overflow-y-auto">
                  {suggestions.map((s, i) => {
                    const first = s.variants[0];
                    const totalStock = s.variants.reduce((n, v) => n + v.stock, 0);
                    const isHi = i === highlight;
                    return (
                      <button key={s.key} type="button"
                        onMouseEnter={() => setHighlight(i)}
                        onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                        className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 border-b border-border/40 last:border-b-0 ${isHi ? "bg-secondary" : "hover:bg-secondary/60"}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {s.name}
                            {s.variants.length > 1 && (
                              <span className="ml-1.5 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">{s.variants.length} variants</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate capitalize">
                            {first.medicine_type}
                            {s.variants.length === 1 ? ` · ${variantLabel(first)}` : ""}
                            {" · "}{totalStock} {first.unit} available
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-primary whitespace-nowrap">
                          {s.variants.length === 1 ? `${formatCurrency(first.price)}/${first.unit}` : "Choose →"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Tip: use ↑ ↓ to navigate, <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Enter</kbd> to select.
            </p>
          </Card>

          {/* Variant picker (when same medicine has multiple dosage/weight options) */}
          {variantGroup && !selected && (
            <Card id="variant-picker" className="p-4 border-primary/40 bg-primary/5">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Choose dosage / weight — pick any variant, add it, then pick another</Label>
                <span className="text-[10px] text-muted-foreground">{variantGroup.length} variants</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {variantGroup.map((v) => (
                  <button key={v.id} type="button"
                    onClick={() => pickProduct(v)}
                    className="text-left p-3 rounded-lg border border-border hover:border-primary hover:bg-card transition-colors bg-card/60">
                    <p className="text-sm font-semibold">{variantLabel(v)}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{v.medicine_type} · {v.stock} {v.unit} in stock</p>
                    <p className="text-xs font-semibold text-primary mt-1">{formatCurrency(v.price)}/{v.unit}</p>
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setVariantGroup(null); setSearch(""); setSelected(null); }}>Done — new search</Button>
            </Card>
          )}

          {/* Step 2: quantity */}
          {selected && (
            <Card className="p-4 border-primary/40 bg-primary/5">
              <Label className="text-xs mb-1.5 block">Step 2 — Set quantity</Label>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-semibold">
                    {selected.name}<span className="text-muted-foreground font-normal"> · {variantLabel(selected)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {selected.medicine_type} · {formatCurrency(selected.price)} per {selected.unit} · {selected.stock} {selected.unit} in stock · {selected.is_piece_able ? "piece-able" : "fixed only"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantity ({selected.unit})</Label>
                  <Input type="number"
                    ref={qtyInputRef}
                    step={!selected.is_piece_able || selected.unit === "piece" ? "1" : "0.5"}
                    min={!selected.is_piece_able ? "1" : "0.01"}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addToCart(); } }}
                    className="w-32" />
                </div>
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Line total</p>
                  <p className="font-bold text-primary">{formatCurrency((Number(qty) || 0) * selected.price)}</p>
                </div>
                <Button onClick={addToCart} style={{ background: "var(--gradient-primary)" }}>
                  <Plus className="h-4 w-4 mr-1" /> Add to cart
                </Button>
                <Button variant="ghost" onClick={() => { setSelected(null); setSearch(""); }}>Cancel</Button>
              </div>
              {!selected.is_piece_able && (
                <p className="text-[11px] text-muted-foreground mt-2">⚠ Fixed product — only whole units allowed (e.g. 2 bottles).</p>
              )}
            </Card>
          )}

          {/* No default product grid — only show selected items via search */}
          {!selected && search.trim() === "" && (
            <Card className="p-8 border-dashed border-border/60 text-center text-sm text-muted-foreground">
              Start typing a medicine name above to see suggestions.
            </Card>
          )}
        </div>

        {/* Step 3: cart */}
        <Card className="p-4 border-border/60 h-fit lg:sticky lg:top-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Receipt className="h-4 w-4" /> Step 3 — Cart</h2>
          <div className="space-y-2 mb-3 max-h-[40vh] overflow-y-auto">
            {cart.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
            {cart.map((it) => (
              <div key={it.product.id} className="flex items-center gap-2 p-2 bg-secondary/40 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{it.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(it.product.price)}/{it.product.unit} × {it.qty} {it.product.unit}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => change(it.product.id, -1)}><Minus className="h-3 w-3" /></Button>
                  <span className="text-sm w-10 text-center tabular-nums">{it.qty}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => change(it.product.id, 1)}><Plus className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(it.product.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <div className="space-y-1.5"><Label className="text-xs">Customer (optional)</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Walk-in" /></div>
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex items-start justify-between text-sm text-muted-foreground gap-2">
              <span className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Discount {appliedRule && <span className="text-xs">({appliedRule.name})</span>}</span>
              <span>-{formatCurrency(discount)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-border"><span>Total</span><span className="text-primary">{formatCurrency(total)}</span></div>
            <Button className="w-full mt-2" onClick={checkout} disabled={submitting || cart.length === 0} style={{ background: "var(--gradient-primary)" }}>
              {submitting ? "Processing…" : "Complete sale"}
            </Button>
          </div>
        </Card>
      </div>

      {/* Receipt modal-style card after sale */}
      {lastSale && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 print:bg-transparent print:static print:p-0">
          <div className="bg-card max-w-sm w-full rounded-xl shadow-[var(--shadow-elegant)] p-6 print:shadow-none print:max-w-full" id="receipt">
            <div className="text-center border-b border-dashed border-border pb-3 mb-3">
              <h3 className="font-bold text-lg">Pharmacy Receipt</h3>
              <p className="text-xs text-muted-foreground font-mono">{lastSale.invoice_number}</p>
              <p className="text-xs text-muted-foreground">{new Date(lastSale.created_at).toLocaleString()}</p>
              <p className="text-xs">Customer: {lastSale.customer}</p>
            </div>
            <div className="space-y-1.5 text-sm">
              {lastSale.items.map((it) => (
                <div key={it.product.id} className="border-b border-dashed border-border/50 pb-1.5">
                  <p className="font-medium">
                    {it.product.name}
                    {it.product.dosage_strength ? <span className="font-normal text-muted-foreground"> · {it.product.dosage_strength}</span> : null}
                  </p>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{it.qty} {it.product.unit} × {formatCurrency(it.product.price)}</span>
                    <span className="font-medium text-foreground">{formatCurrency(it.qty * it.product.price)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-border mt-3 pt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(lastSale.subtotal)}</span></div>
              {lastSale.discount > 0 && <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>-{formatCurrency(lastSale.discount)}</span></div>}
              <div className="flex justify-between text-base font-bold pt-1 border-t border-border"><span>Grand Total</span><span className="text-primary">{formatCurrency(lastSale.total)}</span></div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-4">Thank you for your purchase 🌿</p>
            <div className="flex gap-2 mt-4 print:hidden">
              <Button variant="outline" className="flex-1" onClick={() => window.print()}>Print</Button>
              <Button className="flex-1" onClick={() => setLastSale(null)} style={{ background: "var(--gradient-primary)" }}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${active ? "bg-primary text-primary-foreground" : done ? "bg-secondary text-foreground" : "bg-muted text-muted-foreground"}`}>
      <span className="h-4 w-4 rounded-full bg-background/30 flex items-center justify-center text-[10px] font-bold">
        {done ? <Check className="h-3 w-3" /> : n}
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}
