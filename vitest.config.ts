import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

process.env.WATERMARK_SECRET ??= "test-watermark-secret-do-not-use-in-prod";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  }
});
