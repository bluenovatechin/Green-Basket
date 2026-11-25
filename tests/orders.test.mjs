import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  freshDb, createUser, as, expectError, addAddress, variant, openSlot, placeOrder, stock,
} from "./helpers.mjs";

async function setup() {
  const db = await freshDb();
  const customer = await createUser(db);
  const admin = await createUser(db, { role: "admin" });
  const addressId = await addAddress(db, customer);
  const slotId = await openSlot(db);
  const tomato1kg = await variant(db, "Tomato", "1 kg");
  const tomato500 = await variant(db, "Tomato", "500 g");
  const onion1kg = await variant(db, "Onion", "1 kg");
  return { db, customer, admin, addressId, slotId, tomato1kg, tomato500, onion1kg };
}

test("COD order reserves stock and a slot place, and queues a confirmation email", async () => {
  const s = await setup();
  const before = await stock(s.db, "Tomato");
  const o = await placeOrder(s.db, s.customer, {
    addressId: s.addressId, slotId: s.slotId,
    items: [{ variant_id: s.tomato1kg, quantity: 2 }, { variant_id: s.tomato500, quantity: 1 }, { variant_id: s.onion1kg, quantity: 3 }],
  });
  assert.equal(o.status, "placed");
  // 2 x 38 + 1 x 20 + 3 x 35 = 201 -> below 299, so ₹20 delivery fee
  assert.equal(Number(o.total), 221);
  assert.equal(await stock(s.db, "Tomato"), before - 2500); // both pack sizes draw from one pool

  const slot = await s.db.query("select booked from public.delivery_slots where id = $1", [s.slotId]);
  assert.equal(slot.rows[0].booked, 1);

  const mail = await s.db.query("select template from public.email_outbox");
  assert.deepEqual(mail.rows.map((r) => r.template), ["order_placed"]);

  const events = await s.db.query("select to_status from public.order_events where order_id = $1", [o.order_id]);
  assert.deepEqual(events.rows.map((r) => r.to_status), ["placed"]);
});

test("the same idempotency key never creates a second order", async () => {
  const s = await setup();
  const key = randomUUID();
  const args = { addressId: s.addressId, slotId: s.slotId, key, items: [{ variant_id: s.onion1kg, quantity: 4 }] };
  const a = await placeOrder(s.db, s.customer, args);
  const b = await placeOrder(s.db, s.customer, args);
  assert.equal(a.order_id, b.order_id);
  assert.equal(b.duplicate, true);
  assert.equal(await stock(s.db, "Onion"), 80000 - 4000);
});

test("overselling is impossible and a failed order leaves no partial reservation", async () => {
  const s = await setup();
  await s.db.query("update public.products set stock_qty = 1500 where name = 'Tomato'");
  const other = await createUser(s.db);
  const otherAddr = await addAddress(s.db, other);

  await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.tomato1kg, quantity: 4 }, { variant_id: s.onion1kg, quantity: 1 }] })
    .then(() => assert.fail("should not succeed"))
    .catch((e) => assert.match(e.message, /OUT_OF_STOCK/));

  // Nothing was taken: onion untouched, slot untouched
  assert.equal(await stock(s.db, "Onion"), 80000);
  assert.equal(await stock(s.db, "Tomato"), 1500);

  await s.db.query("update public.settings set min_order_value = 0");
  // 1.5 kg in stock: the first 1 kg succeeds, the next 1 kg must fail (only 500 g left)
  await placeOrder(s.db, other, { addressId: otherAddr, slotId: s.slotId, items: [{ variant_id: s.tomato1kg, quantity: 1 }] });
  await expectError(
    placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.tomato1kg, quantity: 1 }] }),
    "OUT_OF_STOCK",
  );
  // but the 500 g pack still fits
  await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.tomato500, quantity: 1 }] });
  assert.equal(await stock(s.db, "Tomato"), 0);
});

test("slot capacity and cut-off are enforced", async () => {
  const s = await setup();
  await s.db.query("update public.delivery_slots set capacity = 1 where id = $1", [s.slotId]);
  await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 3 }] });
  await expectError(
    placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 3 }] }),
    "SLOT_FULL",
  );

  await s.db.query("update public.delivery_slots set capacity = 50, cutoff_at = now() - interval '1 minute' where id = $1", [s.slotId]);
  await expectError(
    placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 3 }] }),
    "SLOT_CLOSED",
  );
});

