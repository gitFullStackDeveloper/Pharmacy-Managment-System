import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { z } from "zod";
import { DashboardLayout, RequireRole } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { logAudit, formatCurrency } from "@/lib/audit";
import { Plus, Pencil, Trash2, Search, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/products")({
  component: () => (
    <RequireRole allow={["admin", "manager"]}>
      <ProductsPage />
    </RequireRole>
  ),
});

type MedicineType = "tablet" | "capsule" | "syrup" | "injection" | "cream" | "drops" | "powder" | "other";
type MedicineUnit = "piece" | "ml" | "gram";
type SaleType = "variable" | "fixed";

const MEDICINE_TYPES: MedicineType[] = ["tablet","capsule","syrup","injection","cream","drops","powder","other"];
const UNITS: MedicineUnit[] = ["piece","ml","gram"];
const SALE_TYPES: SaleType[] = ["variable","fixed"];

type Product = {
  id: string;
  name: string;
  category: string | null;
  sku: string | null;
  price: number;
  cost: number;
  stock: number;
  low_stock_threshold: number;
  expiry_date: string | null;
  supplier: string | null;
  medicine_type: MedicineType;
  unit: MedicineUnit;
  sale_type: SaleType;
  is_piece_able: boolean;
  dosage_strength: string | null;
  strength_value: number | null;
  strength_unit: string | null;
};

const productSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(150),
  category: z.string().trim().max(80).optional(),
  sku: z.string().trim().max(50).optional(),
  price: z.number().nonnegative().max(1000000),
  cost: z.number().nonnegative().max(1000000),
  stock: z.number().nonnegative().max(1000000),
  low_stock_threshold: z.number().int().nonnegative().max(10000),
  expiry_date: z.string().optional(),
  supplier: z.string().trim().max(150).optional(),
  medicine_type: z.enum(["tablet","capsule","syrup","injection","cream","drops","powder","other"]),
  unit: z.enum(["piece","ml","gram"]),
  sale_type: z.enum(["variable","fixed"]),
  is_piece_able: z.boolean(),
  dosage_strength: z.string().trim().max(50).optional(),
  strength_value: z.number().nonnegative().max(1000000).optional(),
  strength_unit: z.string().trim().max(20).optional(),
});

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("products").select("*").order("name");
    setProducts((data ?? []) as unknown as Product[]);
  };
  useEffect(() => { load(); }, []);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (p.category ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (p: Product) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    await logAudit("product.delete", "product", { id: p.id, name: p.name });
    toast.success("Product deleted");
    load();
  };

  const downloadTemplate = () => {
    const sample = [{
      name: "Paracetamol 500mg",
      category: "Painkiller",
      sku: "PCM-500",
      price: 5.5,
      cost: 3,
      stock: 100,
      low_stock_threshold: 10,
      expiry_date: "2026-12-31",
      supplier: "ACME Pharma",
      medicine_type: "tablet",
      unit: "piece",
      sale_type: "variable",
      is_piece_able: true,
      dosage_strength: "500mg",
      strength_value: 500,
      strength_unit: "mg",
    }];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "products_template.xlsx");
  };

  const exportAll = () => {
    if (products.length === 0) return toast.error("No products to export");
    const rows = products.map((p) => ({
      name: p.name, category: p.category ?? "", sku: p.sku ?? "",
      price: p.price, cost: p.cost, stock: p.stock,
      low_stock_threshold: p.low_stock_threshold,
      expiry_date: p.expiry_date ?? "", supplier: p.supplier ?? "",
      medicine_type: p.medicine_type, unit: p.unit, sale_type: p.sale_type,
      is_piece_able: p.is_piece_able,
      dosage_strength: p.dosage_strength ?? "",
      strength_value: p.strength_value ?? "",
      strength_unit: p.strength_unit ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, `products_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (rows.length === 0) { toast.error("Spreadsheet is empty"); return; }

      const payload: Record<string, unknown>[] = [];
      const errors: string[] = [];
      rows.forEach((r, i) => {
        const parsed = productSchema.safeParse({
          name: String(r.name ?? "").trim(),
          category: r.category ? String(r.category) : undefined,
          sku: r.sku ? String(r.sku) : undefined,
          price: Number(r.price ?? 0),
          cost: Number(r.cost ?? 0),
          stock: Number(r.stock ?? 0),
          low_stock_threshold: Number(r.low_stock_threshold ?? 10),
          expiry_date: r.expiry_date
            ? (r.expiry_date instanceof Date
                ? r.expiry_date.toISOString().slice(0, 10)
                : String(r.expiry_date).slice(0, 10))
            : undefined,
          supplier: r.supplier ? String(r.supplier) : undefined,
          medicine_type: (MEDICINE_TYPES.includes(String(r.medicine_type ?? "tablet").toLowerCase() as MedicineType)
            ? String(r.medicine_type ?? "tablet").toLowerCase()
            : "tablet") as MedicineType,
          unit: (UNITS.includes(String(r.unit ?? "piece").toLowerCase() as MedicineUnit)
            ? String(r.unit ?? "piece").toLowerCase()
            : "piece") as MedicineUnit,
          sale_type: (SALE_TYPES.includes(String(r.sale_type ?? "variable").toLowerCase() as SaleType)
            ? String(r.sale_type ?? "variable").toLowerCase()
            : "variable") as SaleType,
          is_piece_able: r.is_piece_able === undefined || r.is_piece_able === ""
            ? String(r.sale_type ?? "variable").toLowerCase() === "variable"
            : ["true","1","yes","y"].includes(String(r.is_piece_able).toLowerCase()),
          dosage_strength: r.dosage_strength ? String(r.dosage_strength) : undefined,
          strength_value: r.strength_value !== undefined && r.strength_value !== ""
            ? Number(r.strength_value) : undefined,
          strength_unit: r.strength_unit ? String(r.strength_unit) : undefined,
        });
        if (!parsed.success) {
          errors.push(`Row ${i + 2}: ${parsed.error.issues[0].message}`);
          return;
        }
        payload.push({
          ...parsed.data,
          category: parsed.data.category ?? null,
          sku: parsed.data.sku ?? null,
          expiry_date: parsed.data.expiry_date ?? null,
          supplier: parsed.data.supplier ?? null,
          dosage_strength: parsed.data.dosage_strength ?? null,
          strength_value: parsed.data.strength_value ?? null,
          strength_unit: parsed.data.strength_unit ?? null,
        });
      });

      if (payload.length === 0) {
        toast.error(errors[0] ?? "No valid rows found");
        return;
      }
      const { error } = await supabase.from("products").insert(payload as never);
      if (error) { toast.error(error.message); return; }
      await logAudit("product.import", "product", { count: payload.length, skipped: errors.length });
      toast.success(`Imported ${payload.length} products${errors.length ? ` (${errors.length} skipped)` : ""}`);
      if (errors.length) console.warn("Skipped rows:", errors);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <DashboardLayout title="Products">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, SKU, category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={downloadTemplate} title="Download Excel template">
            <Download className="h-4 w-4 mr-1" /> Template
          </Button>
          <Button variant="outline" onClick={exportAll} title="Export all products to Excel">
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4 mr-1" /> {importing ? "Importing…" : "Import Excel"}
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          <Button onClick={() => { setEditing(null); setOpen(true); }} style={{ background: "var(--gradient-primary)" }}>
            <Plus className="h-4 w-4 mr-1" /> Add product
          </Button>
        </div>
      </div>

      <Card className="border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Strength</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No products yet.</TableCell></TableRow>
              )}
              {filtered.map((p) => {
                const low = p.stock <= p.low_stock_threshold;
                const expired = p.expiry_date && new Date(p.expiry_date) < new Date();
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{p.medicine_type}</Badge></TableCell>
                    <TableCell className="text-xs">{p.dosage_strength ? `${p.dosage_strength}` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={p.is_piece_able ? "secondary" : "default"} className="capitalize">
                        {p.is_piece_able ? "piece-able" : "fixed only"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.sku ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(p.price))}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={low ? "destructive" : "secondary"}>{p.stock} {p.unit}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.expiry_date ? (
                        <span className={expired ? "text-destructive font-medium" : ""}>{p.expiry_date}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(p); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ProductDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={load} />
    </DashboardLayout>
  );
}

function ProductDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Product | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "", category: "", sku: "", price: "0", cost: "0", stock: "0",
    low_stock_threshold: "10", expiry_date: "", supplier: "",
    medicine_type: "tablet" as MedicineType,
    unit: "piece" as MedicineUnit,
    sale_type: "variable" as SaleType,
    is_piece_able: true,
    dosage_strength: "",
    strength_value: "",
    strength_unit: "mg",
    pack_size: "1",
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name, category: editing.category ?? "", sku: editing.sku ?? "",
        price: String(editing.price), cost: String(editing.cost), stock: String(editing.stock),
        low_stock_threshold: String(editing.low_stock_threshold),
        expiry_date: editing.expiry_date ?? "", supplier: editing.supplier ?? "",
        medicine_type: editing.medicine_type, unit: editing.unit, sale_type: editing.sale_type,
        is_piece_able: editing.is_piece_able,
        dosage_strength: editing.dosage_strength ?? "",
        strength_value: editing.strength_value != null ? String(editing.strength_value) : "",
        strength_unit: editing.strength_unit ?? "mg",
        pack_size: "1",
      });
    } else {
      setForm({ name: "", category: "", sku: "", price: "0", cost: "0", stock: "0", low_stock_threshold: "10", expiry_date: "", supplier: "", medicine_type: "tablet", unit: "piece", sale_type: "variable", is_piece_able: true, dosage_strength: "", strength_value: "", strength_unit: "mg", pack_size: "1" });
    }
  }, [editing, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = productSchema.safeParse({
      name: form.name, category: form.category || undefined, sku: form.sku || undefined,
      price: Number(form.price), cost: Number(form.cost), stock: Number(form.stock),
      low_stock_threshold: Number(form.low_stock_threshold),
      expiry_date: form.expiry_date || undefined, supplier: form.supplier || undefined,
      medicine_type: form.medicine_type, unit: form.unit, sale_type: form.sale_type,
      is_piece_able: form.is_piece_able,
      dosage_strength: form.dosage_strength
        || (form.strength_value ? `${form.strength_value}${form.strength_unit}` : undefined),
      strength_value: form.strength_value ? Number(form.strength_value) : undefined,
      strength_unit: form.strength_unit || undefined,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);

    const payload = {
      ...parsed.data,
      category: parsed.data.category ?? null,
      sku: parsed.data.sku ?? null,
      expiry_date: parsed.data.expiry_date ?? null,
      supplier: parsed.data.supplier ?? null,
      dosage_strength: parsed.data.dosage_strength ?? null,
      strength_value: parsed.data.strength_value ?? null,
      strength_unit: parsed.data.strength_unit ?? null,
      updated_at: new Date().toISOString(),
    };

    if (editing) {
      const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      await logAudit("product.update", "product", { id: editing.id, name: payload.name });
      toast.success("Product updated");
    } else {
      const { error, data } = await supabase.from("products").insert(payload).select().single();
      if (error) return toast.error(error.message);
      await logAudit("product.create", "product", { id: data?.id, name: payload.name });
      toast.success("Product added");
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Category"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="Medicine type *">
              <select className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm capitalize"
                value={form.medicine_type}
                onChange={(e) => setForm({ ...form, medicine_type: e.target.value as MedicineType })}>
                {MEDICINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Unit *">
              <select className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm capitalize"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value as MedicineUnit })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Sale type *">
              <select className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm capitalize"
                value={form.sale_type}
                onChange={(e) => setForm({ ...form, sale_type: e.target.value as SaleType })}>
                <option value="variable">variable (partial allowed)</option>
                <option value="fixed">fixed (full pack only)</option>
              </select>
            </Field>
            <Field label="Sellable in pieces? *">
              <select className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
                value={form.is_piece_able ? "true" : "false"}
                onChange={(e) => setForm({ ...form, is_piece_able: e.target.value === "true" })}>
                <option value="true">Yes — partial pieces allowed</option>
                <option value="false">No — fixed product only</option>
              </select>
            </Field>
            <Field label="Strength / size value">
              <Input type="number" step="0.01" value={form.strength_value} placeholder="e.g. 500"
                onChange={(e) => setForm({ ...form, strength_value: e.target.value })} />
            </Field>
            <Field label="Strength / size unit">
              <select className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
                value={form.strength_unit}
                onChange={(e) => setForm({ ...form, strength_unit: e.target.value })}>
                <option value="mg">mg</option>
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="mcg">mcg</option>
                <option value="iu">IU</option>
                <option value="%">%</option>
              </select>
            </Field>
            <Field label="SKU"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
            <Field label="Supplier"><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
            <Field label="Price per unit *"><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></Field>
            <Field label="Cost"><Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
            <Field label={`Stock (${form.unit})`}><Input type="number" step={form.unit === "piece" ? "1" : "0.01"} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
            <Field label="Low-stock threshold"><Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} /></Field>
            <Field label="Expiry date"><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
          </div>
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
            <p className="text-xs font-medium mb-2">Quick per-unit price calculator</p>
            <div className="grid grid-cols-3 gap-2 items-end">
              <Field label="Pack size"><Input type="number" step="0.01" value={form.pack_size} onChange={(e) => setForm({ ...form, pack_size: e.target.value })} /></Field>
              <Field label="Pack price"><Input type="number" step="0.01" placeholder="e.g. 120" id="pack_price_calc" /></Field>
              <Button type="button" variant="outline" size="sm" onClick={() => {
                const el = document.getElementById("pack_price_calc") as HTMLInputElement | null;
                const ps = Number(form.pack_size);
                const pp = Number(el?.value);
                if (!ps || !pp) return toast.error("Enter pack size & price");
                setForm({ ...form, price: (pp / ps).toFixed(4) });
                toast.success("Per-unit price applied");
              }}>Apply</Button>
            </div>
          </div>
          <Button type="submit" className="w-full" style={{ background: "var(--gradient-primary)" }}>
            {editing ? "Save changes" : "Add product"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}