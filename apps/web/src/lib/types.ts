export type Role = "customer" | "admin" | "packer" | "rider";
export type StockUnit = "g" | "ml" | "piece" | "bunch" | "pack";
export type OrderStatus =
  | "pending_payment" | "placed" | "confirmed" | "packed"
  | "out_for_delivery" | "delivered" | "cancelled" | "payment_failed";
export type PaymentMethod = "cod" | "online";
export type PaymentStatus = "pending" | "paid" | "failed";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  is_blocked: boolean;
}

export interface Category { id: number; name: string; slug: string; sort_order: number; is_active: boolean }

export interface Variant {
  id: string;
  product_id: string;
  label: string;
  pack_qty: number;
  price: number;
  mrp: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface Product {
  id: string;
  category_id: number | null;
  name: string;
  name_local: string | null;
  description: string | null;
  image_url: string | null;
  unit: StockUnit;
  stock_qty: number;
  low_stock_threshold: number;
  is_active: boolean;
  sort_order: number;
  product_variants: Variant[];
}

export interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  booked: number;
  cutoff_at: string;
  is_active: boolean;
}

export interface Address {
  id: string;
  label: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  pincode: string;
  is_default: boolean;
}

export interface Settings {
  store_name: string;
  support_email: string | null;
  support_phone: string | null;
  min_order_value: number;
  delivery_fee: number;
  free_delivery_above: number;
  cod_enabled: boolean;
  cod_max_amount: number;
  online_payment_enabled: boolean;
  payment_timeout_minutes: number;
  max_qty_per_item: number;
}

export interface OrderItem {
  id: string;
  product_name: string;
  variant_label: string;
  unit: StockUnit;
  pack_qty: number;
  quantity: number;
  unit_price: number;
  line_total: number;
  is_unavailable: boolean;
}

export interface OrderEvent { id: number; from_status: OrderStatus | null; to_status: OrderStatus; note: string | null; created_at: string }
export interface Refund { id: string; amount: number; reason: string; status: string; created_at: string }

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  address: Omit<Address, "id" | "is_default">;
  slot_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  refunded_amount: number;
  rider_id: string | null;
  cod_collected_via: string | null;
  customer_note: string | null;
  cancel_reason: string | null;
  payment_expires_at: string | null;
  created_at: string;
  delivery_slots?: Pick<Slot, "slot_date" | "start_time" | "end_time">;
  order_items?: OrderItem[];
  order_events?: OrderEvent[];
  refunds?: Refund[];
}
