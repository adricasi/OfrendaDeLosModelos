import { defineConfig, type Plugin } from "vite";

/**
 * The CSP meta tag in index.html is meant for production. Vite's dev server injects its
 * styles as inline <style> elements, which `style-src 'self'` blocks, so dev serves the page
 * without the CSP. The production build keeps it (see test/page-policy.test.ts).
 */
function stripCspInDev(): Plugin {
  return {
    name: "strip-csp-in-dev",
    apply: "serve",
    transformIndexHtml(html) {
      return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/s, "");
    },
  };
}

export default defineConfig({
  base: "/OfrendaDeLosModelos/",
  plugins: [stripCspInDev()],
  build: {
    target: "es2023",
    // Chrome and Edge support modulepreload natively; no injected polyfill code.
    modulePreload: { polyfill: false },
  },
});
