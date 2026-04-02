import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 32,
          textAlign: 'center',
          color: 'var(--text, #f0f0f0)',
          background: 'var(--bg, #1a1a1a)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Something went wrong</h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted, #a0a0a0)', maxWidth: 320 }}>
            The app encountered an unexpected error. Your data is safe. Try refreshing the page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent, #FE841B)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
          {this.state.error && (
            <details style={{ marginTop: 16, fontSize: '0.75rem', color: 'var(--muted, #a0a0a0)', maxWidth: 320, textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer' }}>Error details</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8 }}>
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
