import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const createSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(100),
  full_name: z.string().trim().min(1).max(100),
  role: z.enum(["admin", "manager", "counter"]),
});

const deleteSchema = z.object({ user_id: z.string().uuid() });

const updateSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string().email().max(255).optional(),
  password: z.string().min(6).max(100).optional().or(z.literal("")),
  full_name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["admin", "manager", "counter"]).optional(),
});

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden: admin role required");
}

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("Failed to create user");

    // handle_new_user trigger inserts default role; override it
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    return { id: newId };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const attrs: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {};
    if (data.email) attrs.email = data.email;
    if (data.password && data.password.length > 0) attrs.password = data.password;
    if (data.full_name) attrs.user_metadata = { full_name: data.full_name };

    if (Object.keys(attrs).length > 0) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, attrs);
      if (error) throw new Error(error.message);
    }

    if (data.full_name || data.email) {
      const profileUpdate: { full_name?: string; email?: string } = {};
      if (data.full_name) profileUpdate.full_name = data.full_name;
      if (data.email) profileUpdate.email = data.email;
      const { error: pErr } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.user_id);
      if (pErr) throw new Error(pErr.message);
    }

    if (data.role) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
      const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
      if (rErr) throw new Error(rErr.message);
    }

    return { ok: true };
  });