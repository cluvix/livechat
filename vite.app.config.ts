import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { viteSingleFile } from 'vite-plugin-singlefile';

// App build → public/widget.html (iframe app). viteSingleFile inline TOÀN BỘ JS+CSS vào 1 file HTML
// duy nhất → đúng 1 output widget.html tự chứa (không asset rời, không hash), khớp AC1.
// outDir = public repo cha mặc định; emptyOutDir=false (không xoá output ng build). story-10:
// WIDGET_OUT_DIR override cho CI (build ra `dist/`).
const outDir = process.env.WIDGET_OUT_DIR
  ? resolve(__dirname, process.env.WIDGET_OUT_DIR)
  : resolve(__dirname, '../../public');

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir,
    emptyOutDir: false,
    target: 'es2019',
    minify: 'esbuild',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      input: resolve(__dirname, 'widget.html'),
    },
  },
});
