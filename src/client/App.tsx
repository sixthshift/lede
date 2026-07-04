import { Outlet, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LoginGate } from "./components/LoginGate";
import { SettingsView } from "./components/SettingsView";

// The router (main.tsx) still owns path->element wiring for /applications
// and /library, but /settings' real view lives here (E2-E) rather than in
// the E1-F1 stub route, so it's swapped in ahead of the Outlet for that path.
export function App() {
  const location = useLocation();
  const onSettings = location.pathname.startsWith("/settings");

  return (
    <LoginGate>
      <AppShell>{onSettings ? <SettingsView /> : <Outlet />}</AppShell>
    </LoginGate>
  );
}
