import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Only what the app loads: our own files, Google Fonts, data: images (the 2D structures).
// frame-ancestors can't go in a <meta> tag; the web server must send it as a header.
const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

// Build only: the dev server injects inline scripts for hot reload, which this policy would block.
const contentSecurityPolicy = {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
        html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

export default defineConfig({
    plugins: [react(), contentSecurityPolicy],
    server: {
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            // Keep the browser's Host header: the backend refuses POSTs whose Origin doesn't match it.
            '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
        }
    }
});
