# Frontend redesign: UST-inspired design system

This documents the frontend-only redesign that introduced Mnemo's first shared
design-token/component layer (previously every page/component hand-wrote Tailwind
utility classes with no shared primitives) and restructured navigation from a single
top header row into a persistent sidebar + top bar, modeled on the structural pattern
of an internal UST Square reference screenshot. No backend, API, route param, or
`lib/api-client.ts`/`lib/types.ts` change was made -- every page's data-fetching
logic, loading/empty/error conditionals, and button disabled/label-swap behavior are
unchanged from before the redesign; only the JSX/styling inside each branch changed.

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
redesign. `lib/cn.ts` wraps `clsx` for conditional className joining; there is no
`tailwind-merge`/`cva` in this project, so any component accepting a `className`
override must not also hardcode a *conflicting* utility of the same CSS property
internally (Tailwind utility precedence is by generated-stylesheet order, not by
position in a `className` string) -- see `UstMark`, which takes color entirely from
the caller rather than baking in a default that a caller's `className` might lose to.

## Navigation shell

`components/layout/TopBar.tsx` (slim dark-teal bar: Mnemo wordmark, user name, log
out, a small secondary UST co-brand mark) replaces the old inline `Header()` that
used to live directly in `app/spaces/layout.tsx`. `components/layout/Sidebar.tsx`
(space-scoped nav: Overview/Search/Graph/Conversations/Memory, active-state via
`usePathname()`, hosts the `SpaceSwitcher`) is mounted by a new
`app/spaces/[spaceId]/layout.tsx` that wraps only the space-scoped routes -- the
plain `/spaces` list page keeps `TopBar` only, matching its pre-redesign nav-less
structure. Neither the Mnemo nor UST mark has a real brand-asset file anywhere in
this repo (`apps/web/public/` is empty); both are small inline SVG/text components
built in code (`components/MnemoLogo.tsx`, `components/UstMark.tsx`).

Below Tailwind's `md` breakpoint the sidebar becomes an off-canvas panel (a
`translate-x` transform + backdrop, toggled by a `Menu` button `[spaceId]/layout.tsx`
renders inline) rather than squeezing page content into a few hundred pixels --
there was no existing responsive-nav pattern in this app to build on, since the old
single-row header never had this problem.

One pre-existing e2e assertion had to be updated because of the new persistent
sidebar: `tests/e2e/smoke.spec.ts` used an unscoped `page.getByRole("combobox")` to
find `ItemLinkPicker`'s "link to..." select on the item detail page, which was
unambiguous before the sidebar existed. Since `SpaceSwitcher`'s combobox now renders
on every space-scoped page (not just the space overview page), that selector became
ambiguous and was scoped to `page.getByRole("main").getByRole("combobox")`. No test
assertion's *intent* changed, only its scope.

## Knowledge graph: idle motion and hover highlighting

`components/GraphViewInner.tsx` still passes `graphData` straight through to
`react-force-graph-2d`'s default d3-force simulation -- nothing about the physics
engine itself is tuned (no `d3Force`/`d3AlphaMin`/`d3AlphaDecay` overrides existed
before this redesign, and none were added).

**Idle motion** is implemented at the *rendering* layer, not the physics layer:
`autoPauseRedraw={false}` keeps force-graph's own internal animation loop repainting
the canvas every frame even after the simulation has cooled down (by default it stops
repainting once the engine goes idle -- `force-graph`'s `doRedraw` gate is literally
`!autoPauseRedraw || needsRedraw || isEngineRunning() || ...`). A custom
`nodeCanvasObject` then draws each node offset by a small per-node-phase sine wave
(`~1.6px` amplitude, `~20s` period) computed from `performance.now()`, without ever
writing to the node's real `x`/`y`. This means the drift can never destabilize the
layout or let nodes wander apart over time -- worst case, disabling it is a one-line
revert of the `nodeCanvasObject` offset math, with zero coupling to simulation
tuning.

**Hover highlighting** reads a `useRef<string | null>` (not React state) updated by
the existing-but-previously-unused `onNodeHover` prop. Because `nodeCanvasObject`/
`linkColor`/`linkWidth` are plain closures force-graph already calls every frame
(via the `autoPauseRedraw={false}` loop above), they pick up the current hovered id
with no `setState` and therefore no re-render -- routing hover through React state
would have forced `graphData` (a fresh `{ nodes: nodes.map(n => ({...n})), ... }`
object literal, unchanged from before this redesign) to be reassigned on every
mouse-move, which is far more churn than a hover interaction warrants. A `Map<node
id, Set<neighbor id>>` adjacency table, built once per `edges` change (not per
hover), gives O(1) neighbor lookups for dimming non-connected nodes/links.

**Click-through** (`onNodeClick` navigating to the item detail page) is unchanged
from before this redesign.
