import type { Config } from "tailwindcss";

// Design tokens mirror the Stitch "SML Modern Retro Social Network" design system:
// institutional navy + periwinkle panels, coral accent, Libre Franklin, dense
// type scale, 960px fixed grid. Tokens are additive (extend) so existing utility
// classes keep working during the screen-by-screen reskin.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Stitch design-system palette
        primary: "#21417f",
        "primary-container": "#3b5998",
        "on-primary": "#ffffff",
        "on-primary-container": "#c2d2ff",
        secondary: "#475e8c",
        "secondary-container": "#b2c9fd",
        "secondary-fixed": "#d8e2ff",
        "secondary-fixed-dim": "#afc7fa",
        "on-secondary": "#ffffff",
        "on-secondary-fixed": "#001a41",
        "on-secondary-container": "#3d5481",
        tertiary: "#890631",
        "tertiary-container": "#aa2647",
        coral: "#e0506d",
        periwinkle: "#6d84b4",
        surface: "#f8f9ff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#eef4ff",
        "surface-container": "#e6eefd",
        "surface-container-high": "#e1e9f7",
        "surface-container-highest": "#dbe3f1",
        "surface-variant": "#dbe3f1",
        "on-background": "#141c26",
        "on-surface": "#141c26",
        "on-surface-variant": "#444650",
        outline: "#747781",
        "outline-variant": "#c4c6d2",
        error: "#ba1a1a",
        "on-error": "#ffffff",
        "error-container": "#ffdad6",
      },
      fontFamily: {
        sans: ["var(--font-libre-franklin)", "Libre Franklin", "sans-serif"],
      },
      fontSize: {
        caption: ["10px", { lineHeight: "14px", fontWeight: "400" }],
        "body-sm": ["11px", { lineHeight: "14px", fontWeight: "400" }],
        "body-base": ["13px", { lineHeight: "18px", fontWeight: "400" }],
        "title-lg": ["20px", { lineHeight: "26px", fontWeight: "700" }],
        "label-bold": ["12px", { lineHeight: "14px", fontWeight: "700" }],
        "section-header": ["12px", { lineHeight: "16px", fontWeight: "700" }],
        "action-link": [
          "11px",
          { lineHeight: "14px", letterSpacing: "0.02em", fontWeight: "400" },
        ],
        "masthead-logo": [
          "20px",
          { lineHeight: "24px", letterSpacing: "0.1em", fontWeight: "700" },
        ],
      },
      spacing: {
        gutter: "16px",
        "panel-padding": "12px",
        "stack-sm": "4px",
        "stack-md": "8px",
        "stack-lg": "16px",
      },
      maxWidth: {
        "container-max": "960px",
      },
    },
  },
  plugins: [],
};
export default config;
