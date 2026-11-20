import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { TooltipProvider } from "./components/ui/tooltip";
import "./styles.css";
import { initializeTheme } from "./theme";

initializeTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* One provider so a tooltip opened right after another skips the delay and its animation. */}
    <TooltipProvider delay={600}>
      <App />
    </TooltipProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