test("minimum order, COD limit, quantity limit and pincode rules", async () => {
  const s = await setup();
  await expectError(
    placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.tomato500, quantity: 1 }] }),
    "BELOW_MINIMUM_ORDER",
  );
  await s.db.query("update public.settings set cod_max_amount = 100");
  await expectError(
    placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 4 }] }),
    "COD_LIMIT_EXCEEDED",
  );
  await expectError(
    placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, method: "online", items: [{ variant_id: s.onion1kg, quantity: 99 }] }),
    "INVALID_QUANTITY",
  );
  await expectError(addAddress(s.db, s.customer, "400001"), "PINCODE_NOT_SERVICEABLE");
});

test("customer cancel releases stock and slot; cannot cancel after packing", async () => {
  const s = await setup();
  const o = await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 4 }] });
  await as(s.db, s.customer, (tx) => tx.query("select public.cancel_order($1, 'Changed my mind')", [o.order_id]));
  assert.equal(await stock(s.db, "Onion"), 80000);
  const slot = await s.db.query("select booked from public.delivery_slots where id = $1", [s.slotId]);
  assert.equal(slot.rows[0].booked, 0);

  const o2 = await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 4 }] });
  await as(s.db, s.admin, (tx) => tx.query("select public.set_order_status($1, 'packed')", [o2.order_id]));
  await expectError(
    as(s.db, s.customer, (tx) => tx.query("select public.cancel_order($1)", [o2.order_id])),
    "CANNOT_CANCEL",
  );
});

test("online payment: pay -> placed; late payment after expiry -> automatic refund", async () => {
  const s = await setup();
  const o = await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, method: "online", items: [{ variant_id: s.onion1kg, quantity: 4 }] });
  assert.equal(o.status, "pending_payment");
  assert.equal((await s.db.query("select count(*)::int n from public.email_outbox")).rows[0].n, 0);

  const attempt = await as(s.db, "service", (tx) =>
    tx.query("select public.create_payment_attempt($1, $2) as a", [o.order_id, s.customer]).then((r) => r.rows[0].a));
  const r1 = await as(s.db, "service", (tx) =>
    tx.query("select public.confirm_online_payment($1, 'PP1', '{}') as r", [attempt.merchant_order_id]).then((r) => r.rows[0].r));
  assert.equal(r1, "order_placed");
  // webhook + return page + reconciler all confirming: still one confirmation
  const r2 = await as(s.db, "service", (tx) =>
    tx.query("select public.confirm_online_payment($1, 'PP1', '{}') as r", [attempt.merchant_order_id]).then((r) => r.rows[0].r));
  assert.equal(r2, "already_confirmed");
  const placed = await s.db.query("select status, payment_status from public.orders where id = $1", [o.order_id]);
  assert.deepEqual(placed.rows[0], { status: "placed", payment_status: "paid" });

  // second order: expires before PhonePe confirms
  const o2 = await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, method: "online", items: [{ variant_id: s.onion1kg, quantity: 4 }] });
  const a2 = await as(s.db, "service", (tx) =>
    tx.query("select public.create_payment_attempt($1, $2) as a", [o2.order_id, s.customer]).then((r) => r.rows[0].a));
  await s.db.query("update public.orders set payment_expires_at = now() - interval '30 minutes' where id = $1", [o2.order_id]);
  const expired = await as(s.db, "service", (tx) => tx.query("select public.expire_stale_orders() as n").then((r) => r.rows[0].n));
  assert.equal(expired, 1);
  assert.equal(await stock(s.db, "Onion"), 80000 - 4000);

  const late = await as(s.db, "service", (tx) =>
    tx.query("select public.confirm_online_payment($1, 'PP2', '{}') as r", [a2.merchant_order_id]).then((r) => r.rows[0].r));
  assert.equal(late, "refund_created");
  const refund = await s.db.query("select amount::float, status from public.refunds where order_id = $1", [o2.order_id]);
  assert.deepEqual(refund.rows[0], { amount: 160, status: "pending" });
});

