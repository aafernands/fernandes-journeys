# Design system

Phase 2 tokens and the small set of shared controls. Fonts stay Outfit (titles) and Inter (everything else). Colors stay the existing `:root` palette. No new typefaces or hex values.

Compact density is for app screens (Plan a Trip first). Comfortable density is the default for reading pages. Set `data-density="compact"` or `data-density="comfortable"` on a section. Cards and rows read `--density-pad` from that ancestor.

## Tokens

Defined on `:root` in `src/app/globals.css` and mirrored into the Tailwind theme where a utility is useful (`text-ds-title`, `rounded-card`, `border-line`, `bg-canvas`).

| Token | Value | Use |
| --- | --- | --- |
| `--space-1` | 4px | Icon to label |
| `--space-2` | 8px | Gap between rows; title to gray line |
| `--space-3` | 12px | Compact card padding and page inset |
| `--space-4` | 16px | Comfortable card padding and page inset |
| `--space-6` | 24px | Between major blocks |
| `--type-title-*` | 20px / 700 / 1.25 | One screen title. Outfit |
| `--type-body-*` | 16px / 400 / 1.5 | Row primary line, inputs |
| `--type-reading-*` | 17px / 400 / 1.65 | Journal and guide prose |
| `--type-secondary-*` | 14px / 400 / 1.4 | Gray line, button label, empty state |
| `--type-caption-*` | 12px / 500 / 1.35 | Meta, tabs, eyebrows |
| `--control-height` | 44px | Buttons, inputs, icon buttons |
| `--chip-height` / `--chip-hit` | 36px / 44px | Chips |
| `--row-height` | 48px | Row with a gray line (44px with no gray line) |
| `--tab-bar-height` | 56px | Bottom tab bar: 44px tabs + 5px inset each side + 1px border |
| `--tab-bar-inset` | 5px | Capsule padding around the tabs (selected pill never touches the edge) |
| `--tab-bar-edge` / `--tab-bar-float` | 14px / 12px | Gap from the bar to the screen sides / above the home indicator (plus safe areas) |
| `--tab-bar-item-radius` | 0.7rem (11.2px) | Selected tab pill |
| `--header-bar` | 48px | Mobile header content |
| `--radius-control` | 8px | Buttons, inputs, icon buttons |
| `--radius-card` | 12px | Cards, dialogs, menus |
| `--radius-pill` | 999px | Chips and tab-bar shells |
| `--hairline` | 1px solid `var(--border)` | The only content border |
| `--shadow-content` | none | Cards and rows are flat |

Glass shadow stays on floating chrome only (header, drawer, tab bar, menus).

`border-line` maps to `--border`. `bg-canvas` maps to `--surface-soft`.

Accent (`--accent`) is the primary button fill and the focus ring. Selected tabs and chips use `--ink`. Hover for the primary button is `--accent-deep`.

## Components

All live in `src/components/ui/`. They render the classes below; do not restyle them per screen.

### Button

`variant`: `primary` | `secondary` | `ghost`. `size`: `md` (default) | `icon`.

Primary is accent fill with on-solid label. Secondary is a white fill, hairline, heading label. Ghost is heading text with no border. One primary per screen.

### Input / Field

`Field` wraps a label, a control, and an optional error. `Input`, `TextArea`, and `Select` are 44px (text areas grow), 16px text, 8px radius.

### Chip

36px pill, 44px hit area. Pass `selected` for the ink fill. Do not color a selected chip with the accent.

### Card

12px radius, hairline, no shadow. Padding follows the parent density (12px compact, 16px comfortable) unless `density` is set.

### ListRow

`leading`, `title`, optional `detail`, optional `trailing`. Pass `href` or `onClick` for the main target; leading and trailing stay separate controls (a checkbox, a menu). A row with `detail` is 48px. Without it, 44px.

### SectionHeader

`title`, optional `subtitle`, optional `action`. Title is 20px Outfit. Subtitle is 14px muted. `as` is `h2` or `h3`.

### EmptyState

14px sentence, 12px padding, optional single action.

### BottomTabBar

`src/components/ui/BottomTabBar.tsx` plus the "Bottom tab bar (shared)" block in `globals.css`. It's the only source for the phone bottom bars: the site bar (`MobileBottomNav`: Places, Stories, Plan trip, Saved) and the open-trip section bar (`ItineraryHub`: Overview, Itinerary, Bookings, Packing).

- **Container:** `app-tab-bar` is the frosted capsule.
  - Fill: `--glass-fill` (warm cream `rgb(246 240 230 / 0.66)`).
  - Border: 1px `--glass-edge`.
  - Shadow: `--glass-shadow` + `--glass-sheen`.
  - Blur: `blur(18px) saturate(1.4)`, with the `-webkit-` prefix.
  - Shape: pill radius, `--tab-bar-inset` padding, height `--tab-bar-height`.
  - Fallback: solid `--glass-fallback` when blur is unavailable or reduced transparency is on.
- **Tab:** `app-tab-bar-item`, rendered with `BottomTabItemBody` (a 20px icon over a 12px / 500 Inter label).
  - Height 44px.
  - Inactive color is `--muted`; hover is `--heading`.
- **Selected state:** `aria-current="page"` on links or `aria-selected="true"` on `role="tab"` buttons. It fills the whole tab (icon and label) with `--ink` and `--on-solid` text in a 0.7rem pill.
- **Positioning:** each bar keeps its own `position: fixed` rule, but both read `--tab-bar-edge` and `--tab-bar-float` and add `env(safe-area-inset-*)`.
- **Tight fit:** labels truncate and drop to 11px under 360px wide. Don't make the bar taller.
- **iPad and desktop:** the trip section tabs sit in the page, as a solid white row with 18px icons and 0.9rem labels.

### Skeleton

Warm placeholder block for content that is still loading (`--border` fill, control radius). Size it with utilities (`h-4 w-1/2`, `book-room-photo`, `rounded-full`). It pulses gently; under `prefers-reduced-motion` it sits still. Skeletons are `aria-hidden`: pair a group with one short `role="status"` line such as "Finding rooms…". Match the real layout (row, card, photo) so nothing jumps when content arrives. Where a layout would be guesswork, use the status line alone.

Stays uses it in `src/components/stays/StaySkeletons.tsx` for the hotel results list and the room cards (via `loading.tsx` on `/stays` and `/stays/[hotelId]`).

## Density

```html
<section data-density="compact">...</section>
```

Plan a Trip sets this on its root. Reading pages leave it off and keep the 17px body size.
