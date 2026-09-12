// Ambient module declaration for CSS Modules imports — see packages/ui/css-modules.d.ts for
// why this is needed outside apps/web's Next.js build.
declare module '*.module.css' {
  const classes: { readonly [className: string]: string };
  export default classes;
}
