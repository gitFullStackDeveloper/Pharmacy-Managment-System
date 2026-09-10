import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout, RequireRole } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, logAudit } from "@/lib/audit";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/sales")({
  component: () => <RequireRole allow={["admin", "manager", "counter"]}><SalesPage /></RequireRole>,
});

type Sale = { id: string; invoice_number: string; customer_name: string | null; total: number; subtotal: number; discount: number; created_at: string; cashier_id: string | null };

function SalesPage() {
  const { role, user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);

  const load = async () => {
    let q = supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(200);
    if (role === "counter") q = q.eq("cashier_id", user?.id ?? "");
    const { data } = await q;
    setSales((data ?? []) as Sale[]);
  };
  useEffect(() => { if (role) load(); }, [role, user?.id]);

  const handleDelete = async (s: Sale) => {
    if (!confirm(`Delete sale ${s.invoice_number}?`)) return;
    const { error } = await supabase.from("sales").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    await logAudit("sale.delete", "sale", { invoice_number: s.invoice_number });
    toast.success("Sale deleted");
    load();
  };

  return (
    <DashboardLayout title={role === "counter" ? "My sales" : "All sales"}>
      <Card className="border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {role === "admin" && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No sales yet.</TableCell></TableRow>}
              {sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.invoice_number}</TableCell>
                  <TableCell>{s.customer_name ?? "Walk-in"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(s.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(s.subtotal))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(s.discount))}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{formatCurrency(Number(s.total))}</TableCell>
                  {role === "admin" && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(s)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </DashboardLayout>
  );
}