test("failed payment attempt keeps the order open for retry until it expires", async () => {
  const s = await setup();
  const o = await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, method: "online", items: [{ variant_id: s.onion1kg, quantity: 4 }] });
  const a = await as(s.db, "service", (tx) =>
    tx.query("select public.create_payment_attempt($1, $2) as a", [o.order_id, s.customer]).then((r) => r.rows[0].a));
  await as(s.db, "service", (tx) => tx.query("select public.fail_online_payment($1, '{}')", [a.merchant_order_id]));
  const ord = await s.db.query("select status from public.orders where id = $1", [o.order_id]);
  assert.equal(ord.rows[0].status, "pending_payment");
  const a2 = await as(s.db, "service", (tx) =>
    tx.query("select public.create_payment_attempt($1, $2) as a", [o.order_id, s.customer]).then((r) => r.rows[0].a));
  assert.notEqual(a.merchant_order_id, a2.merchant_order_id);
});

test("delivery flow: packer -> rider -> delivered with COD collection", async () => {
  const s = await setup();
  const packer = await createUser(s.db, { role: "packer" });
  const rider = await createUser(s.db, { role: "rider" });
  const o = await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 4 }] });

  await as(s.db, packer, (tx) => tx.query("select public.set_order_status($1, 'confirmed')", [o.order_id]));
  await expectError(as(s.db, packer, (tx) => tx.query("select public.set_order_status($1, 'out_for_delivery')", [o.order_id])), "FORBIDDEN");
  await as(s.db, packer, (tx) => tx.query("select public.set_order_status($1, 'packed')", [o.order_id]));
  await expectError(as(s.db, s.admin, (tx) => tx.query("select public.set_order_status($1, 'out_for_delivery')", [o.order_id])), "RIDER_NOT_ASSIGNED");
  await as(s.db, s.admin, (tx) => tx.query("select public.assign_rider($1, $2)", [o.order_id, rider]));

  // staff never read the orders table (it holds money); they use the money-free functions
  const direct = await as(s.db, rider, (tx) => tx.query("select id from public.orders"));
  assert.equal(direct.rows.length, 0);
  const packerDirect = await as(s.db, packer, (tx) => tx.query("select id from public.orders"));
  assert.equal(packerDirect.rows.length, 0);
  const packerProfiles = await as(s.db, packer, (tx) => tx.query("select id from public.profiles"));
  assert.equal(packerProfiles.rows.length, 1); // only their own

  // rider sees only their order, with the cash to collect but no other money
  const mine = await as(s.db, rider, (tx) => tx.query("select public.rider_orders('active') as v").then((r) => r.rows[0].v));
  assert.equal(mine.length, 1);
  assert.ok(Number(mine[0].collect_amount) > 0);
  for (const k of ["total", "subtotal", "delivery_fee", "refunded_amount"]) assert.equal(mine[0][k], undefined);
  assert.equal(mine[0].order_items[0].line_total, undefined);
  const other = await createUser(s.db, { role: "rider" });
  const none = await as(s.db, other, (tx) => tx.query("select public.rider_orders('active') as v").then((r) => r.rows[0].v));
  assert.equal(none.length, 0);

  // packer: order details and dashboard without money; customers list forbidden
  const so = await as(s.db, packer, (tx) => tx.query("select public.staff_order($1) as v", [o.order_id]).then((r) => r.rows[0].v));
  assert.equal(so.total, undefined);
  assert.equal(so.order_items[0].line_total, undefined);
  assert.equal(so.order_items[0].unit_price, undefined);
  const dash = await as(s.db, packer, (tx) => tx.query("select public.dashboard_summary(current_date) as v").then((r) => r.rows[0].v));
  assert.equal(dash.delivered_revenue, undefined);
  assert.equal(dash.cod_collected, undefined);
  const adminDash = await as(s.db, s.admin, (tx) => tx.query("select public.dashboard_summary(current_date) as v").then((r) => r.rows[0].v));
  assert.notEqual(adminDash.delivered_revenue, undefined);
  await expectError(as(s.db, packer, (tx) => tx.query("select * from public.admin_customers()")), "FORBIDDEN");
  await expectError(as(s.db, rider, (tx) => tx.query("select public.staff_orders(current_date)")), "FORBIDDEN");

  await as(s.db, rider, (tx) => tx.query("select public.set_order_status($1, 'out_for_delivery')", [o.order_id]));
  await expectError(as(s.db, rider, (tx) => tx.query("select public.complete_delivery($1)", [o.order_id])), "COLLECTION_METHOD_REQUIRED");
  await as(s.db, rider, (tx) => tx.query("select public.complete_delivery($1, 'upi_qr')", [o.order_id]));

  const done = await s.db.query("select status, payment_status, cod_collected_via from public.orders where id = $1", [o.order_id]);
  assert.deepEqual(done.rows[0], { status: "delivered", payment_status: "paid", cod_collected_via: "upi_qr" });
  const mails = await s.db.query("select template from public.email_outbox order by id");
  assert.deepEqual(mails.rows.map((r) => r.template), ["order_placed", "order_out_for_delivery", "order_delivered"]);
});

