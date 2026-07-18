import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Loader build → public/widget.js (IIFE, không hash, self-contained).
// Style của loader inject bằng JS vào Shadow DOM (không emit CSS asset, không leak CSS trang khách).
// outDir = public repo cha (git-tracked, cùng static host với app Angular); emptyOutDir=false để
// KHÔNG xoá output ng build khi chỉ build widget.
export default defineConfig({
  build: {
    outDir: resolve(__dirname, '../../public'),
    emptyOutDir: false,
    target: 'es2019',
    minify: 'esbuild',
    lib: {
      entry: resolve(__dirname, 'src/loader.ts'),
      formats: ['iife'],
      name: 'CluvixLivechatWidget',
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'widget.js',
        // Loader không import CSS/asset — nếu có cũng gom về tên cố định (tránh hash).
        assetFileNames: 'widget-loader.[ext]',
      },
    },
  },
});
