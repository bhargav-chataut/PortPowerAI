import WebSocket from "ws";
import { saveVessel } from "./vesselStore.js";
import { MONITORING_AREAS } from "./regions.js";
import { normalizePosition, POSITION_TYPES } from "./normalize.js";

const AIS_URL = "wss://stream.aisstream.io/v0/stream";

/** One server-side subscription for both demo regions. Never expose the API key in the frontend. */
export function connectAIS(): void {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    console.warn("AISStream disabled (AISSTREAM_API_KEY not set); HTTP API remains available.");
    return;
  }
  const socket = new WebSocket(AIS_URL, { perMessageDeflate: true });

  socket.on("open", () => {
    socket.send(JSON.stringify({
      APIKey: apiKey,
      BoundingBoxes: MONITORING_AREAS.map((area) => area.bounds),
      FilterMessageTypes: POSITION_TYPES,
    }));
    console.log("AISStream connected; Gulfport and Miami subscription sent.");
  });

  socket.on("message", (data) => {
    try {
      const message: unknown = JSON.parse(data.toString());
      const envelope = message as { MessageType?: string; Message?: { CompressionEnabled?: boolean } };
      if (envelope?.MessageType === "SubscriptionConfirmation") {
        console.log("AISStream subscription confirmed; compression:", envelope.Message?.CompressionEnabled);
        return;
      }
      const vessel = normalizePosition(message, new Date().toISOString());
      if (vessel) saveVessel(vessel);
    } catch (error) {
      console.error("Failed to parse AISStream message:", error instanceof Error ? error.message : "unknown error");
    }
  });

  socket.on("error", (error) => console.error("AISStream error:", error.message));
  socket.on("close", (code, reason) =>
    console.warn("AISStream disconnected:", code, reason.toString()));
}
