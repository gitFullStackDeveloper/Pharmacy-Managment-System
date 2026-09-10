import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout, RequireRole } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/audit")({
  component: () => <RequireRole allow={["admin"]}><AuditPage /></RequireRole>,
});

type Log = { id: string; user_email: string | null; action: string; entity: string | null; details: unknown; created_at: string };

function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  useEffect(() => {
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setLogs((data ?? []) as Log[]));
  }, []);

  return (
    <DashboardLayout title="Audit logs">
      <Card className="border-border/60 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No activity yet.</TableCell></TableRow>}
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{l.user_email ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{l.action}</Badge></TableCell>
                  <TableCell className="text-sm">{l.entity ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground max-w-xs truncate">{l.details ? JSON.stringify(l.details) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </DashboardLayout>
  );
}