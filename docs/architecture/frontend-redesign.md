# Frontend redesign: UST-inspired design system

This documents the frontend-only redesign that introduced Mnemo's first shared
design-token/component layer (previously every page/component hand-wrote Tailwind
utility classes with no shared primitives) and restructured navigation from a single
top header row into a persistent sidebar + top bar, modeled on the structural pattern
of an internal UST Square reference screenshot. No backend, API, route param, or
`lib/api-client.ts`/`lib/types.ts` change was made -- every page's data-fetching
logic, loading/empty/error conditionals, and button disabled/label-swap behavior are
unchanged from before the redesign; only the JSX/styling inside each branch changed.

A later pass (documented under "Glass design system", "Typed relations" and
"Knowledge graph" below) layered a frosted-glass visual language over this, and did
change the backend -- item links are now typed.

## Design tokens

`app/globals.css` extends Tailwind v4's CSS-first `@theme inline` block (there is no
`tailwind.config.*` in this project) with a `--color-brand-{50..900}` teal scale and
`--color-surface`/`--color-surface-muted`/`--color-border` neutral tokens. Because
Tailwind v4 auto-derives utilities from any `--color-*` token declared in `@theme`,
this makes `bg-brand-700`, `text-brand-600`, `border-border`, etc. available as
ordinary utility classes with no extra plugin config. Domain-meaningful colors (the
three item-kind colors used on graph nodes and kind badges, error-message red) were
deliberately left alone -- this redesign only restyles chrome/UI color, not colors
that already carry meaning.

## Shared primitives

`components/ui/` (new) holds the first reusable presentational layer: `Button`,
`Card`, `Input`, `Textarea`, `Select`, `Badge`, `EmptyState`, `ErrorMessage`,
`LoadingState`, `ListRow`. Each is a thin styled wrapper over its native element --
`Button` still renders a real `<button>`, `Select` a real `<select>` -- specifically
so the existing Vitest suite (which queries by role/label/text, e.g.
`getByRole("button", { name: "Add" })`) kept passing unmodified through the whole
redesign. `lib/cn.ts` wraps `clsx` for conditional className joining.

## Navigation shell

`components/layout/TopBar.tsx` (slim dark-teal bar: Mnemo wordmark, user name, log
out, a small secondary UST co-brand mark) replaces the old inline `Header()` that
used to live directly in `app/spaces/layout.tsx`. `components/layout/Sidebar.tsx`
(space-scoped nav: Overview/Search/Graph/Conversations/Memory, active-state via
`usePathname()`, hosts the `SpaceSwitcher`) is mounted by a new
`app/spaces/[spaceId]/layout.tsx` that wraps only the space-scoped routes -- the
plain `/spaces` list page keeps `TopBar` only, matching its pre-redesign nav-less
structure. Neither the Mnemo nor UST mark has a real brand-asset file anywhere in
this repo; both are small inline SVG/text components built in code
(`components/MnemoLogo.tsx`, `components/UstMark.tsx`).

Below Tailwind's `md` breakpoint the sidebar becomes an off-canvas panel (a
`translate-x` transform + backdrop, toggled by a `Menu` button `[spaceId]/layout.tsx`
renders inline) rather than squeezing page content into a few hundred pixels --
there was no existing responsive-nav pattern in this app to build on, since the old
single-row header never had this problem. The panel stays CSS-transform-driven on
purpose: Motion writes transform via inline style, which would always beat a Tailwind
`md:` utility regardless of viewport.

One pre-existing e2e assertion had to be updated because of the new persistent
sidebar: `tests/e2e/smoke.spec.ts` used an unscoped `page.getByRole("combobox")` to
find `ItemLinkPicker`'s "link to..." select on the item detail page, which was
unambiguous before the sidebar existed. Since `SpaceSwitcher`'s combobox now renders
on every space-scoped page, that selector became ambiguous and was scoped. No test
assertion's *intent* changed, only its scope. (This has since happened twice more --
see "Knowledge graph" below.)

