import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout, RequireRole } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/audit";
import { TrendingUp, DollarSign, Package2 } from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: () => <RequireRole allow={["admin", "manager"]}><ReportsPage /></RequireRole>,
});

function ReportsPage() {
  const [data, setData] = useState({ today: 0, week: 0, month: 0, totalRevenue: 0, totalCost: 0, count: 0, topProducts: [] as { name: string; qty: number; revenue: number }[] });

  useEffect(() => {
    (async () => {
      const now = new Date();
      const startToday = new Date(now); startToday.setHours(0,0,0,0);
      const startWeek = new Date(now); startWeek.setDate(now.getDate() - 7);
      const startMonth = new Date(now); startMonth.setDate(now.getDate() - 30);

      const [{ data: sales }, { data: items }, { data: products }] = await Promise.all([
        supabase.from("sales").select("total, created_at"),
        supabase.from("sale_items").select("product_name, quantity, line_total"),
        supabase.from("products").select("cost"),
      ]);

      const sum = (arr: { total: number; created_at: string }[], from: Date) =>
        arr.filter((s) => new Date(s.created_at) >= from).reduce((s, r) => s + Number(r.total), 0);

      const totalRevenue = (sales ?? []).reduce((s, r) => s + Number(r.total), 0);
      const totalCost = (products ?? []).reduce((s, r) => s + Number(r.cost), 0);

      const productMap = new Map<string, { qty: number; revenue: number }>();
      (items ?? []).forEach((i) => {
        const cur = productMap.get(i.product_name) ?? { qty: 0, revenue: 0 };
        cur.qty += i.quantity;
        cur.revenue += Number(i.line_total);
        productMap.set(i.product_name, cur);
      });
      const topProducts = Array.from(productMap.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

      setData({
        today: sum(sales ?? [], startToday),
        week: sum(sales ?? [], startWeek),
        month: sum(sales ?? [], startMonth),
        totalRevenue, totalCost, count: sales?.length ?? 0, topProducts,
      });
    })();
  }, []);

  return (
    <DashboardLayout title="Reports">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Today" value={formatCurrency(data.today)} icon={DollarSign} />
        <Stat label="Last 7 days" value={formatCurrency(data.week)} icon={TrendingUp} />
        <Stat label="Last 30 days" value={formatCurrency(data.month)} icon={TrendingUp} />
        <Stat label="Total sales" value={String(data.count)} icon={Package2} />
      </div>

      <Card className="p-6 border-border/60 mb-6">
        <h2 className="font-semibold mb-4">Top selling products</h2>
        <div className="space-y-2">
          {data.topProducts.length === 0 && <p className="text-muted-foreground text-sm">No sales recorded yet.</p>}
          {data.topProducts.map((p, i) => (
            <div key={p.name} className="flex items-center gap-3">
              <span className="text-sm font-mono text-muted-foreground w-6">#{i + 1}</span>
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-primary font-semibold">{formatCurrency(p.revenue)}</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(p.revenue / data.topProducts[0].revenue) * 100}%`, background: "var(--gradient-primary)" }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.qty} units sold</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </DashboardLayout>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="p-5 border-border/60">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  );
}