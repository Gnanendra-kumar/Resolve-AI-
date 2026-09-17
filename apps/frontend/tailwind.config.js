/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        bg: {
          primary: "#080b14",
          secondary: "#0e1320",
          card: "#111827",
        },
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        glow: "glow 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
