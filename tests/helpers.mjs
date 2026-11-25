// Test harness: runs the real migrations inside PGlite (Postgres compiled to WASM),
// with a small stand-in for Supabase's auth schema and roles.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- minimal Supabase Storage tables (for the product-images bucket migration)
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  -- Supabase's defaults: new objects in public are granted to the API roles
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export async function freshDb({ seed = true } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(root, "supabase", "migrations");
  for (const f of readdirSync(dir).sort()) {
    if (f.includes("schedules")) continue; // pg_cron / pg_net / vault exist only on Supabase
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  if (seed) await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  return db;
}

/** Create a user (fires the profile trigger). */
export async function createUser(db, { role = "customer", email } = {}) {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email ?? `${id.slice(0, 8)}@test.in`]);
  if (role !== "customer") await db.query("update public.profiles set role = $1 where id = $2", [role, id]);
  return id;
}

/** Run fn as an API user (role "authenticated" with auth.uid() = uid), or as service_role / anon. */
export async function as(db, who, fn) {
  return db.transaction(async (tx) => {
    if (who === "service") {
      await tx.exec("set local role service_role");
    } else if (who === "anon") {
      await tx.exec("set local role anon");
    } else {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [who]);
      await tx.exec("set local role authenticated");
    }
    return fn(tx);
  });
}

export async function expectError(promise, code) {
  try {
    await promise;
  } catch (e) {
    if (code && !String(e.message).includes(code)) {
      throw new Error(`Expected error ${code}, got: ${e.message}`);
    }
    return e;
  }
  throw new Error(`Expected error ${code ?? ""} but call succeeded`);
}

export async function addAddress(db, uid, pincode = "388001") {
  return as(db, uid, async (tx) => {
    const r = await tx.query(
      `insert into public.addresses (user_id, full_name, phone, line1, city, pincode, is_default)
       values ($1, 'Test User', '9876543210', '12 Station Road', 'Anand', $2, true) returning id`,
      [uid, pincode],
    );
    return r.rows[0].id;
  });
}

export async function variant(db, productName, label) {
  const r = await db.query(
    `select v.id from public.product_variants v join public.products p on p.id = v.product_id
     where p.name = $1 and v.label = $2`,
    [productName, label],
  );
  return r.rows[0].id;
}

/** The evening slot later than now (cutoff in the future). */
export async function openSlot(db) {
  const r = await db.query(
    `select id from public.delivery_slots where cutoff_at > now() and is_active order by slot_date, start_time limit 1`,
  );
  return r.rows[0].id;
}

export async function placeOrder(db, uid, { addressId, slotId, method = "cod", items, key = randomUUID() }) {
  return as(db, uid, async (tx) => {
    const r = await tx.query(
      "select public.place_order($1, $2, $3::public.payment_method, $4::jsonb, $5) as o",
      [addressId, slotId, method, JSON.stringify(items), key],
    );
    return r.rows[0].o;
  });
}

export async function stock(db, productName) {
  const r = await db.query("select stock_qty::float as q from public.products where name = $1", [productName]);
  return r.rows[0].q;
}