## Glass design system

A second pass layered a frosted-glass visual language over the token system above.

`app/globals.css` gained a `--glass-*` vocabulary -- background, border, blur, tinted
shadow and radius -- plus three utilities declared with Tailwind v4's `@utility`:
`glass`, `glass-strong`, `glass-subtle`. They are `@utility` blocks rather than plain
CSS classes specifically so they land in the utilities layer and stay overridable by a
caller's `className`; a plain class defined after `@import "tailwindcss"` would beat
any utility passed in, making `<Card className="bg-white">` silently impossible.

The three opacity steps carry an accessibility obligation, not just a look:

| Utility | White | Use |
|---|---|---|
| `glass-strong` | 80% | the only step body text may sit on |
| `glass` | 62% | panels, cards, chrome with short labels |
| `glass-subtle` | 45% | decorative chrome and chips only |

Two non-obvious details are load-bearing:

- **`-webkit-backdrop-filter` is authored *before* the standard property.** Lightning
  CSS (Turbopack's minifier) collapses the pair and keeps whichever comes last, so the
  natural ordering shipped the `-webkit-` form alone -- which Firefox does not
  implement, leaving glass as an unreadable flat wash there.
- **A `@supports not (backdrop-filter)` block raises every glass surface to
  near-opaque.** Where blur is unavailable, the effect is traded for legibility.

`components/AmbientBackground.tsx` paints the field the glass refracts: slow-drifting
teal blooms behind the whole app, frozen under `prefers-reduced-motion` and
grain-dithered to stop the large low-contrast gradients from banding. Without
something behind the glass, `backdrop-filter` produces no visible effect and panels
just read as translucent white.

`components/ui/GlassPanel.tsx` is the floating-overlay surface (graph toolbars,
legend, minimap, detail panels); `Card` remains the in-flow document surface. Both
draw from the same tokens, but only one is allowed to float over a canvas.

`lib/cn.ts` gained `tailwind-merge`. It was previously plain `clsx`, so a `className`
prop *appended* rather than overrode and conflicts resolved by generated-stylesheet
order -- every `<Card className="...">` override was a coin flip. The three glass
utilities are registered as one conflict group so they collapse rather than stack, and
`radius`/`shadow` theme keys are registered so `rounded-glass` and `shadow-glass` are
recognised as the utilities they are.

The brand ramp was also repaired: `brand-400/500/600/800` had all been the identical
`#036e74` while `brand-700` was *lighter* than 600, so `Button`'s
`bg-brand-700 hover:bg-brand-800` darkened on hover only by accident.

## Typed relations

`item_links` now carries a `relation` and a `direction`; see
`docs/architecture/api-reference.md` for the vocabulary, the storage-versus-relation
ordering, and why `PATCH` exists.

On the frontend, `lib/relations.ts` is the single source of truth for how each
relation is *presented* -- label, inverse label, colour and dash pattern -- shared by
the canvas painter, the link picker, the filter panel and the legend. Colours are hex
literals rather than tokens because a 2D canvas context cannot resolve a CSS variable,
and every relation also carries a dash pattern so its type survives without colour,
both for colourblind readers and at zoom levels where a sub-pixel line carries almost
no perceptible hue.

`ItemLinkPicker` shows the current relation as a badge -- including the *inverse*
wording ("Referenced by") when the relation points at the item being viewed -- beside
a select that is a pure action control, since choosing an option always means "make
this item the source".

## Knowledge graph

`components/graph/` replaces what was a single 445-line `GraphViewInner`:

| File | Role |
|---|---|
| `GraphCanvas.tsx` | `ForceGraph2D` plus every canvas painter |
| `GraphToolbar.tsx` | search, zoom, fit, reset, fullscreen |
| `GraphFilterPanel.tsx` | kind / relation / connection filters |
| `GraphLegend.tsx` | documents both colour encodings |
| `GraphMinimap.tsx` | overview plus live viewport rectangle |
| `FocusBreadcrumb.tsx` | focus target and depth control |
| `NodeTooltip.tsx` / `NodeDetailPanel.tsx` | hover and selection surfaces |
| `useGraphModel.ts` | adjacency, degree, radius, curvature, BFS depth |
| `graphTheme.ts` | canvas colours read from CSS custom properties |
| `nodeInfo.ts` | one resolver behind both the tooltip and the panel |

`GraphViewInner` remains the target of `GraphView`'s
`next/dynamic(..., { ssr: false })` import, which must not change --
`react-force-graph-2d` touches `window` at module load and is not SSR-safe.

The page is full-bleed: the canvas fills everything below the `h-14` TopBar and all
chrome floats over it as frosted overlays. It was previously boxed into a fixed 600px
panel inside a `max-w-4xl` column, which is the single biggest reason a graph of any
size felt cramped. `app/spaces/[spaceId]/graph/page.tsx` now owns data fetching and
nothing else; filtering, search and focus live inside the graph module because the
controls that drive them float over the canvas and need the same force-graph handle
it does.

`graphTheme.ts` reads canvas colours from the same CSS custom properties as the rest
of the app. Before it existed, the graph hardcoded its own hex values, and they had
silently drifted out of sync with `globals.css` -- the constants were still annotated
with the names of palette entries whose values had since changed.

### Physics

The graph previously ran on pure d3-force defaults -- charge `-30`, link distance
`30`, and **no collision force registered at all**, which is why nodes overlapped.
Forces are now configured imperatively after mount (force-graph exposes the live d3
forces rather than accepting them as props):

| Force | Setting | Why |
|---|---|---|
| charge | `-180 - min(n, 400) * 0.8`, `distanceMax(600)` | scales with node count so density stays roughly constant; the bound cuts far-field work and stops distant clusters dragging on each other |
| link distance | `60 + 12 * min(deg(s) + deg(t), 12)` | gives hubs room to breathe |
| link strength | `1 / (1 + min(deg(s), deg(t)))` | stops a hub reeling its neighbours into an unreadable rosette |
| collide | `radius + 14`, 2 iterations | hard no-overlap, and the gutter is the headroom labels need to be placeable at all |
| center | removed | it yanks the centroid to the origin, fighting every pan |
| x / y | `forceX(0).strength(0.03)`, `forceY(0).strength(0.04)` | gentle centring, biased wider than tall to match the viewport |

Plus `d3VelocityDecay 0.28`, `cooldownTicks 200`, and `warmupTicks 80` above 150
nodes so large graphs settle before first paint instead of exploding on screen. A
`zoomToFit` on `onEngineStop` means the view arrives framed -- there was no
`zoomToFit` anywhere previously.

Node radius derives from degree (`clamp(4 + 3.2 * sqrt(deg), 4, 16)`), so hubs read
as hubs; every node was previously a flat 5px dot regardless of importance.

### Level of detail

Labels did not exist at all before this pass; a node's identity could only be
discovered by hovering it one at a time. `globalScale` now drives four thresholds:

| Zoom | Behaviour |
|---|---|
| `< 0.6` | no labels; nodes read as plain dots |
| `0.6 – 1.4` | top 12 nodes by degree only |
| `>= 1.4` | every node labelled |
| `>= 1.6` | edge relation names appear without hover |
| `> 0.9` | arrowheads drawn on directed edges |

Anything being engaged with -- hovered, adjacent to the hover, matched by search, or
inside the focused neighbourhood -- keeps its label at any zoom.

Node labels are painted in `onRenderFramePost` rather than inside `nodeCanvasObject`,
for two reasons: this component then controls their paint order (degree-descending,
so when two labels collide the better-connected node keeps its name), and every label
lands above every edge instead of being overdrawn by later-painted links. Placement
is collision-tested against already-placed boxes, which is what keeps a dense graph
from becoming a wall of text.

Edges are quadratic Béziers with a deterministic per-edge bow hashed from the edge id
(so an edge always curves the same way across renders). In a dense region a bundle of
straight segments through the same corridor cannot be traced by eye, whereas gently
bowed edges separate visually even when their endpoints nearly coincide.

Line widths and dash lengths are divided by `globalScale` so they stay constant in
screen pixels; a fixed graph-space width vanishes when zoomed out and turns into a
slab when zoomed in.

### De-emphasis

Two independent systems narrow what is visible, and they compose by taking the lower
alpha:

- **Focus mode** (click a node): 1-hop full, 2-hop 55%, everything else 6%.
- **Hover/selection**: non-adjacent nodes drop to 16%.

While focus is active it *owns* de-emphasis, and only a live hover narrows further.
Without that rule the two fought for the same pixels: clicking sets both selection and
focus, so selection dimming pinned every 2-hop node at 16% and the 1/2/All depth
control changed the breadcrumb count while changing almost nothing on screen.

Escape unwinds one layer at a time -- focus, then selection, then search -- so it
never discards more context than was asked for.

### Motion

Idle drift amplitude decays with node count and switches off entirely on dense graphs,
and the pulse is reserved for the node being engaged with. Constant-amplitude drift
plus an always-on pulse on every node made a large graph shimmer, which was itself a
major part of the cluttered feeling. Edge particles run only on edges touching the
active node, rather than every edge carrying a perpetual travelling dot.

`autoPauseRedraw` was previously inverted. force-graph's gate is
`!autoPauseRedraw || needsRedraw || isEngineRunning()`, so passing
`!prefersReducedMotion` *paused* repainting for every user who had **not** asked for
reduced motion -- silently freezing the drift, pulse and particle animation the file
existed to draw. It is now tied to whether anything is actually animating, so a
settled graph with nothing hovered stops burning frames.

Edges are drawn by hand (`linkCanvasObjectMode="replace"`) rather than via
`linkColor`/`linkWidth`, because force-graph's own link renderer reads the raw,
undrifted endpoint positions -- lines would visibly detach from nodes painted at a
drifted offset.

### Performance

The per-node phase hash was previously recomputed for every node and every link
endpoint on every frame -- three walks of a 36-character UUID per node at 60fps. It,
along with degree, radius, curvature and resolved colour, is now computed once per
graph in `useGraphModel`. The minimap repaints at ~8fps rather than per frame, and
takes the main canvas size as a prop rather than reaching for
`document.querySelector("canvas")`, which would match whichever canvas comes first now
that the minimap renders one of its own.

Two existing patterns are preserved deliberately, and breaking either reintroduces a
solved bug: the `graphData` memo on `[nodes, edges]`, and hover state living in a ref
rather than React state. force-graph re-heats the entire simulation and wipes its
hit-test colour registry whenever it receives node objects it has not seen before --
which a fresh `{ ...node }` copy always is -- so unmemoised data restarted the physics
and reassigned hit-test colours on every mouse-move.

Hit-testing runs on an offscreen canvas force-graph repaints on an internal 800ms
throttle, so `nodePointerAreaPaint` paints the hit area at each node's *undrifted*
base position, inflated to cover the whole drift envelope. Otherwise hover goes stale
between repaints as nodes float away from where the hit map last recorded them.

### Test selector impact

Two committed selectors had to be re-scoped, both because a new element made a
previously unambiguous query ambiguous, and neither changing any assertion's intent:

- `tests/ItemLinkPicker.test.tsx` and `tests/e2e/smoke.spec.ts`: the relation-type
  combobox joined the item combobox, so both are now selected by accessible name.
- `tests/e2e/smoke.spec.ts`: the minimap adds a second `<canvas>`, so
  `locator("canvas")` is scoped to `.first()`.
