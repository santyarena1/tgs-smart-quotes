import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // Los tests de integración comparten una única base de pruebas y la truncan,
    // así que los archivos no pueden ejecutarse en paralelo.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
