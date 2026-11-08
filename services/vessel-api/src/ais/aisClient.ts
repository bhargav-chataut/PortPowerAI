import { saveVessel } from "./vesselStore.js";
import WebSocket from "ws";

const AIS_URL = "wss://stream.aisstream.io/v0/stream";

export function connectAIS() {
  const apiKey = process.env.AISSTREAM_API_KEY;

  if (!apiKey) {
    console.error("AISSTREAM_API_KEY is missing");
    return;
  }

  const socket = new WebSocket(AIS_URL, {
    perMessageDeflate: true,
  });

  socket.on("open", () => {
    console.log("Connected to AISStream");

    socket.send(
      JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [
          [
            [30.15, -89.30],
            [30.50, -88.85],
          ],
        ],
        FilterMessageTypes: [
          "PositionReport",
          "StandardClassBPositionReport",
          "ExtendedClassBPositionReport",
        ],
      })
    );
  });


  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("AIS message received:", message.MessageType);
  
      if (message.MessageType === "SubscriptionConfirmation") {
        console.log("AIS subscription confirmed");
        console.log("Details:", message.Message);
        return;
      }
  
      const metadata = message.MetaData;
  
      if (!metadata || !Number.isInteger(metadata.MMSI)) {
        return;
      }
  
      const position = message.Message?.[message.MessageType];
  
      const latitude = metadata.Latitude;
      const longitude = metadata.Longitude;
  
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return;
      }
  
      const vessel = {
        mmsi: metadata.MMSI,
        name: metadata.ShipName || "Unknown Vessel",
        latitude,
        longitude,
        speedKnots:
          typeof position?.Sog === "number" &&
          Number.isFinite(position.Sog) &&
          position.Sog >= 0 &&
          position.Sog < 102.3
            ? position.Sog
            : null,
        lastUpdated: new Date().toISOString(),
      };
  
      saveVessel(vessel);
  
      console.log(
        "Saved vessel:",
        vessel.name,
        vessel.mmsi
      );
    } catch (error) {
      console.error("Invalid AIS message received:", error);
    }
  });
  

  socket.on("error", (error) => {
    console.error("AIS WebSocket error:", error.message);
  });

  socket.on("close", (code, reason) => {
    console.log("AIS connection closed:", code, reason.toString());
  });
}
