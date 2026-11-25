// Admin-only staff management that needs the service role (creating logins can't be done from the browser).
//
// POST { action: "create", email, full_name, password, role }
//   - email not registered yet -> creates a ready-to-use login (email already confirmed) with that password + role
//   - email already registered -> only gives them the role (their password is NOT changed)
//   -> { status: "created" | "role_updated" }
//
// POST { action: "set_password", user_id, password }
//   - resets the password of a STAFF member (rider / packer / admin). Customers' passwords can never be changed here.
//   -> { status: "password_set" }
import { adminDb, requireUser } from "../_shared/db.ts";
import { handleError, HttpError, json, preflight } from "../_shared/http.ts";

const STAFF_ROLES = ["admin", "packer", "rider"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function checkPassword(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < 8) throw new HttpError(400, "WEAK_PASSWORD");
  if (pw.length > 72) throw new HttpError(400, "INVALID_REQUEST");
  return pw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    const { user: me, role } = await requireUser(req);
    if (role !== "admin") throw new HttpError(403, "FORBIDDEN");

    const body = await req.json().catch(() => ({}));
    const db = adminDb();

    if (body.action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.full_name ?? "").trim().slice(0, 80);
      const newRole = body.role as StaffRole;
      if (!EMAIL_RE.test(email)) throw new HttpError(400, "INVALID_EMAIL");
      if (!STAFF_ROLES.includes(newRole)) throw new HttpError(400, "INVALID_REQUEST");

      const { data: existing } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
      if (existing) {
        if (existing.id === me.id && newRole !== "admin") throw new HttpError(400, "CANNOT_DEMOTE_SELF");
        const patch: Record<string, unknown> = { role: newRole };
        if (fullName) patch.full_name = fullName;
        const { error } = await db.from("profiles").update(patch).eq("id", existing.id);
        if (error) throw error;
        return json({ status: "role_updated" });
      }

      const password = checkPassword(body.password);
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // the admin vouches for this person; no confirmation email needed
        user_metadata: fullName ? { full_name: fullName } : {},
      });
      if (error || !data.user) {
        if (/already|registered|exists/i.test(error?.message ?? "")) throw new HttpError(409, "EMAIL_TAKEN");
        throw error ?? new Error("createUser failed");
      }
      // the handle_new_user trigger has created the profile; now give the role
      const { error: roleErr } = await db.from("profiles").update({ role: newRole }).eq("id", data.user.id);
      if (roleErr) throw roleErr;
      return json({ status: "created" });
    }

    if (body.action === "set_password") {
      const userId = String(body.user_id ?? "");
      const password = checkPassword(body.password);
      const { data: target } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!target) throw new HttpError(404, "USER_NOT_FOUND");
      if (!STAFF_ROLES.includes(target.role)) throw new HttpError(403, "FORBIDDEN"); // never touch customers
      const { error } = await db.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return json({ status: "password_set" });
    }

    throw new HttpError(400, "INVALID_REQUEST");
  } catch (e) {
    return handleError(e);
  }
});
