import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/s3.ts', 'src/gcs.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
});
