import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { App } from "./App";
import { TailorView } from "./components/TailorView";
import { LibraryView } from "./components/LibraryView";
import "./styles/app.css";

// Settings gets its own view in E1-F3; a stub keeps the route real until then.
function SettingsView() {
  return <p className="text-sm text-muted-foreground">Settings coming soon.</p>;
}

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/tailor" replace /> },
      { path: "tailor", element: <TailorView /> },
      { path: "library", element: <LibraryView /> },
      { path: "settings", element: <SettingsView /> },
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
