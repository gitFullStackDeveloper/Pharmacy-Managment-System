import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout, RequireRole } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Calendar } from "lucide-react";

export const Route = createFileRoute("/inventory")({
  component: () => <RequireRole allow={["admin", "manager"]}><InventoryPage /></RequireRole>,
});

function InventoryPage() {
  const [products, setProducts] = useState<{ id: string; name: string; stock: number; low_stock_threshold: number; expiry_date: string | null; category: string | null }[]>([]);
  useEffect(() => {
    supabase.from("products").select("id,name,stock,low_stock_threshold,expiry_date,category").order("stock").then(({ data }) => setProducts(data ?? []));
  }, []);

  const lowStock = products.filter((p) => p.stock <= p.low_stock_threshold);
  const expired = products.filter((p) => p.expiry_date && new Date(p.expiry_date) < new Date());
  const expiringSoon = products.filter((p) => {
    if (!p.expiry_date) return false;
    const days = (new Date(p.expiry_date).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 30;
  });

  return (
    <DashboardLayout title="Inventory">
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <StatCard icon={AlertTriangle} label="Low stock" count={lowStock.length} tone="warning" />
        <StatCard icon={Calendar} label="Expiring within 30 days" count={expiringSoon.length} tone="warning" />
        <StatCard icon={Calendar} label="Expired" count={expired.length} tone="danger" />
      </div>

      <Section title="Low stock items" rows={lowStock} kind="stock" />
      <Section title="Expiring soon" rows={expiringSoon} kind="expiry" />
      <Section title="Expired items" rows={expired} kind="expiry" />
    </DashboardLayout>
  );
}

function StatCard({ icon: Icon, label, count, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; count: number; tone: "warning" | "danger" }) {
  return (
    <Card className="p-5 border-border/60">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className={`h-5 w-5 ${tone === "danger" ? "text-destructive" : "text-[oklch(0.7_0.18_60)]"}`} />
      </div>
      <p className="text-2xl font-bold">{count}</p>
    </Card>
  );
}

function Section({ title, rows, kind }: { title: string; rows: { id: string; name: string; stock: number; low_stock_threshold: number; expiry_date: string | null; category: string | null }[]; kind: "stock" | "expiry" }) {
  return (
    <Card className="border-border/60 mb-6 overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-secondary/40 font-semibold">{title} ({rows.length})</div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">{kind === "stock" ? "Stock / Threshold" : "Expiry date"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Nothing here.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.category ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {kind === "stock"
                    ? <Badge variant="destructive">{r.stock} / {r.low_stock_threshold}</Badge>
                    : <Badge variant="secondary">{r.expiry_date}</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}