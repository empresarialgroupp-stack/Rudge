/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Carimba uma versão única no service worker a cada build (força atualização do cache).
function stampServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'rudge-stamp-sw',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const file = resolve(outDir, 'sw.js');
      if (!existsSync(file)) return;
      const id = Date.now().toString(36);
      writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD_ID__', id));
    },
  };
}

// base relativo: funciona na raiz de um domínio ou em subpasta (ex.: GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react(), stampServiceWorker()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    environment: 'node',
  },
});
