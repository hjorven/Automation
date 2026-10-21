import { defineConfig } from "vite";

// GitHub Pages serves this repo under /Automation/.
// Override with VITE_BASE if the deploy path ever changes.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/Automation/",
});
