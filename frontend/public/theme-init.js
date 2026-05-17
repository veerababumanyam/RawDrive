/* RawDrive theme init — runs synchronously in <head> before React hydrates.
 *
 * Loaded by <script src="/theme-init.js" /> in src/app/layout.tsx.
 *
 * IMPORTANT: keep the constants below in sync with the canonical
 * source-of-truth in src/components/theme/ThemeProvider.tsx:
 *   - STORAGE_KEY
 *   - VALID_THEMES
 *   - DARK_THEMES
 *   - META_COLORS
 *   - DEFAULT_THEME
 *
 * Why this lives in /public/ instead of inline in layout.tsx:
 *   React 19 (shipped with Next 16) warns "Encountered a script tag while
 *   rendering React component" for ANY <script> element rendered as JSX,
 *   including <script dangerouslySetInnerHTML={...}>. The recommended
 *   pattern for pre-hydration scripts is an external src; the browser
 *   parses and executes it as part of <head> before React touches the DOM,
 *   and React never sees the script element as a child.
 */
(function () {
  try {
    var key = "rawdrive-theme";
    var validThemes = ["liquid-glass", "liquid-glass-dark", "midnight"];
    var darkThemes = ["liquid-glass-dark", "midnight"];
    var metaColors = {
      "liquid-glass": "#f6f7f9",
      "liquid-glass-dark": "#0f1219",
      "midnight": "#070709",
    };
    var defaultTheme = "liquid-glass-dark";

    var stored = window.localStorage.getItem(key);
    var theme;
    if (validThemes.indexOf(stored) !== -1) {
      theme = stored;
    } else {
      var prefersDark =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      theme = prefersDark ? "liquid-glass-dark" : "liquid-glass";
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme =
      darkThemes.indexOf(theme) !== -1 ? "dark" : "light";

    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute("content", metaColors[theme] || metaColors[defaultTheme]);
    }
  } catch (_error) {
    document.documentElement.dataset.theme = "liquid-glass-dark";
    document.documentElement.style.colorScheme = "dark";
  }
})();
