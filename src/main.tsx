import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ServerDownPage from "./pages/ServerDownPage";
import { setRuntimeConfig } from "./config/constants";
import "./index.css";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element not found. Make sure there is a <div id='root'></div> in public/index.html");
}

function AppRoot() {
  const [ready, setReady] = useState(false);
  const [serverDown, setServerDown] = useState(false);

  useEffect(() => {
    fetch("/proxy/api/admin/panel-config")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((cfg) => {
        setRuntimeConfig(cfg);
        setServerDown(String(cfg.serverDown || "").toLowerCase() === "yes");
        setReady(true);
      })
      .catch(() => {
        setServerDown(true);
        setReady(true);
      });
  }, []);

  if (!ready) return null;
  if (serverDown) return <ServerDownPage />;
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

createRoot(rootEl).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);
