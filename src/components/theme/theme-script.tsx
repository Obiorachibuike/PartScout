import { appConfig } from "@/lib/config";

/**
 * Applies the stored theme before first paint so there is no flash of the
 * wrong theme. Kept tiny and inline (runs before hydration).
 */
export function ThemeScript() {
  const script = `(function(){try{var key='partscout-theme';var stored=localStorage.getItem(key);var theme=stored|| (window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.classList.toggle('dark',theme===\'dark\');document.documentElement.dataset.theme=theme;}catch(e){document.documentElement.classList.add('dark');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} data-partscout-theme={appConfig.appName} />;
}
