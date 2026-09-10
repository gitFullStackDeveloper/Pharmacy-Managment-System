import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DashboardLayout, RequireRole } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { logAudit, formatCurrency } from "@/lib/audit";
import { Plus, Trash2, Pencil, Percent } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/discounts")({
  component: () => <RequireRole allow={["admin", "manager"]}><DiscountsPage /></RequireRole>,
});

type Rule = {
  id: string;
  name: string;
  type: "percentage" | "fixed";
  value: number;
  min_subtotal: number;
  active: boolean;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(100),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().nonnegative().max(100000),
  min_subtotal: z.number().nonnegative().max(1000000),
  active: z.boolean(),
});

function DiscountsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);

  const load = async () => {
    const { data } = await supabase.from("discount_rules").select("*").order("min_subtotal", { ascending: true });
    setRules((data ?? []).map((r) => ({ ...r, value: Number(r.value), min_subtotal: Number(r.min_subtotal) })) as Rule[]);
  };
  useEffect(() => { load(); }, []);

  const remove = async (r: Rule) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    const { error } = await supabase.from("discount_rules").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    await logAudit("discount.delete", "discount_rule", { id: r.id, name: r.name });
    toast.success("Rule deleted");
    load();
  };

  const toggle = async (r: Rule) => {
    const { error } = await supabase.from("discount_rules").update({ active: !r.active, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <DashboardLayout title="Discount rules">
      <Card className="border-border/60 p-4 mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><Percent className="h-4 w-4" /> Fixed discounts</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Discounts are managed here by Admins and Managers. Cashiers cannot freely change them — at checkout the system automatically applies the best active rule whose minimum subtotal is met.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} style={{ background: "var(--gradient-primary)" }}>
          <Plus className="h-4 w-4 mr-1" /> New rule
        </Button>
      </Card>

      <Card className="border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Min. subtotal</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No discount rules yet.</TableCell></TableRow>}
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{r.type}</Badge></TableCell>
                  <TableCell className="text-right">{r.type === "percentage" ? `${r.value}%` : formatCurrency(r.value)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.min_subtotal)}</TableCell>
                  <TableCell><Switch checked={r.active} onCheckedChange={() => toggle(r)} /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <RuleDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={load} />
    </DashboardLayout>
  );
}

function RuleDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Rule | null; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", type: "percentage" as "percentage" | "fixed", value: "0", min_subtotal: "0", active: true });

  useEffect(() => {
    if (editing) {
      setForm({ name: editing.name, type: editing.type, value: String(editing.value), min_subtotal: String(editing.min_subtotal), active: editing.active });
    } else {
      setForm({ name: "", type: "percentage", value: "0", min_subtotal: "0", active: true });
    }
  }, [editing, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      name: form.name, type: form.type,
      value: Number(form.value), min_subtotal: Number(form.min_subtotal), active: form.active,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (parsed.data.type === "percentage" && parsed.data.value > 100) return toast.error("Percentage cannot exceed 100%");

    const payload = { ...parsed.data, updated_at: new Date().toISOString() };
    if (editing) {
      const { error } = await supabase.from("discount_rules").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      await logAudit("discount.update", "discount_rule", { id: editing.id, name: payload.name });
      toast.success("Rule updated");
    } else {
      const { error, data } = await supabase.from("discount_rules").insert(payload).select().single();
      if (error) return toast.error(error.message);
      await logAudit("discount.create", "discount_rule", { id: data?.id, name: payload.name });
      toast.success("Rule added");
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit rule" : "New discount rule"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "percentage" | "fixed" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage off (%)</SelectItem>
                <SelectItem value="fixed">Fixed amount off</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">{form.type === "percentage" ? "Value (%)" : "Value"}</Label><Input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label className="text-xs">Min. subtotal</Label><Input type="number" step="0.01" value={form.min_subtotal} onChange={(e) => setForm({ ...form, min_subtotal: e.target.value })} /></div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            <Label className="text-sm">Active</Label>
          </div>
          <Button type="submit" className="w-full" style={{ background: "var(--gradient-primary)" }}>
            {editing ? "Save changes" : "Create rule"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}