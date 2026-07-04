import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Navigate, useParams } from "react-router-dom";
import { App } from "./App";
import { ApplicationsView } from "./components/ApplicationsView";
import { ApplicationDetail } from "./components/ApplicationDetail";
import { LibraryView } from "./components/LibraryView";
import "./styles/app.css";

// Settings gets its own view in E1-F3; a stub keeps the route real until then.
function SettingsView() {
  return <p className="text-sm text-muted-foreground">Settings coming soon.</p>;
}

// Reads :id off the route so ApplicationDetail (spec.md §27) stays a plain
// component taking a prop rather than reaching into the router itself.
function ApplicationDetailRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) throw new Error("ApplicationDetailRoute rendered without an :id param");
  return <ApplicationDetail applicationId={id} />;
}

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/applications" replace /> },
      { path: "applications", element: <ApplicationsView /> },
      { path: "applications/:id", element: <ApplicationDetailRoute /> },
      { path: "library", element: <LibraryView /> },
      { path: "settings", element: <SettingsView /> },
      // Unknown paths land on a known destination (§26) — never a blank/404
      // page or a bespoke fallback component.
      { path: "*", element: <Navigate to="/applications" replace /> },
    ],
  },
]);

const root = document.getElementById("root");
if (!root) throw new Error("root element not found");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
