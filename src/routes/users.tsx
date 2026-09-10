import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DashboardLayout, RequireRole } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logAudit } from "@/lib/audit";
import { adminCreateUser, adminDeleteUser, adminUpdateUser } from "@/server/users";
import { Plus, Trash2, UserPlus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/users")({
  component: () => <RequireRole allow={["admin"]}><UsersPage /></RequireRole>,
});

type Row = { id: string; full_name: string | null; email: string | null; created_at: string; role: "admin" | "manager" | "counter" | null };

function UsersPage() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const load = async () => {
    const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    setRows((profiles ?? []).map((p) => ({ ...p, role: (roleMap.get(p.id) ?? null) as Row["role"] })));
  };
  useEffect(() => { load(); }, []);

  const updateRole = async (userId: string, newRole: "admin" | "manager" | "counter") => {
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) return toast.error(delErr.message);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (error) return toast.error(error.message);
    await logAudit("user.role_change", "user", { user_id: userId, role: newRole });
    toast.success("Role updated");
    load();
  };

  const handleDelete = async (u: Row) => {
    if (u.id === me?.id) return toast.error("You cannot delete your own account");
    if (!confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    try {
      await adminDeleteUser({ data: { user_id: u.id } });
      await logAudit("user.delete", "user", { user_id: u.id, email: u.email });
      toast.success("User deleted");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  return (
    <DashboardLayout title="Users & roles">
      <div className="flex justify-end mb-4">
        <Button onClick={() => setOpen(true)} style={{ background: "var(--gradient-primary)" }}>
          <UserPlus className="h-4 w-4 mr-1" /> Add user
        </Button>
      </div>
      <Card className="border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Current role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No users yet.</TableCell></TableRow>}
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize">{u.role ?? "none"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Select value={u.role ?? undefined} onValueChange={(v) => updateRole(u.id, v as "admin" | "manager" | "counter")}>
                        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Set role" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="counter">Counter</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(u)} title="Edit user">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(u)}
                        disabled={u.id === me?.id}
                        title={u.id === me?.id ? "You cannot delete yourself" : "Delete user"}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AddUserDialog open={open} onOpenChange={setOpen} onCreated={load} />
      <EditUserDialog user={editing} onOpenChange={(v) => !v && setEditing(null)} onSaved={load} />
    </DashboardLayout>
  );
}

const newUserSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(100),
  full_name: z.string().trim().min(1, "Name required").max(100),
  role: z.enum(["admin", "manager", "counter"]),
});

function AddUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "counter" as "admin" | "manager" | "counter" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setForm({ full_name: "", email: "", password: "", role: "counter" });
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = newUserSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSubmitting(true);
    try {
      const res = await adminCreateUser({ data: parsed.data });
      await logAudit("user.create", "user", { user_id: res.id, email: parsed.data.email, role: parsed.data.role });
      toast.success("User created");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add a new user</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Full name</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={255} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Temporary password</Label>
            <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} maxLength={100} placeholder="At least 6 characters" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as typeof form.role })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="counter">Counter / Cashier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={submitting} style={{ background: "var(--gradient-primary)" }}>
            {submitting ? "Creating…" : "Create user"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
const editUserSchema = z.object({
  full_name: z.string().trim().min(1, "Name required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().max(100).optional().or(z.literal("")),
  role: z.enum(["admin", "manager", "counter"]),
});

function EditUserDialog({ user, onOpenChange, onSaved }: { user: Row | null; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "counter" as "admin" | "manager" | "counter" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name ?? "",
        email: user.email ?? "",
        password: "",
        role: (user.role ?? "counter") as "admin" | "manager" | "counter",
      });
    }
  }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = editUserSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (parsed.data.password && parsed.data.password.length > 0 && parsed.data.password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }
    setSubmitting(true);
    try {
      await adminUpdateUser({
        data: {
          user_id: user.id,
          full_name: parsed.data.full_name,
          email: parsed.data.email,
          password: parsed.data.password || undefined,
          role: parsed.data.role,
        },
      });
      await logAudit("user.update", "user", { user_id: user.id, email: parsed.data.email, role: parsed.data.role });
      toast.success("User updated");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit user</DialogTitle></DialogHeader>
        {user && (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">User ID</Label>
              <Input value={user.id} readOnly className="font-mono text-xs bg-muted/40" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Full name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">New password (leave blank to keep current)</Label>
              <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} maxLength={100} placeholder="At least 6 characters if changing" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as typeof form.role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="counter">Counter / Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={submitting} style={{ background: "var(--gradient-primary)" }}>
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
