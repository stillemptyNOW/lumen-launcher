/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mc: {
          bg: "#1E1E1F",
          panel: "#26272B",
          panel2: "#313233",
          line: "#3E3E42",
          muted: "#A0A0A0",
          green: "#3C8527",
          greenH: "#4C9A2A",
          greenD: "#2D6A1F",
          gray: "#4A4A4D",
          grayH: "#5A5A5E",
        },
      },
      fontFamily: {
        ui: ["Inter", "Noto Sans", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