test("item unavailable at packing: bill reduced and prepaid difference refunded", async () => {
  const s = await setup();
  const o = await placeOrder(s.db, s.customer, {
    addressId: s.addressId, slotId: s.slotId, method: "online",
    items: [{ variant_id: s.onion1kg, quantity: 4 }, { variant_id: s.tomato1kg, quantity: 1 }],
  });
  const a = await as(s.db, "service", (tx) =>
    tx.query("select public.create_payment_attempt($1, $2) as a", [o.order_id, s.customer]).then((r) => r.rows[0].a));
  await as(s.db, "service", (tx) => tx.query("select public.confirm_online_payment($1, 'PP', '{}')", [a.merchant_order_id]));

  const item = await s.db.query("select id from public.order_items where order_id = $1 and product_name = 'Tomato'", [o.order_id]);
  await as(s.db, s.admin, (tx) => tx.query("select public.mark_item_unavailable($1)", [item.rows[0].id]));

  const ord = await s.db.query("select subtotal::float, total::float, refunded_amount::float from public.orders where id = $1", [o.order_id]);
  // 140 + 38 = 178 + 20 fee = 198 -> without tomato 140 + 20 = 160, refund 38
  assert.deepEqual(ord.rows[0], { subtotal: 140, total: 160, refunded_amount: 38 });
  const refund = await s.db.query("select amount::float from public.refunds where order_id = $1", [o.order_id]);
  assert.equal(refund.rows[0].amount, 38);
});

test("security: customers can't see others' orders, edit stock, or call server functions", async () => {
  const s = await setup();
  const o = await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 4 }] });
  const stranger = await createUser(s.db);

  const seen = await as(s.db, stranger, (tx) => tx.query("select id from public.orders"));
  assert.equal(seen.rows.length, 0);
  const items = await as(s.db, stranger, (tx) => tx.query("select id from public.order_items"));
  assert.equal(items.rows.length, 0);

  await expectError(as(s.db, s.customer, (tx) => tx.query("update public.products set stock_qty = 0")), "permission denied");
  await expectError(as(s.db, s.admin, (tx) => tx.query("update public.products set stock_qty = 0")), "permission denied");
  await expectError(as(s.db, s.customer, (tx) => tx.query("update public.orders set total = 1")), "permission denied");
  await expectError(as(s.db, s.customer, (tx) => tx.query("update public.profiles set role = 'admin'")), "permission denied");
  await expectError(
    as(s.db, s.customer, (tx) => tx.query("select public.confirm_online_payment('x', 'y', '{}')")),
    "permission denied",
  );
  await expectError(as(s.db, s.customer, (tx) => tx.query("select public.set_order_status($1, 'confirmed')", [o.order_id])), "FORBIDDEN");
  await expectError(as(s.db, stranger, (tx) => tx.query("select public.cancel_order($1)", [o.order_id])), "ORDER_NOT_FOUND");

  // customers can update their own name, but price edits by non-admins silently match no rows
  await as(s.db, s.customer, (tx) => tx.query("update public.profiles set full_name = 'Asha'"));
  const upd = await as(s.db, s.customer, (tx) => tx.query("update public.product_variants set price = 1"));
  assert.equal(upd.affectedRows, 0);

  // anonymous visitors can browse the catalogue
  const anon = await as(s.db, "anon", (tx) => tx.query("select count(*)::int n from public.products"));
  assert.ok(anon.rows[0].n > 0);
});

