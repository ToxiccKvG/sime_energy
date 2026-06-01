import React from 'react';

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; title?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-slate-100">
        <p className="text-red-300 font-semibold text-sm">
          {this.props.title ?? 'Une erreur est survenue'}
        </p>
        <p className="text-red-200/80 text-xs mt-2 whitespace-pre-wrap">
          {this.state.error.message}
        </p>
        {this.state.error.stack && (
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] text-slate-200/80">
            {this.state.error.stack}
          </pre>
        )}
      </div>
    );
  }
}

