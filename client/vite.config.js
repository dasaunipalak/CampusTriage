import { defineConfig } from 'vite';
export default defineConfig({ server: { proxy: { '/complaints': 'http://127.0.0.1:3001', '/api': 'http://127.0.0.1:3001' } } });