test("admin stock adjustments are logged and can't go negative; procurement report sums orders", async () => {
  const s = await setup();
  const productId = (await s.db.query("select id from public.products where name = 'Onion'")).rows[0].id;
  await as(s.db, s.admin, (tx) => tx.query("select public.admin_adjust_stock($1, 5000, 'restock', 'mandi')", [productId]));
  await as(s.db, s.admin, (tx) => tx.query("select public.admin_adjust_stock($1, -1000, 'wastage', 'rotten')", [productId]));
  assert.equal(await stock(s.db, "Onion"), 84000);
  await expectError(as(s.db, s.admin, (tx) => tx.query("select public.admin_adjust_stock($1, -999999, 'adjustment')", [productId])), "STOCK_NEGATIVE");

  await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 4 }] });
  const date = (await s.db.query("select slot_date::text d from public.delivery_slots where id = $1", [s.slotId])).rows[0].d;
  const rep = await as(s.db, s.admin, (tx) => tx.query("select product_name, total_qty::float from public.procurement_for_date($1)", [date]));
  assert.deepEqual(rep.rows, [{ product_name: "Onion", total_qty: 4000 }]);

  const dash = await as(s.db, s.admin, (tx) => tx.query("select public.dashboard_summary($1) d", [date]));
  assert.equal(dash.rows[0].d.by_status.placed, 1);
});

test("admin customer list and order counts are admin-only", async () => {
  const s = await setup();
  await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 4 }] });
  const list = await as(s.db, s.admin, (tx) => tx.query("select email, orders_count::int from public.admin_customers(null, 50)"));
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0].orders_count, 1);
  await expectError(as(s.db, s.customer, (tx) => tx.query("select * from public.admin_customers(null, 50)")), "FORBIDDEN");

  const date = (await s.db.query("select slot_date::text d from public.delivery_slots where id = $1", [s.slotId])).rows[0].d;
  const counts = await as(s.db, s.admin, (tx) => tx.query("select public.admin_order_counts($1) c", [date]));
  assert.equal(counts.rows[0].c.placed, 1);
});

test("a fresh store can be claimed once; after that claiming is closed", async () => {
  const db = await freshDb({ seed: false });
  const first = await createUser(db);
  const second = await createUser(db);
  const hasAdmin = async () => (await as(db, "anon", (tx) => tx.query("select public.store_has_admin() v"))).rows[0].v;

  assert.equal(await hasAdmin(), false);
  await expectError(as(db, "anon", (tx) => tx.query("select public.claim_store_ownership()")), "permission denied");
  await as(db, first, (tx) => tx.query("select public.claim_store_ownership()"));
  assert.equal(await hasAdmin(), true);
  const role = await db.query("select role from public.profiles where id = $1", [first]);
  assert.equal(role.rows[0].role, "admin");
  await expectError(as(db, second, (tx) => tx.query("select public.claim_store_ownership()")), "STORE_ALREADY_CLAIMED");
});

test("switch online -> cash on delivery; a payment that completes afterwards just marks it paid", async () => {
  const s = await setup();
  const o = await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, method: "online", items: [{ variant_id: s.onion1kg, quantity: 4 }] });
  const a = await as(s.db, "service", (tx) =>
    tx.query("select public.create_payment_attempt($1, $2) as a", [o.order_id, s.customer]).then((r) => r.rows[0].a));

  const stranger = await createUser(s.db);
  await expectError(as(s.db, stranger, (tx) => tx.query("select public.switch_to_cod($1)", [o.order_id])), "ORDER_NOT_FOUND");

  await as(s.db, s.customer, (tx) => tx.query("select public.switch_to_cod($1)", [o.order_id]));
  const ord = (await s.db.query("select status, payment_method, payment_expires_at from public.orders where id = $1", [o.order_id])).rows[0];
  assert.deepEqual(ord, { status: "placed", payment_method: "cod", payment_expires_at: null });
  const mail = await s.db.query("select template from public.email_outbox");
  assert.deepEqual(mail.rows.map((r) => r.template), ["order_placed"]);

  // the switched order is never expired by the scheduler
  await as(s.db, "service", (tx) => tx.query("select public.expire_stale_orders()"));
  assert.equal((await s.db.query("select status from public.orders where id = $1", [o.order_id])).rows[0].status, "placed");

  await expectError(as(s.db, s.customer, (tx) => tx.query("select public.switch_to_cod($1)", [o.order_id])), "ORDER_NOT_AWAITING_PAYMENT");

  // the PhonePe attempt started before switching completes later -> order is simply marked paid (no cash to collect)
  const r = await as(s.db, "service", (tx) =>
    tx.query("select public.confirm_online_payment($1, 'PPX', '{}') as r", [a.merchant_order_id]).then((x) => x.rows[0].r));
  assert.equal(r, "cod_prepaid");
  const paid = (await s.db.query("select status, payment_method, payment_status from public.orders where id = $1", [o.order_id])).rows[0];
  assert.deepEqual(paid, { status: "placed", payment_method: "online", payment_status: "paid" });
  // a second, duplicate payment for the same order is refunded
  const a2 = await s.db.query("insert into public.payments (order_id, merchant_order_id, amount) values ($1, 'DUP1', 160) returning merchant_order_id", [o.order_id]);
  const dup = await as(s.db, "service", (tx) =>
    tx.query("select public.confirm_online_payment($1, 'PPD', '{}') as r", [a2.rows[0].merchant_order_id]).then((x) => x.rows[0].r));
  assert.equal(dup, "refund_created");
});

