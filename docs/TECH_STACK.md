# Tech stack

Every dependency here is justified. If you want to add one, open an ADR.

## Chosen

| Layer | Choice | Version | Why this one |
|---|---|---|---|
| Framework | Next.js (App Router, `output: 'export'`) | 15.x | Static export to a CDN, file-based routing, React Server Components for the non-interactive shell. Never sleeps, no cold start. |
| Language | TypeScript, `strict: true` | 5.6+ | The simulator is the product; types are the spec. |
| UI runtime | React | 19.x | Ecosystem, and it keeps `packages/viz` portable. |
| Charts | `d3-scale`, `d3-shape`, `d3-array`, `d3-interpolate` | 4.x | Scales and path generators only. React renders; D3 computes. |
| State | Zustand | 5.x | ~1 kB, no provider tree, selector subscriptions keep the 16 ms budget reachable under a `rAF` clock. |
| Styling | CSS Modules + design tokens as CSS custom properties | — | No utility-class framework. The token set is small and the theming rules are strict; see DESIGN_SYSTEM.md. |
| Animation | Custom `rAF` clock in the store | — | A single virtual clock is a hard requirement. A generic animation library would fight it. |
| Client SQL | DuckDB-WASM | 1.29+ | v1.1. Lazy-loaded. Real Parquet, real HTTP range reads. |
| Tests | Vitest + Testing Library + Playwright | — | Vitest for the simulator goldens, Playwright for perf traces and visual regression. |
| Package manager | pnpm workspaces | 9.x | Workspace boundaries that CI can enforce. |
| Host | Vercel (Cloudflare Pages equivalent) | — | Static output, preview deploys per PR. |
| Capture side | PySpark 3.5 on DBR 14.3 LTS | — | Fixture generation only, run manually. Not part of CI. |

## Rejected, and why

| Rejected | Why not |
|---|---|
| **Streamlit / Gradio** | Rerun-on-interaction fights 60 fps animation; custom viz means an iframe component with its own build anyway; needs a live Python process that sleeps on free tiers. The 30-second visitor hits a cold start and leaves. |
| **Observable Framework** | Genuinely good, and the fallback if React is not wanted. Costs the bespoke interaction design (scrubber, synchronised panes, challenge mode). Recorded in ADR-0001. |
| **Three.js / WebGL** | Partition sizes and task durations are one-dimensional quantities read against a shared baseline. Perspective destroys exactly the comparison the page exists to make. |
| **Pyodide + PySpark** | PySpark is a Py4J client to a JVM. There is no JVM in the browser. Claiming otherwise costs more credibility than the feature could buy. See ADR-0002. |
| **A backend (FastAPI, a real Spark cluster on demand)** | Cost, cold start, abuse surface, and it makes the project undeployable by anyone else. The three-layer model removes the need. |
| **Tailwind** | Not wrong, but the design system here is 30 tokens and six components, and the theming rules (three theme states) are easier to keep correct in plain CSS custom properties. |
| **Redux / XState** | Store is ~12 fields plus a clock. XState is a real candidate if challenge mode grows; revisit in v2.0. |
| **A charting library (Recharts, Visx, Chart.js)** | Every chart here is bespoke — a Gantt on a virtual clock, a plan tree that rewrites itself. Wrapping a general library costs more than `d3-scale` plus JSX. |

## Version pins and upgrades

- Exact versions in `pnpm-lock.yaml`; `packages/sim` has **zero runtime dependencies** and must
  stay that way.
- Renovate opens grouped PRs weekly. Simulator golden tests are the safety net for any bump.
- Node 20 LTS. `.nvmrc` committed.

## CI toolchain

| Gate | Tool | Fails on |
|---|---|---|
| Types | `tsc --noEmit` | any error |
| Lint | ESLint + `dependency-cruiser` | rule violation or illegal package edge |
| Unit | Vitest | any failure; simulator coverage below 90 % |
| Bundle | `@next/bundle-analyzer` budget check | first-load JS > 160 kB gz |
| Perf | Playwright trace, M1 scenario | p95 frame > 16 ms over a 10 s play |
| A11y | `axe-core` via Playwright | any serious or critical violation |
| Visual | Playwright screenshots, light + dark | unreviewed pixel diff |
