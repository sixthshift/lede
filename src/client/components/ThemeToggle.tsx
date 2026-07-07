// Light/dark toggle for the app chrome. The class it flips (`dark` on <html>)
// is first set pre-paint by the inline script in index.html; this only lets the
// user override that and persists the choice. State seeds from the live class so
// the icon matches whatever the script already applied.

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "./ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