test("switch cash on delivery -> pay online; abandoning keeps the COD order", async () => {
  const s = await setup();
  const o = await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 4 }] });

  // first attempt abandoned / failed: order untouched
  const a1 = await as(s.db, "service", (tx) =>
    tx.query("select public.create_payment_attempt($1, $2) as a", [o.order_id, s.customer]).then((r) => r.rows[0].a));
  await as(s.db, "service", (tx) => tx.query("select public.fail_online_payment($1, '{}')", [a1.merchant_order_id]));
  let ord = (await s.db.query("select status, payment_method, payment_status from public.orders where id = $1", [o.order_id])).rows[0];
  assert.deepEqual(ord, { status: "placed", payment_method: "cod", payment_status: "pending" });

  // second attempt succeeds: now prepaid online, status unchanged
  const a2 = await as(s.db, "service", (tx) =>
    tx.query("select public.create_payment_attempt($1, $2) as a", [o.order_id, s.customer]).then((r) => r.rows[0].a));
  const r = await as(s.db, "service", (tx) =>
    tx.query("select public.confirm_online_payment($1, 'PPY', '{}') as r", [a2.merchant_order_id]).then((x) => x.rows[0].r));
  assert.equal(r, "cod_prepaid");
  ord = (await s.db.query("select status, payment_method, payment_status from public.orders where id = $1", [o.order_id])).rows[0];
  assert.deepEqual(ord, { status: "placed", payment_method: "online", payment_status: "paid" });

  // already paid: no more attempts
  await expectError(as(s.db, "service", (tx) => tx.query("select public.create_payment_attempt($1, $2)", [o.order_id, s.customer])), "ORDER_NOT_AWAITING_PAYMENT");
  // cancelling now refunds, because it was paid online
  await as(s.db, s.customer, (tx) => tx.query("select public.cancel_order($1)", [o.order_id]));
  const refund = await s.db.query("select amount::float from public.refunds where order_id = $1", [o.order_id]);
  assert.equal(refund.rows[0].amount, 160);
});

test("email queue: claim, retry with back-off, then give up after 5 attempts", async () => {
  const s = await setup();
  await placeOrder(s.db, s.customer, { addressId: s.addressId, slotId: s.slotId, items: [{ variant_id: s.onion1kg, quantity: 4 }] });
  const batch = await as(s.db, "service", (tx) => tx.query("select * from public.claim_email_batch(10)"));
  assert.equal(batch.rows.length, 1);
  const again = await as(s.db, "service", (tx) => tx.query("select * from public.claim_email_batch(10)"));
  assert.equal(again.rows.length, 0); // already claimed

  const id = batch.rows[0].id;
  await as(s.db, "service", (tx) => tx.query("select public.complete_email($1, false, 'smtp down')", [id]));
  let row = (await s.db.query("select status, attempts from public.email_outbox where id = $1", [id])).rows[0];
  assert.deepEqual(row, { status: "pending", attempts: 1 });

  await s.db.query("update public.email_outbox set attempts = 5 where id = $1", [id]);
  await as(s.db, "service", (tx) => tx.query("select public.complete_email($1, false, 'smtp down')", [id]));
  row = (await s.db.query("select status from public.email_outbox where id = $1", [id])).rows[0];
  assert.equal(row.status, "failed");
});
