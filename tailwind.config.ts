import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Design tokens live in src/client/styles/tokens.css (§12). This config only
// wires Tailwind's utility names to those CSS variables — it does not define
// values of its own.
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--accent)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent-bg)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        success: "var(--success)",
        warn: "var(--warn)",
      },
      borderRadius: {
        lg: "calc(var(--radius) + 2px)",
        md: "var(--radius)",
        sm: "calc(var(--radius) - 2px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        serif: ["var(--font-serif)", "ui-serif", "serif"],
      },
      fontSize: {
        xs: ".75rem",
        sm: ".8125rem",
        base: ".875rem",
        md: "1rem",
        lg: "1.125rem",
        xl: "1.375rem",
        "2xl": "1.75rem",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
