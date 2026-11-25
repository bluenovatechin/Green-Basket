/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#00663A", // logo green
          dark: "#004D2C",
          light: "#EAF3EC",
          50: "#F3F8F4",
          100: "#E3EFE6",
          accent: "#F2C200",
        },
        ink: { DEFAULT: "#17211B", soft: "#3E4A43", muted: "#7A857E" },
        surface: "#F6F5F0",
        line: "#E8E6DF",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "Inter", "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(23,33,27,0.04), 0 8px 24px -12px rgba(23,33,27,0.12)",
        lift: "0 2px 4px rgba(23,33,27,0.04), 0 16px 40px -16px rgba(23,33,27,0.22)",
      },
      borderRadius: { "4xl": "2rem" },
    },
  },
  plugins: [],
};
