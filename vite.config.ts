import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: (() => {
    const host = '0.0.0.0';
    const port = 5173;

    // If you generate local certs with mkcert and place them in ./certs/
    // as 'localhost.pem' and 'localhost-key.pem', Vite will serve over HTTPS
    try {
      const certDir = path.resolve(__dirname, 'certs');
      const certPath = path.join(certDir, 'localhost.pem');
      const keyPath = path.join(certDir, 'localhost-key.pem');

      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        return {
          host,
          port,
          https: {
            cert: fs.readFileSync(certPath, 'utf8'),
            key: fs.readFileSync(keyPath, 'utf8')
          }
        };
      }
    } catch (e) {
      // ignore and fall back to http
      console.warn('vite.config: could not load local certs for https dev server', e);
    }

    return { host, port };
  })(),
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
