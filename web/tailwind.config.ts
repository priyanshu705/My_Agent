import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#04060d", 900: "#070b16", 800: "#0b1220", 700: "#111a2e", 600: "#18233b" },
        accent: "rgb(var(--accent) / <alpha-value>)",
        accent2: "rgb(var(--accent2) / <alpha-value>)",
      },
      fontFamily: { sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"], mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"] },
      keyframes: {
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        pulseRing: { "0%": { transform: "scale(.9)", opacity: ".6" }, "100%": { transform: "scale(1.6)", opacity: "0" } },
        aurora: { "0%,100%": { transform: "translate3d(0,0,0) scale(1)" }, "50%": { transform: "translate3d(4%,-3%,0) scale(1.12)" } },
      },
      animation: { floaty: "floaty 6s ease-in-out infinite", shimmer: "shimmer 2.4s linear infinite", pulseRing: "pulseRing 1.8s ease-out infinite", aurora: "aurora 18s ease-in-out infinite" },
    },
  },
  plugins: [],
};
export default config;
