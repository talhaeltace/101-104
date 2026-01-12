import React from 'react';

type AppErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error)
    };
  }

  componentDidCatch(error: unknown) {
    // Keep a breadcrumb so we can ask users for it if needed.
    try {
      const payload = {
        at: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error)
      };
      localStorage.setItem('last_startup_error_v1', JSON.stringify(payload));
    } catch {
      // ignore
    }

    // Still log to console for Xcode/WKWebView logs.
    // eslint-disable-next-line no-console
    console.error('App crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-semibold text-gray-900">Uygulama başlatılamadı</div>
            <div className="mt-2 text-sm text-gray-600">
              Uygulama açılırken bir hata oluştu. Lütfen tekrar deneyin.
            </div>
            {this.state.message ? (
              <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                {this.state.message}
              </pre>
            ) : null}
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              onClick={() => {
                try {
                  window.location.reload();
                } catch {
                  // ignore
                }
              }}
            >
              Yeniden Dene
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
