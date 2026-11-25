// Turns error codes raised by the database / Edge Functions into friendly text.
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "Please log in again.",
  ACCOUNT_BLOCKED: "Your account is on hold. Please contact support.",
  CART_EMPTY: "Your basket is empty.",
  ITEM_UNAVAILABLE: "Some items are no longer available",
  INVALID_QUANTITY: "Too many of one item",
  OUT_OF_STOCK: "Sorry, not enough stock left for",
  BELOW_MINIMUM_ORDER: "Minimum order value is ₹",
  COD_LIMIT_EXCEEDED: "Cash on delivery is available up to ₹",
  PAYMENT_METHOD_UNAVAILABLE: "This payment method is not available right now.",
  ADDRESS_NOT_FOUND: "Please choose a delivery address.",
  PINCODE_NOT_SERVICEABLE: "Sorry, we don't deliver to this pincode yet",
  SLOT_UNAVAILABLE: "That delivery slot is not available. Please pick another.",
  SLOT_CLOSED: "Ordering for that slot has closed. Please pick another.",
  SLOT_FULL: "That delivery slot just filled up. Please pick another.",
  ORDER_NOT_FOUND: "Order not found.",
  CANNOT_CANCEL: "This order can no longer be cancelled.",
  ORDER_NOT_AWAITING_PAYMENT: "This order is not waiting for payment.",
  PAYMENT_WINDOW_EXPIRED: "The time to pay for this order has ended.",
  TOO_MANY_PAYMENT_ATTEMPTS: "Too many payment attempts. Please place a new order.",
  PAYMENT_PROVIDER_ERROR: "PhonePe is not responding. Please try again in a minute.",
  FORBIDDEN: "You don't have permission to do that.",
  INVALID_TRANSITION: "That status change is not allowed",
  RIDER_NOT_ASSIGNED: "Assign a rider first.",
  INVALID_RIDER: "That person is not a rider.",
  COLLECTION_METHOD_REQUIRED: "Choose how the payment was collected.",
  STOCK_NEGATIVE: "Stock can't go below zero.",
  USER_NOT_FOUND: "No user with that email",
  CANNOT_DEMOTE_SELF: "You can't change your own access.",
  STORE_ALREADY_CLAIMED: "This store already has an owner. Ask them to add you in Admin → Staff.",
  UNSUPPORTED_IMAGE_TYPE: "Use a JPG, PNG or WebP image.",
  IMAGE_TOO_LARGE: "Image is too large (max 2 MB).",
};

export function friendlyError(e: unknown): string {
  if (!e) return "";
  const err = e as { message?: string; details?: string | null };
  const code = (err.message ?? String(e)).trim();
  const base = MESSAGES[code];
  if (!base) {
    if (/Failed to fetch|NetworkError/i.test(code)) return "No internet connection. Please try again.";
    if (/rate limit|too many requests/i.test(code)) return "Too many attempts. Please wait a minute and try again.";
    if (/invalid.*(otp|token)|expired/i.test(code)) return "That code is wrong or has expired.";
    return code || "Something went wrong. Please try again.";
  }
  return err.details ? `${base}${/[₹]$/.test(base) ? "" : ": "}${err.details}` : base;
}
