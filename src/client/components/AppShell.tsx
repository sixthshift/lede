// App-wide chrome: header (wordmark + session controls) and content slot —
// spec.md §13. Renders under the router (Link needs its context).
//
// v3-T050: every content route is now a WorkspaceShell surface (the
// dashboard joined Library/Settings/the detail view), so the fixed-height,
// full-bleed frame is the only frame — there's no remaining route that wants
// AppShell's old centered/scrolling-column mode, so that branch is gone.
// Global nav (NavTabs) moved out of the header and into the persistent
// rail (App.tsx) — the header keeps only the wordmark, theme toggle, and
// logout. The header spans full width (no more `mx-auto max-w-5xl` reading
// column) to match the shell filling the rest of the viewport below it.
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuthLogout } from "../hooks/queries";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const logout = useAuthLogout();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="z-40 shrink-0 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center gap-8 px-6">
          <Link
            to="/applications"
            className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden
              className="flex h-6 w-6 items-center justify-center rounded-md bg-primary pb-0.5 font-serif text-md font-medium leading-none text-primary-foreground"
            >
              L
            </span>
            <span className="font-serif text-md font-medium tracking-tight">Lede</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => logout.mutate()}
            >
              <LogOut aria-hidden />
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
