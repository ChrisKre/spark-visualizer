// Ambient module declaration for CSS Modules imports. Next.js provides this for apps/web
// automatically (via the `next` types reference in next-env.d.ts), but packages/ui and
// packages/viz are standalone TS projects checked directly by `tsc --noEmit`, so they need
// their own declaration for `import styles from './Foo.module.css'` to type-check.
declare module '*.module.css' {
  const classes: { readonly [className: string]: string };
  export default classes;
}
