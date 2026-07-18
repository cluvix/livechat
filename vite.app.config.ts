import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { viteSingleFile } from 'vite-plugin-singlefile';

// App build → public/widget.html (iframe app). viteSingleFile inline TOÀN BỘ JS+CSS vào 1 file HTML
// duy nhất → đúng 1 output widget.html tự chứa (không asset rời, không hash), khớp AC1.
// outDir = public repo cha; emptyOutDir=false (không xoá output ng build).
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: resolve(__dirname, '../../public'),
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
