import type { Config } from "tailwindcss";

// Every colour is a CSS variable (RGB triplet) defined in app/globals.css, so light / dark / system
// themes swap by changing one attribute on <html>. See DESIGN_SYSTEM.md.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), card: v("card"), line: v("border"), ink: v("text"), muted: v("muted"),
        sidebar: { DEFAULT: v("sidebar"), 2: v("sidebar-2"), text: v("sidebar-text"), muted: v("sidebar-muted") },
        primary: { DEFAULT: v("primary"), hover: v("primary-hover"), soft: v("primary-soft"), text: v("primary-text") },
        success: { DEFAULT: v("success"), text: v("success-text"), soft: v("success-soft") },
        warning: { DEFAULT: v("warning"), text: v("warning-text"), soft: v("warning-soft") },
        danger: { DEFAULT: v("danger"), text: v("danger-text"), soft: v("danger-soft"), solid: v("danger-solid") },
      },
      fontFamily: { sans: ['"Inter Variable"', "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"], mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"] },
      borderRadius: { md: "10px", lg: "12px", xl: "14px", "2xl": "16px" },
      boxShadow: { card: "0 1px 2px rgb(var(--shadow) / .05), 0 1px 3px rgb(var(--shadow) / .04)", pop: "0 12px 32px -8px rgb(var(--shadow) / .18), 0 4px 12px rgb(var(--shadow) / .08)" },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        ripple: { "0%": { transform: "scale(.85)", opacity: ".5" }, "100%": { transform: "scale(1.5)", opacity: "0" } },
        bar: { "0%,100%": { transform: "scaleY(.25)" }, "50%": { transform: "scaleY(1)" } },
        spin360: { to: { transform: "rotate(360deg)" } },
      },
      animation: { rise: "rise .22s ease-out both", ripple: "ripple 1.8s ease-out infinite", bar: "bar 1s ease-in-out infinite", spin360: "spin360 1.2s linear infinite" },
    },
  },
  plugins: [],
};
export default config;
