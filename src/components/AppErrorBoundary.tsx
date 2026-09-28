import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  forceCleanReload,
  forceReloadApp,
  isChunkLoadFailure,
  recoverFromChunkLoadFailure,
} from "@/lib/chunkRecovery";

type AppErrorBoundaryState = {
  error: Error | null;
};

const APP_ERROR_RECOVERY_KEY = "tomupro_app_error_recovery";
const APP_ERROR_RECOVERY_TIMEOUT_MS = 15_000;

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };
  private recoveryTimer: number | null = null;

  componentDidMount() {
    // Clear the one-shot guard only after the app has stayed mounted long
    // enough to prove that the clean recovery succeeded.
    this.recoveryTimer = window.setTimeout(() => {
      sessionStorage.removeItem(APP_ERROR_RECOVERY_KEY);
    }, APP_ERROR_RECOVERY_TIMEOUT_MS);
  }

  componentWillUnmount() {
    if (this.recoveryTimer !== null) window.clearTimeout(this.recoveryTimer);
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App render failed", error, errorInfo);

    if (isChunkLoadFailure(error)) {
      recoverFromChunkLoadFailure();
      return;
    }

    // A stale mobile bundle can fail while rendering a protected screen even
    // when the browser does not report it as a chunk-load error. Retry once
    // with caches and service workers cleared, then leave the diagnostic page
    // visible instead of creating an infinite reload loop.
    if (sessionStorage.getItem(APP_ERROR_RECOVERY_KEY) !== "1") {
      sessionStorage.setItem(APP_ERROR_RECOVERY_KEY, "1");
      void forceCleanReload();
    }
  }

  private reload = () => {
    forceReloadApp();
  };

  private clearAndReload = () => {
    void forceCleanReload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-background px-6 py-10 text-foreground">
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
          <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              TOMUPRO
            </p>
            <h1 className="mt-3 text-2xl font-bold">App needs a quick reload</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The app could not finish loading the latest screen. Reloading normally fixes this after an update.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button onClick={this.reload} className="flex-1">
                Reload app
              </Button>
              <Button onClick={this.clearAndReload} variant="outline" className="flex-1">
                Retry cleanly
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
