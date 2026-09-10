import { supabase } from "@/integrations/supabase/client";

export async function logAudit(action: string, entity?: string, details?: Record<string, unknown>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    user_email: user.email,
    action,
    entity: entity ?? null,
    details: details ? (details as never) : null,
  });
}

export function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}