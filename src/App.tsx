// src/App.tsx 
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import LoginPage        from "./pages/LoginPage";
import MainPage         from "./pages/MainPage";
import DeviceDetailPage from "./pages/DeviceDetailPage";
import ExpiredPage      from "./pages/ExpiredPage";
import LicenseGate      from "./routes/LicenseGate";
import Toast            from "./components/ui/Toast";

import { isLoggedIn }         from "./services/api/auth";
import { getLicenseSnapshot } from "./utils/license";

type ProtectedProps = React.PropsWithChildren<{ redirectTo?: string }>;

const ProtectedRoute = ({ children, redirectTo = "/login" }: ProtectedProps) => {
  if (getLicenseSnapshot().isExpired) return <Navigate to="/expired" replace />;
  if (!isLoggedIn())                  return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
};

export default function App() {
  const expired = getLicenseSnapshot().isExpired;

  return (
    <LicenseGate>
      <Routes>
        <Route path="/expired" element={<ExpiredPage />} />
        <Route path="/login"   element={<LoginPage   />} />

        {/* Main page — sab tabs yahan (Home, Data, Messages, Groups, Devices) */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainPage />
            </ProtectedRoute>
          }
        />

        {/* Device detail — sirf yahi alag page hai */}
        <Route
          path="/devices/:deviceId"
          element={
            <ProtectedRoute>
              <DeviceDetailPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to={expired ? "/expired" : isLoggedIn() ? "/" : "/login"}
              replace
            />
          }
        />
      </Routes>
      <Toast />
    </LicenseGate>
  );
}
