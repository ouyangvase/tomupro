export interface KitaniOrderReadyEvent {
  event_id?: string;
  event_type: "delivery.order_ready";
  occurred_at?: string;
  delivery_intent_id: string;
  source_order_id: string;
  source_order_no?: string | null;
  customer: { name: string; phone: string };
  pickup: {
    name: string;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  dropoff: {
    formatted_address: string;
    latitude: number;
    longitude: number;
    unit?: string | null;
    landmark?: string | null;
    instructions?: string | null;
    gps_accuracy?: number | null;
  };
  package: { type: string; description: string };
  financials: {
    merchandise_subtotal_minor: number;
    delivery_fee_minor: number;
    discount_total_minor: number;
    total_amount_minor: number;
    cod_amount_minor: number;
    payment_method: "COD" | "TRANSFER";
    currency_code: "BND";
  };
  items: Array<{
    sku_label: string;
    quantity: number;
    price_minor: number;
    line_total_minor: number;
  }>;
}

function assertMinor(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer minor-unit value`);
  }
}

export function validateKitaniOrderReadyEvent(event: KitaniOrderReadyEvent) {
  if (!event.delivery_intent_id || !event.source_order_id) {
    throw new Error("delivery_intent_id and source_order_id are required");
  }
  if (!event.customer?.phone || !event.pickup?.address || !event.dropoff?.formatted_address) {
    throw new Error("customer, pickup, and dropoff details are required");
  }
  if (event.financials?.currency_code !== "BND") {
    throw new Error("currency_code must be BND");
  }
  if (event.financials?.payment_method !== "COD" && event.financials?.payment_method !== "TRANSFER") {
    throw new Error("payment_method must be COD or TRANSFER");
  }
  const financialKeys = [
    "merchandise_subtotal_minor",
    "delivery_fee_minor",
    "discount_total_minor",
    "total_amount_minor",
    "cod_amount_minor",
  ] as const;
  for (const key of financialKeys) assertMinor(event.financials?.[key], key);
  const {
    merchandise_subtotal_minor,
    delivery_fee_minor,
    discount_total_minor,
    total_amount_minor,
    cod_amount_minor,
    payment_method,
  } = event.financials;
  if (discount_total_minor > merchandise_subtotal_minor + delivery_fee_minor) {
    throw new Error("discount_total_minor cannot exceed the order value");
  }
  if (total_amount_minor !== merchandise_subtotal_minor + delivery_fee_minor - discount_total_minor) {
    throw new Error("KITANI financial values do not balance");
  }
  if (payment_method === "COD" && cod_amount_minor !== total_amount_minor) {
    throw new Error("COD amount must equal the final customer total");
  }
  if (payment_method === "TRANSFER" && cod_amount_minor !== 0) {
    throw new Error("Transfer orders must have zero COD amount");
  }
  if (!Array.isArray(event.items) || event.items.length === 0) {
    throw new Error("KITANI order must contain at least one item");
  }
  for (const item of event.items) {
    if (typeof item.sku_label !== "string" || !item.sku_label.trim()) {
      throw new Error("Each KITANI item requires a label");
    }
    assertMinor(item.price_minor, "item.price_minor");
    assertMinor(item.line_total_minor, "item.line_total_minor");
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Each KITANI item requires a positive integer quantity");
    }
    if (item.line_total_minor !== item.price_minor * item.quantity) {
      throw new Error("KITANI item line total does not balance");
    }
  }
}
