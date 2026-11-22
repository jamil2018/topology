import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

// Node 26 exposes a localStorage getter that is undefined without a disk file.
// Supply browser-like per-test memory storage before component modules bootstrap.
function installStorage() {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(String(key)); },
    setItem: (key, value) => { values.set(String(key), String(value)); },
  };
  vi.stubGlobal("localStorage", storage);
}
function installMedia() {
  if (!window.matchMedia) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
  }
}
function installObjectUrl() {
  if (typeof URL.createObjectURL !== "function") {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:mock"),
    });
  }
  if (typeof URL.revokeObjectURL !== "function") {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  }
}
/** HeroUI Tabs SelectionIndicator (react-aria SharedElementTransition) needs this. */
function installAnimations() {
  if (
    typeof Element !== "undefined" &&
    typeof Element.prototype.getAnimations !== "function"
  ) {
    Element.prototype.getAnimations = () => [];
  }
}
installStorage();
installMedia();
installObjectUrl();
installAnimations();
beforeEach(() => {
  installStorage();
  installMedia();
  installObjectUrl();
  installAnimations();
});
afterEach(() => {
  window.localStorage?.clear();
  window.history.replaceState(null, "", "/");
});
