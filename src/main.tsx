import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { installChunkRecovery } from "@/lib/installChunkRecovery";

installChunkRecovery();

async function bootstrap() {
  if (import.meta.env.DEV) {
    const { scan } = await import('react-scan');
    scan({ enabled: true });
  }

  createRoot(document.getElementById("root")!).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>,
  );
}

void bootstrap();
