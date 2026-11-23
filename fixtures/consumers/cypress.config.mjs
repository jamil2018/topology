import { defineConfig } from "cypress";
import { topologyCypressPlugin } from "@topology/cypress";

export default defineConfig({
  video: false,
  e2e: {
    supportFile: false,
    setupNodeEvents(on, config) {
      topologyCypressPlugin(on, config);
      return config;
    },
  },
});
