// The pre-hydration theme script. Runs synchronously in <head>, before first paint, so a
// persisted explicit choice ("light" | "dark") is applied without a flash of the wrong
// theme. If nothing is persisted, `data-theme` is left unset entirely — the unstamped
// system-default state — and packages/ui/tokens.css's `@media (prefers-color-scheme: dark)`
// block takes over. The toggle UI that writes localStorage lands in E8; this only reads it.
export const THEME_STORAGE_KEY = 'sas-theme';

export function themeScript(): string {
  return `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
}
