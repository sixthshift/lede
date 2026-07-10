import { Outlet, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LoginGate } from "./components/LoginGate";
import { SettingsView } from "./components/SettingsView";

// The router (main.tsx) still owns path->element wiring for /applications
// and /library, but /settings' real view lives here (E2-E) rather than in
// the E1-F1 stub route, so it's swapped in ahead of the Outlet for that path.
//
// v3-T011: the single application detail route (/applications/:id, NOT its
// /design child — that route stays in AppShell's normal centered column
// until a later ticket) renders full-bleed so its WorkspaceShell gets a real
// fixed-height frame to fill. Every other route is unaffected.
export function App() {
  const location = useLocation();
  const onSettings = location.pathname.startsWith("/settings");
  const isWorkspaceRoute = /^\/applications\/[^/]+$/.test(location.pathname);

  return (
    <LoginGate>
      <AppShell fullBleed={isWorkspaceRoute}>{onSettings ? <SettingsView /> : <Outlet />}</AppShell>
    </LoginGate>
  );
}
