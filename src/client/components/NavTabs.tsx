// Primary navigation — spec.md §13. Path-based, so links (not Radix Tabs,
// which is state-controlled) mirror the router's own notion of "active".
//
// F201/T021: each destination gets an icon (lucide-react, 16px, consistent
// stroke) alongside its label — the global-nav zone is the rail's one
// always-designed moment. The hover fill reads `--ring-weak` (the same
// accent-at-25%-alpha token the focus ring already uses) rather than
// `--muted`/`--bg-subtle` — that token IS the original defect (`#fafafa` on
// a white rail, imperceptible); `--ring-weak` is a tinted accent wash that
// reads as a distinct state from both resting (transparent) and active
// (solid `--accent-bg`).
//
// F207/T022: in the rail's collapsed (icon-only) band, the visible label
// disappears but the destination must stay identifiable and operable —
// `aria-label` carries the accessible name (the SAME name the expanded
// rail's `getByRole("link", { name })` queries already key off, so nothing
// downstream needs a second lookup) and a tooltip surfaces the label on
// hover/focus. Tooltip machinery only mounts when actually collapsed, so
// the expanded (default) tree stays exactly what it was before this ticket.
import { Files, BookOpen, Settings2 } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";
import { useRailCollapsed, useRailLabelFade } from "./WorkspaceShell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

const TABS = [
  { to: "/applications", label: "Applications", icon: Files },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

// react-router's own default (non-`end`) NavLink active rule, computed
// ourselves rather than delegating to NavLink's `className` FUNCTION form —
// see the render-path note below for WHY the function form can't survive
// here. A destination is active for its exact path AND any deeper segment
// under it (so "Applications" stays active on /applications/:id), matched on
// segment boundaries so /app never lights up /applications.
function isTabActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

// v5-T004: ONE render path for both rail states (no more `if (!collapsed)
// return …; return …` two-branch split) — each branch used to be a
// DIFFERENT top-level element type wrapping the link (bare vs.
// Tooltip>Trigger>), so React unmounted+remounted every `<NavLink>`'s DOM
// node on every collapse toggle. A label that gets torn down and recreated
// has no prior painted frame to fade FROM, so it could only ever hard
// pop — the opacity transition below needs the same `<a>` to persist across
// the toggle. Tooltip/Trigger/Content now wrap every tab unconditionally
// (Trigger's `asChild` still adds no DOM node of its own), at the cost of a
// tooltip also being technically reachable on a sustained expanded-rail
// hover — harmless (it only echoes the already-visible label) and a smaller
// footprint than reintroducing the remount.
//
// v5-T004 (fix): NavLink's `className` MUST be a STRING here, never the
// `({ isActive }) => …` FUNCTION form. Because the NavLink is now a
// `<TooltipTrigger asChild>` child, Radix's Slot merges the child's
// `className` by string-joining it — a function className gets stringified
// to its own SOURCE TEXT ("({isActive})=>cn(...)"), so `bg-accent` never
// applied and the active tab lost its highlight (rail-design.spec.ts
// v5-T002 caught this; it was silently broken for the collapsed active tab
// since T001's own asChild path). We compute `isActive` ourselves (above)
// and hand NavLink a plain string. NavLink still sets `aria-current` off its
// OWN internal match, independent of className, so that stays correct.
export function NavTabs() {
  const collapsed = useRailCollapsed();
  const { faded, hidden } = useRailLabelFade(collapsed);
  const { pathname } = useLocation();

  return (
    <div
      data-testid="rail-nav-section"
      className={cn("shrink-0 border-b border-border", collapsed ? "p-1.5" : "p-2")}
    >
      <TooltipProvider delayDuration={200}>
        <nav
          className={cn("flex flex-col gap-1", collapsed && "items-center")}
          aria-label="Primary"
        >
          {TABS.map((tab) => {
            const active = isTabActive(pathname, tab.to);
            return (
              <Tooltip key={tab.to}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={tab.to}
                    aria-label={collapsed ? tab.label : undefined}
                    className={cn(
                      "flex items-center gap-2.5 whitespace-nowrap rounded-md py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      collapsed ? "w-9 justify-center px-0" : "w-full px-3",
                      active
                        ? "bg-accent font-medium text-primary"
                        : "font-normal text-muted-foreground hover:bg-[var(--ring-weak)] hover:text-foreground",
                    )}
                  >
                    <tab.icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2} />
                    {hidden ? null : (
                      <span
                        className={cn(
                          "transition-opacity duration-200 ease-in-out motion-reduce:transition-none",
                          faded ? "opacity-0" : "opacity-100",
                        )}
                      >
                        {tab.label}
                      </span>
                    )}
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">{tab.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </TooltipProvider>
    </div>
  );
}

// F301/T030: the rail's below-`lg` replacement — the SAME three destinations
// as the rail's own global nav (reused from `TABS` above, not a second nav
// model), laid out as a fixed bottom bar instead of a vertical list. Persistent
// chrome, not modality: always mounted, no scrim, no `aria-modal`, blocks no
// content. `heightClassName` is threaded from WorkspaceShell rather than
// hardcoded here — it's also the exact value the content panes' bottom-
// padding must match, and WorkspaceShell owns that pairing.
export function BottomTabBar({ heightClassName }: { heightClassName: string }) {
  return (
    <nav
      data-testid="bottom-tab-bar"
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 flex shrink-0 border-t border-border bg-surface",
        heightClassName,
      )}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              isActive ? "font-medium text-primary" : "font-normal text-muted-foreground",
            )
          }
        >
          <tab.icon aria-hidden className="h-5 w-5" strokeWidth={2} />
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
