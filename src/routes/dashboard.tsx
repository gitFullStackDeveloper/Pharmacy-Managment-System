import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout, RequireRole } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/audit";
import { Package, ShoppingCart, AlertTriangle, DollarSign, TrendingUp, CalendarDays } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <RequireRole allow={["admin", "manager", "counter"]}>
      <DashboardPage />
    </RequireRole>
  ),
});

type SaleRow = { total: number; created_at: string };
type ItemRow = { product_name: string; quantity: number; line_total: number };

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function daysAgo(n: number) { const d = startOfDay(new Date()); d.setDate(d.getDate() - n); return d; }

function DashboardPage() {
  const { role, user } = useAuth();
  const [stats, setStats] = useState({
    products: 0, lowStock: 0,
    todaySales: 0, todayRevenue: 0,
    weekRevenue: 0, monthRevenue: 0,
  });
  const [daily, setDaily] = useState<{ day: string; revenue: number; sales: number }[]>([]);
  const [topItems, setTopItems] = useState<{ name: string; revenue: number }[]>([]);
  const [typeBreakdown, setTypeBreakdown] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    (async () => {
      const today = startOfDay(new Date());
      const monthStart = daysAgo(29);
      const weekStart = daysAgo(6);

      const baseSales = supabase.from("sales").select("total, created_at").gte("created_at", monthStart.toISOString()).order("created_at");
      const salesQuery = role === "counter" ? baseSales.eq("cashier_id", user?.id ?? "") : baseSales;

      const [{ count: pCount }, { data: lowStock }, { data: salesMonth }, { data: items }, { data: typeData }] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("products").select("id, stock, low_stock_threshold"),
        salesQuery,
        supabase.from("sale_items").select("product_name, quantity, line_total").limit(2000),
        supabase.from("products").select("medicine_type"),
      ]);

      const low = (lowStock ?? []).filter((p) => Number(p.stock) <= Number(p.low_stock_threshold)).length;
      const sm = (salesMonth ?? []) as SaleRow[];

      const todayRows = sm.filter((s) => new Date(s.created_at) >= today);
      const weekRows = sm.filter((s) => new Date(s.created_at) >= weekStart);
      const todayRevenue = todayRows.reduce((s, r) => s + Number(r.total), 0);
      const weekRevenue = weekRows.reduce((s, r) => s + Number(r.total), 0);
      const monthRevenue = sm.reduce((s, r) => s + Number(r.total), 0);

      // Build 30-day series
      const buckets = new Map<string, { revenue: number; sales: number }>();
      for (let i = 29; i >= 0; i--) {
        const d = daysAgo(i);
        const key = d.toISOString().slice(5, 10); // MM-DD
        buckets.set(key, { revenue: 0, sales: 0 });
      }
      sm.forEach((r) => {
        const key = new Date(r.created_at).toISOString().slice(5, 10);
        const b = buckets.get(key);
        if (b) { b.revenue += Number(r.total); b.sales += 1; }
      });
      setDaily(Array.from(buckets.entries()).map(([day, v]) => ({ day, ...v })));

      // Top items
      const map = new Map<string, number>();
      ((items ?? []) as ItemRow[]).forEach((it) => {
        map.set(it.product_name, (map.get(it.product_name) ?? 0) + Number(it.line_total));
      });
      setTopItems(Array.from(map.entries()).map(([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue).slice(0, 6));

      // Medicine type breakdown
      const tmap = new Map<string, number>();
      (typeData ?? []).forEach((p: { medicine_type: string }) => {
        tmap.set(p.medicine_type, (tmap.get(p.medicine_type) ?? 0) + 1);
      });
      setTypeBreakdown(Array.from(tmap.entries()).map(([name, value]) => ({ name, value })));

      setStats({
        products: pCount ?? 0, lowStock: low,
        todaySales: todayRows.length, todayRevenue,
        weekRevenue, monthRevenue,
      });
    })();
  }, [role, user?.id]);

  const cards = [
    { label: "Products", value: stats.products, icon: Package, color: "text-primary" },
    { label: "Low stock", value: stats.lowStock, icon: AlertTriangle, color: "text-[oklch(0.7_0.18_60)]" },
    { label: role === "counter" ? "My sales today" : "Sales today", value: stats.todaySales, icon: ShoppingCart, color: "text-primary" },
    { label: "Today's revenue", value: formatCurrency(stats.todayRevenue), icon: DollarSign, color: "text-[oklch(0.55_0.12_155)]" },
    { label: "This week", value: formatCurrency(stats.weekRevenue), icon: CalendarDays, color: "text-primary" },
    { label: "This month", value: formatCurrency(stats.monthRevenue), icon: TrendingUp, color: "text-[oklch(0.55_0.12_155)]" },
  ];

  const PIE_COLORS = ["oklch(0.55 0.08 155)", "oklch(0.72 0.1 155)", "oklch(0.78 0.15 75)", "oklch(0.6 0.12 200)", "oklch(0.65 0.15 30)", "oklch(0.5 0.12 280)", "oklch(0.7 0.13 100)", "oklch(0.55 0.1 320)"];

  const showCharts = role !== "counter";

  return (
    <DashboardLayout title="Overview">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4 border-border/60 hover:shadow-[var(--shadow-soft)] transition">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <Icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <p className="text-xl font-bold text-foreground">{c.value}</p>
            </Card>
          );
        })}
      </div>

      {showCharts && (
        <div className="grid gap-4 lg:grid-cols-2 mb-6">
          <Card className="p-5 border-border/60">
            <h3 className="font-semibold mb-1">Revenue (last 30 days)</h3>
            <p className="text-xs text-muted-foreground mb-3">Daily revenue trend</p>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.55 0.08 155)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.55 0.08 155)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.02 100)" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(Number(v))} />
                <Area type="monotone" dataKey="revenue" stroke="oklch(0.55 0.08 155)" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5 border-border/60">
            <h3 className="font-semibold mb-1">Sales count (last 30 days)</h3>
            <p className="text-xs text-muted-foreground mb-3">Number of transactions per day</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.02 100)" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="sales" stroke="oklch(0.78 0.15 75)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5 border-border/60">
            <h3 className="font-semibold mb-1">Top selling products</h3>
            <p className="text-xs text-muted-foreground mb-3">By revenue</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topItems} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.02 100)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <Tooltip formatter={(v: number) => formatCurrency(Number(v))} />
                <Bar dataKey="revenue" fill="oklch(0.55 0.08 155)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5 border-border/60">
            <h3 className="font-semibold mb-1">Inventory by medicine type</h3>
            <p className="text-xs text-muted-foreground mb-3">Product mix</p>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={typeBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {typeBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11, textTransform: "capitalize" }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      <Card className="p-6 border-border/60">
        <h2 className="text-lg font-semibold mb-2">Welcome back 👋</h2>
        <p className="text-muted-foreground">
          You are signed in as <span className="font-medium text-foreground capitalize">{role}</span>.
          {role === "admin" && " You have full access to manage users, products, sales and audit logs."}
          {role === "manager" && " You can manage products, inventory and view reports."}
          {role === "counter" && " Use Point of Sale to handle customer transactions."}
        </p>
      </Card>
    </DashboardLayout>
  );
}
