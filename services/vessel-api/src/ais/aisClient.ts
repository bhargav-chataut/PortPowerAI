
import WebSocket from "ws";

import { saveVessel } from "./vesselStore.js";
import { saveVesselToDatabase } from "../repositories/vesselRepository.js";
import { getVesselRegion } from "../utils/vesselRegion.js";

const AIS_URL = "wss://stream.aisstream.io/v0/stream";

const POSITION_TYPES = [
  "PositionReport",
  "StandardClassBPositionReport",
  "ExtendedClassBPositionReport",
] as const;

// Gulfport and Miami are monitoring rectangles,
// not official port boundaries.
//
// Coordinates are [latitude, longitude].
const MONITORING_AREAS = [
  // Gulfport, Mississippi
  [
    [30.55, -89.35],
    [30.05, -88.80],
  ],

  // Miami, Florida
  [
    [25.835, -80.208],
    [25.603, -79.879],
  ],
];

const RECONNECT_DELAY_MS = 5000;

let activeSocket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

/**
 * Begin receiving AIS position reports.
 */
export function connectAIS(): void {
  stopped = false;

  if (
    activeSocket &&
    (activeSocket.readyState === WebSocket.OPEN ||
      activeSocket.readyState === WebSocket.CONNECTING)
  ) {
    console.log("AISStream is already connected or connecting");
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const apiKey = process.env.AISSTREAM_API_KEY;

  if (!apiKey) {
    console.error("AISSTREAM_API_KEY is missing");
    return;
  }

  console.log("Connecting to AISStream...");

  const socket = new WebSocket(AIS_URL, {
    perMessageDeflate: true,
  });

  activeSocket = socket;

  socket.on("open", () => {
    console.log("Connected to AISStream");

    const subscription = {
      APIKey: apiKey,
      BoundingBoxes: MONITORING_AREAS,
      FilterMessageTypes: [...POSITION_TYPES],
    };

    socket.send(JSON.stringify(subscription));

    console.log(
      "AIS subscription sent for Gulfport and Miami"
    );
  });

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.MessageType === "SubscriptionConfirmation") {
        console.log("AIS subscription confirmed");
        console.log(
          "Compression enabled:",
          message.Message?.CompressionEnabled
        );
        return;
      }

      if (
        !POSITION_TYPES.some(
          (type) => type === message.MessageType
        )
      ) {
        return;
      }

      const metadata = message.MetaData;
      const position = message.Message?.[message.MessageType];

      if (!metadata || !position || position.Valid === false) {
        return;
      }

      const mmsi = Number(metadata.MMSI);

      if (
        !Number.isInteger(mmsi) ||
        mmsi < 100000000 ||
        mmsi > 999999999
      ) {
        return;
      }

      const latitude =
        position.Latitude ?? metadata.Latitude;

      const longitude =
        position.Longitude ?? metadata.Longitude;

      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return;
      }

      const speed =
        typeof position.Sog === "number" &&
        Number.isFinite(position.Sog) &&
        position.Sog >= 0 &&
        position.Sog < 102.3
          ? position.Sog
          : null;

      const vessel = {
        mmsi,
        name:
          typeof metadata.ShipName === "string" &&
          metadata.ShipName.trim()
            ? metadata.ShipName.trim()
            : "Unknown Vessel",
        latitude,
        longitude,
        speedKnots: speed,
        lastUpdated: new Date().toISOString(),
      };

      const region = getVesselRegion(
        vessel.latitude,
        vessel.longitude
      );

      // Update latest observation in memory.
      saveVessel(vessel);

      // Persist identity and sampled position history.
      void saveVesselToDatabase(vessel, region).catch(
        (error) => {
          console.error(
            `Failed to persist AIS vessel ${mmsi}:`,
            error instanceof Error
              ? error.message
              : "Unknown error"
          );
        }
      );

      console.log("Saved AIS observation:", {
        mmsi: vessel.mmsi,
        name: vessel.name,
        latitude: vessel.latitude,
        longitude: vessel.longitude,
        region,
      });
    } catch (error) {
      console.error(
        "AIS message processing error:",
        error instanceof Error
          ? error.message
          : "Unknown error"
      );
    }
  });

  socket.on("error", (error) => {
    console.error("AIS WebSocket error:", error.message);
  });

  socket.on("close", (code, reason) => {
    console.warn("AIS connection closed:", {
      code,
      reason: reason.toString(),
    });

    if (activeSocket === socket) {
      activeSocket = null;
    }

    if (!stopped && !reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectAIS();
      }, RECONNECT_DELAY_MS);
    }
  });
}

/**
 * Stop the AIS connection and prevent reconnection.
 */
export function disconnectAIS(): void {
  stopped = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (activeSocket) {
    activeSocket.close();
    activeSocket = null;
  }
}
