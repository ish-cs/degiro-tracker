"use client";
import React from "react";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("App crashed:", error);
  }

  reset = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("degiro-tracker:v2");
        localStorage.removeItem("degiro-tracker:v1");
      } catch {}
    }
    this.setState({ error: null });
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="min-h-screen p-6 md:p-10 max-w-2xl mx-auto flex flex-col gap-4">
        <h1 className="text-2xl font-medium tracking-tight">DEGIRO Tracker</h1>
        <div className="glass p-6 flex flex-col gap-4">
          <h2 className="text-lg font-medium">Something went wrong.</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            The app hit an unexpected error. Clearing saved data and reloading usually fixes it.
          </p>
          <pre className="text-xs mono text-[var(--color-negative)] whitespace-pre-wrap overflow-auto max-h-40">
            {this.state.error.message}
          </pre>
          <button
            onClick={this.reset}
            className="self-start px-4 py-2 text-sm rounded-full border border-white/20 hover:bg-white/10"
          >
            Clear data and reload
          </button>
        </div>
      </main>
    );
  }
}
