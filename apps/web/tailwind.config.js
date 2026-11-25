/** @type {import('tailwindcss').Config} */
// Green Basket design tokens.
// Palette: deep market green, warm paper cream, near-black ink, terracotta for offers. Every text pairing used
// in the UI is checked against WCAG 2.1 AA (4.5:1): ink 15.3, ink-soft 9.2, ink-muted 5.6, brand 7.4 on the cream.
// Geometry: soft but defined radii (8px controls, 12-16px cards), never pill-shaped. Fully round shapes are kept only for true circles (avatars, dots, switches).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0D5C3A",
          dark: "#09432A",
          light: "#E6EFE8",
          50: "#F2F7F3",
          100: "#DCE9DF",
          accent: "#A63D1C", // terracotta: offers, counts
        },
        ink: { DEFAULT: "#17201B", soft: "#3A453E", muted: "#5A655E" },
        surface: "#F7F5EF",
        paper: "#FFFFFF",
        line: "#E4E0D5",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Jakarta Fallback"', "system-ui", "Segoe UI", "Roboto", '"Noto Sans Gujarati"', "Arial", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(23,32,27,0.04), 0 6px 20px -10px rgba(23,32,27,0.14)",
        lift: "0 1px 2px rgba(23,32,27,0.06), 0 12px 32px -12px rgba(23,32,27,0.24)",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
        xl: "14px",
        "2xl": "16px",
        "3xl": "18px",
        "4xl": "20px",
      },
      maxWidth: { page: "76rem" },
    },
  },
  plugins: [],
};
