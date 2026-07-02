// App-wide chrome: header nav + content slot — spec.md §13. Router-agnostic
// (takes children) so it composes under whatever the route tree renders.

import type { ReactNode } from "react";
import { NavTabs } from "./NavTabs";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-3">
        <NavTabs />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-6">{children}</main>
    </div>
  );
}
