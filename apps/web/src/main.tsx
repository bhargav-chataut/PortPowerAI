
import React from "react";
import ReactDOM from "react-dom/client";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import FleetDashboard from "./pages/FleetDashboard";
import VesselDetailsPage from "./pages/VesselDetailsPage";
import EquipmentManagementPage from "./pages/EquipmentManagementPage";
import VesselArrivalsPage from "./pages/VesselArrivalsPage";
import OperationsDashboard from "./pages/OperationsDashboard";

import ProtectedRoute from "./components/ProtectedRoute";
import BerthManagementPage from "./pages/BerthManagementPage";

import "./index.css";

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/gulfport/berths" element={<ProtectedRoute port="gulfport"><BerthManagementPage port="gulfport" /></ProtectedRoute>} />
        <Route path="/miami/berths" element={<ProtectedRoute port="miami"><BerthManagementPage port="miami" /></ProtectedRoute>} />
        {/* Default route */}
        <Route
          path="/"
          element={<Navigate to="/gulfport" replace />}
        />

        {/* Login page */}
        <Route
          path="/login"
          element={<LoginPage />}
        />

        {/* ========================= */}
        {/* GULFPORT ROUTES */}
        {/* ========================= */}

        {/* Gulfport Map Dashboard */}
        <Route
          path="/gulfport"
          element={
            <ProtectedRoute port="gulfport">
              <FleetDashboard
                region="gulfport"
                view="map"
              />
            </ProtectedRoute>
          }
        />

        {/* Gulfport Vessel List */}
        <Route
          path="/gulfport/vessels"
          element={
            <ProtectedRoute port="gulfport">
              <FleetDashboard
                region="gulfport"
                view="list"
              />
            </ProtectedRoute>
          }
        />

        {/* Gulfport Equipment Management */}
        <Route
          path="/gulfport/equipment"
          element={
            <ProtectedRoute port="gulfport">
              <EquipmentManagementPage port="gulfport" />
            </ProtectedRoute>
          }
        />

        {/* Gulfport Vessel Arrivals */}
        <Route
          path="/gulfport/arrivals"
          element={
            <ProtectedRoute port="gulfport">
              <VesselArrivalsPage port="gulfport" />
            </ProtectedRoute>
          }
        />

        {/* ========================= */}
        {/* MIAMI ROUTES */}
        {/* ========================= */}

        {/* Miami Map Dashboard */}
        <Route
          path="/miami"
          element={
            <ProtectedRoute port="miami">
              <FleetDashboard
                region="miami"
                view="map"
              />
            </ProtectedRoute>
          }
        />

        {/* Miami Vessel List */}
        <Route
          path="/miami/vessels"
          element={
            <ProtectedRoute port="miami">
              <FleetDashboard
                region="miami"
                view="list"
              />
            </ProtectedRoute>
          }
        />

        {/* Miami Equipment Management */}
        <Route
          path="/miami/equipment"
          element={
            <ProtectedRoute port="miami">
              <EquipmentManagementPage port="miami" />
            </ProtectedRoute>
          }
        />

        {/* Miami Vessel Arrivals */}
        <Route
          path="/miami/arrivals"
          element={
            <ProtectedRoute port="miami">
              <VesselArrivalsPage port="miami" />
            </ProtectedRoute>
          }
        />

        {/* ========================= */}
        {/* OPERATIONS ROUTES */}
        {/* ========================= */}

        {/* Gulfport Operations Demo */}
        <Route
          path="/operations"
          element={
            <ProtectedRoute port="gulfport">
              <OperationsDashboard />
            </ProtectedRoute>
          }
        />

        {/* Vessel Details */}
        <Route
          path="/vessels/:mmsi"
          element={<VesselDetailsPage />}
        />

        {/* Unknown routes */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
