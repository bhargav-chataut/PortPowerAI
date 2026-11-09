import assert from "node:assert/strict";
import test from "node:test";
import { classifyRegion } from "./regions.js";
import { normalizePosition } from "./normalize.js";

test("classifies Gulfport and Miami without mixing regions", () => {
  assert.equal(classifyRegion(30.365, -89.093), "gulfport");
  assert.equal(classifyRegion(25.77, -80.18), "miami");
  assert.equal(classifyRegion(30.31, -87.43), null);
});

test("reads coordinates from the typed report when metadata omits them", () => {
  const result = normalizePosition({
    MessageType: "StandardClassBPositionReport",
    MetaData: { MMSI: 368175550, ShipName: "TEST SHIP" },
    Message: {
      StandardClassBPositionReport: {
        Latitude: 25.78, Longitude: -80.17, Sog: 0, Valid: true,
      },
    },
  }, "2026-11-08T12:00:00.000Z");
  assert.equal(result?.latitude, 25.78);
  assert.equal(result?.longitude, -80.17);
  assert.equal(result?.speedKnots, 0);
});

test("rejects unsupported and invalid position payloads", () => {
  const payload = { MessageType: "PositionReport", MetaData: { MMSI: 368175550 }, Message: { PositionReport: { Latitude: 91, Longitude: -80.1 } } };
  assert.equal(normalizePosition(payload, new Date().toISOString()), null);
  assert.equal(normalizePosition({ MessageType: "SubscriptionConfirmation" }, new Date().toISOString()), null);
});
