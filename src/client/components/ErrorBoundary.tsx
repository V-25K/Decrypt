import React from 'react';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="app-surface flex h-full items-center justify-center p-4">
        <div className="app-surface-strong w-full max-w-[320px] rounded-2xl border app-border px-4 py-5 text-center">
          <h2 className="app-text text-sm font-black uppercase tracking-[0.04em]">
            Something Went Wrong
          </h2>
          <p className="app-text-muted mt-2 text-sm font-semibold">
            The game encountered an error. Try reopening this view.
          </p>
          <button
            type="button"
            className="btn-3d btn-primary mt-4 rounded-xl px-4 py-2 text-sm font-black uppercase"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
}
