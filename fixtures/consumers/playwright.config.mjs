export default {
  testMatch: "playwright.spec.mjs",
  reporter: [["list"], ["@topology/playwright"]],
  workers: 1,
};
