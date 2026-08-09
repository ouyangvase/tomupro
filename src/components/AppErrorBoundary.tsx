import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  isChunkLoadFailure,
  recoverFromChunkLoadFailure,
  resetChunkRecovery,
} from "@/lib/chunkRecovery";

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App render failed", error, errorInfo);

    if (isChunkLoadFailure(error)) {
      recoverFromChunkLoadFailure();
    }
  }

  private reload = () => {
    resetChunkRecovery();
  };

  private clearAndReload = () => {
    resetChunkRecovery();
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
