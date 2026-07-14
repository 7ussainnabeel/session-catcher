/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: "#09090b",
        darkCard: "rgba(24, 24, 27, 0.45)",
        darkBorder: "rgba(63, 63, 70, 0.3)",
        glassText: "#e4e4e7",
        accentBlue: "#3b82f6",
        accentGreen: "#10b981",
        accentRed: "#ef4444",
        accentYellow: "#f59e0b"
      },
      backdropBlur: {
        glass: "12px"
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37)"
      }
    },
  },
  plugins: [],
}
