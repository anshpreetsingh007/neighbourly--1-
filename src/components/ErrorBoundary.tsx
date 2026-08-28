import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Shown instead of the generic copy, e.g. "We couldn't load your jobs." */
  message?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so one bad value cannot blank the entire app.
 *
 * React unmounts the whole tree when a render throws, which leaves the user
 * staring at an empty background with no explanation and no way back. This
 * shows them what happened and offers a way out instead.
 *
 * Must be a class - there is no hook equivalent for componentDidCatch.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Replace with a real reporting service (Sentry et al) before launch -
    // console.error only helps when someone happens to have DevTools open.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="glass rounded-3xl border border-white/10 p-8 max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-rose-status/15 border border-rose-status/30 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-rose-status" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-display font-bold">Something went wrong</h2>
            <p className="text-white/50 text-sm leading-relaxed">
              {this.props.message ||
                'This screen ran into a problem. Nothing you did caused it, and your data is safe.'}
            </p>
          </div>

          {import.meta.env.DEV && (
            <pre className="text-left text-[11px] text-rose-status/80 bg-black/30 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          )}

          <div className="flex gap-3">
            <button
              onClick={this.handleReset}
              className="flex-1 glass hover:bg-white/10 rounded-2xl py-3.5 font-bold text-sm transition-all active:scale-95"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.assign('/')}
              className="flex-1 bg-amber-accent text-slate-900 rounded-2xl py-3.5 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <RefreshCw className="w-4 h-4" /> Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
