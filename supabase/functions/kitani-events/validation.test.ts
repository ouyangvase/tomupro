import { describe, expect, it } from "vitest";

import {
  validateKitaniOrderReadyEvent,
  type KitaniOrderReadyEvent,
} from "./validation";

function makeEvent(
  financials: KitaniOrderReadyEvent["financials"],
): KitaniOrderReadyEvent {
  return {
    event_type: "delivery.order_ready",
    delivery_intent_id: "di_123",
    source_order_id: "og_123",
    customer: { name: "KITANI customer", phone: "+6738123456" },
    pickup: { name: "KITANI Kitchen", address: "Kiulap" },
    dropoff: {
      formatted_address: "Bandar Seri Begawan",
      latitude: 4.9031,
      longitude: 114.9398,
    },
    package: { type: "SMALL", description: "KITANI order" },
    financials,
    items: [
      {
        sku_label: "Meal",
        quantity: 1,
        price_minor: 1700,
        line_total_minor: 1700,
      },
    ],
  };
}

describe("KITANI order-ready receiver validation", () => {
  it("accepts BND17 merchandise plus BND3 delivery for COD BND20", () => {
    expect(() => validateKitaniOrderReadyEvent(makeEvent({
      merchandise_subtotal_minor: 1700,
      delivery_fee_minor: 300,
      discount_total_minor: 0,
      total_amount_minor: 2000,
      cod_amount_minor: 2000,
      payment_method: "COD",
      currency_code: "BND",
    }))).not.toThrow();
  });

  it("accepts bank transfer with zero driver collection", () => {
    expect(() => validateKitaniOrderReadyEvent(makeEvent({
      merchandise_subtotal_minor: 1700,
      delivery_fee_minor: 300,
      discount_total_minor: 0,
      total_amount_minor: 2000,
      cod_amount_minor: 0,
      payment_method: "TRANSFER",
      currency_code: "BND",
    }))).not.toThrow();
  });

  it("keeps the delivery intent as the retry identity", () => {
    const first = makeEvent({
      merchandise_subtotal_minor: 1700,
      delivery_fee_minor: 300,
      discount_total_minor: 0,
      total_amount_minor: 2000,
      cod_amount_minor: 2000,
      payment_method: "COD",
      currency_code: "BND",
    });
    const retry = { ...first, event_id: "same-delivery-retry" };
    expect(retry.delivery_intent_id).toBe(first.delivery_intent_id);
    expect(() => validateKitaniOrderReadyEvent(retry)).not.toThrow();
  });

  it("rejects a COD amount that is not the final customer total", () => {
    expect(() => validateKitaniOrderReadyEvent(makeEvent({
      merchandise_subtotal_minor: 1700,
      delivery_fee_minor: 300,
      discount_total_minor: 0,
      total_amount_minor: 2000,
      cod_amount_minor: 300,
      payment_method: "COD",
      currency_code: "BND",
    }))).toThrow("COD amount must equal the final customer total");
  });

  it("rejects decimal or negative minor-unit values", () => {
    expect(() => validateKitaniOrderReadyEvent(makeEvent({
      merchandise_subtotal_minor: 1700.5,
      delivery_fee_minor: 300,
      discount_total_minor: 0,
      total_amount_minor: 2000,
      cod_amount_minor: 2000,
      payment_method: "COD",
      currency_code: "BND",
    }))).toThrow("merchandise_subtotal_minor must be a non-negative integer minor-unit value");
  });
});
