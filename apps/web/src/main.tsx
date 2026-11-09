
import React from "react";
import ReactDOM from "react-dom/client";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import FleetDashboard from "./pages/FleetDashboard";
import VesselDetailsPage from "./pages/VesselDetailsPage";
import OperationsDashboard from "./pages/OperationsDashboard";

import "./index.css";

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/operations" element={<OperationsDashboard />} />
        {/* Redirect homepage to Gulfport */}
        <Route
          path="/"
          element={<Navigate to="/gulfport" replace />}
        />

        {/* Gulfport monitoring dashboard */}
        <Route
          path="/gulfport"
          element={<FleetDashboard region="gulfport" />}
        />

        {/* Miami monitoring dashboard */}
        <Route
          path="/miami"
          element={<FleetDashboard region="miami" />}
        />

        {/* Vessel intelligence and historical movement */}
        <Route
          path="/vessels/:mmsi"
          element={<VesselDetailsPage />}
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
