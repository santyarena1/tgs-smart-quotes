import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    rollupOptions: { input: { preview: "preview.html" }, output: { entryFileNames: "[name].js" } },
    outDir: "dist",
    emptyOutDir: false,
  },
});