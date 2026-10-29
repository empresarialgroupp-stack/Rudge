/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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

// Leitor de fotos (Tesseract) servido pelo próprio Rudge: sem depender de CDN e
// disponível offline depois do primeiro uso. Só é baixado quando a captura é usada.
function copyOcr(): Plugin {
  let outDir = 'dist';
  return {
    name: 'rudge-copy-ocr',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const nm = resolve(__dirname, 'node_modules');
      const files: [string, string][] = [
        ['tesseract.js/dist/worker.min.js', 'ocr/worker.min.js'],
        ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'ocr/tesseract-core-lstm.wasm.js'],
        ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'ocr/tesseract-core-simd-lstm.wasm.js'],
        ['@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'ocr/lang/por.traineddata.gz'],
      ];
      for (const [from, to] of files) {
        const dest = resolve(outDir, to);
        mkdirSync(resolve(dest, '..'), { recursive: true });
        copyFileSync(resolve(nm, from), dest);
      }
    },
  };
}

// base relativo: funciona na raiz de um domínio ou em subpasta (ex.: GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react(), stampServiceWorker(), copyOcr()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    environment: 'node',
  },
});
