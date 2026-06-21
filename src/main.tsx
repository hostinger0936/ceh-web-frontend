import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ServerDownPage from "./pages/ServerDownPage";
import "./index.css";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element not found. Make sure there is a <div id='root'></div> in public/index.html");
}

const isServerDown = String(import.meta.env.VITE_SERVERDOWN || "").toLowerCase() === "yes";
const hasBypassCode = window.location.hash === "#5544";

createRoot(rootEl).render(
  <React.StrictMode>
    {isServerDown && !hasBypassCode ? (
      <ServerDownPage />
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>
);