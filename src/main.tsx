import { createRoot } from "react-dom/client";
import "./index.css";
import { installChunkRecovery } from "@/lib/installChunkRecovery";

installChunkRecovery();

function renderBootstrapError(error: unknown) {
  const root = document.getElementById("root");
  if (!root) return;

  const message = error instanceof Error ? error.message : String(error);
  const escapedMessage = message.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);

  root.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#faf8f3;color:#1f1f1f;font-family:system-ui,sans-serif">
      <section style="width:min(100%,560px);padding:28px;border:1px solid #e6ded0;border-radius:20px;background:#fff;box-shadow:0 12px 32px #1f1f1f12">
        <p style="margin:0 0 8px;color:#b7791f;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">TOMUPRO</p>
        <h1 style="margin:0 0 12px;font-size:24px">The app could not start</h1>
        <p style="margin:0 0 18px;color:#5f5f5f;line-height:1.5">Reload the page. If this continues, the app configuration is missing or invalid.</p>
        <details style="color:#5f5f5f;font-size:13px"><summary>Technical details</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapedMessage}</pre></details>
        <button type="button" onclick="location.reload()" style="margin-top:20px;padding:10px 16px;border:0;border-radius:10px;background:#c58d3b;color:#fff;font:inherit;font-weight:600;cursor:pointer">Reload</button>
      </section>
    </main>`;
}

async function bootstrap() {
  try {
    if (import.meta.env.DEV) {
      try {
        const { scan } = await import("react-scan");
        scan({ enabled: true });
      } catch (error) {
        console.warn("[TOMUPRO] React Scan is unavailable; continuing without it", error);
      }
    }

    const [{ default: App }, { AppErrorBoundary }] = await Promise.all([
      import("./App.tsx"),
      import("@/components/AppErrorBoundary"),
    ]);

    createRoot(document.getElementById("root")!).render(
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>,
    );
  } catch (error) {
    console.error("[TOMUPRO] Application bootstrap failed", error);
    renderBootstrapError(error);
  }
}

void bootstrap();
