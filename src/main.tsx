import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import './index.css';

const rootEl = document.getElementById('root');

const showBootError = (title: string, details?: string) => {
  try {
    if (!rootEl) return;
    rootEl.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f9fafb;">
        <div style="width:100%;max-width:420px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:18px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,sans-serif;">
          <div style="font-size:16px;font-weight:700;color:#111827;">${title}</div>
          <div style="margin-top:8px;font-size:13px;color:#4b5563;line-height:1.4;">${details ? details.replace(/</g,'&lt;') : 'Uygulama açılırken bir hata oluştu.'}</div>
        </div>
      </div>
    `;
  } catch {
    // ignore
  }
};

// IMPORTANT: ESM dependencies execute before this module's body.
// So we must NOT import App (or anything that imports Supabase) at top-level,
// otherwise a missing env var can crash before we install handlers.

// Catch errors that happen before React mounts
window.addEventListener('error', (ev: any) => {
  const msg = ev?.message || ev?.error?.message || String(ev?.error || 'Unknown error');
  showBootError('Uygulama başlatılamadı', msg);
});
window.addEventListener('unhandledrejection', (ev: any) => {
  const reason = ev?.reason;
  const msg = reason?.message || String(reason || 'Unhandled rejection');
  showBootError('Uygulama başlatılamadı', msg);
});

const bootstrap = async () => {
  if (!rootEl) {
    // No root element => nothing to render into.
    return;
  }

  try {
    const [{ default: App }, { default: AppErrorBoundary }] = await Promise.all([
      import('./App.tsx'),
      import('./components/AppErrorBoundary.tsx')
    ]);

    const Router: any = Capacitor.getPlatform() === 'web' ? BrowserRouter : HashRouter;

    createRoot(rootEl).render(
      <StrictMode>
        <AppErrorBoundary>
          <Router>
            <App />
          </Router>
        </AppErrorBoundary>
      </StrictMode>
    );
  } catch (err: any) {
    const msg = err?.message || String(err || 'Boot error');
    showBootError('Uygulama başlatılamadı', msg);
  }
};

bootstrap();
