import { NavIcon } from "@/components/icons/NavIcon";

/**
 * Shared bottom tab bar. The site bar (MobileBottomNav) and the open-trip
 * section bar (ItineraryHub) both render from these classes, so the glass
 * capsule, the 44px tabs, the 20px icons, the 12px labels, and the dark
 * selected pill (icon + label) stay identical. Styles live in globals.css
 * under "Bottom tab bar (shared)". See docs/design-system.md.
 *
 * Container: `TAB_BAR_CLASS` (plus the bar's own positioning class).
 * Each tab: `TAB_BAR_ITEM_CLASS`, marked selected with
 * `aria-current="page"` (links) or `aria-selected` (role="tab").
 */
export const TAB_BAR_CLASS = "app-tab-bar";
export const TAB_BAR_ITEM_CLASS = "app-tab-bar-item";

/** Icon over label, as used inside every tab. */
export function BottomTabItemBody({ icon, label }: { icon: string; label: string }) {
  return (
    <>
      <NavIcon name={icon} size={20} className="shrink-0" />
      <span className="app-tab-bar-label">{label}</span>
    </>
  );
}
