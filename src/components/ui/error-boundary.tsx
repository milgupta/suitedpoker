"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Called on every caught error. Substage 8.1 wires PostHog in through this —
   * PostHog is deliberately NOT imported here, so this component stays free of
   * analytics and usable in tests.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Replaces the default fallback. `reset` retries the subtree. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * A real error boundary — a class component, because React has no hook for
 * this. Catches a render error in its subtree and offers a retry rather than
 * blanking the screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    if (this.props.fallback !== undefined) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <EmptyState
        icon={TriangleAlertIcon}
        headline="Something went wrong"
        // The message itself is deliberately not shown: it is rarely meaningful
        // to a player and can leak internals.
        body="That part of the page failed to load. Trying again usually fixes it."
        action={
          <Button variant="primary" onClick={this.reset}>
            Try again
          </Button>
        }
      />
    );
  }
}
