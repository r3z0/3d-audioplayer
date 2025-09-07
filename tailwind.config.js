import forms from "@tailwindcss/forms";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "deep-bg": "#05122f",
        "deep-bg2": "#06122c",
        "deep-panel": "#0d1321bf",
        "deep-text": "#e8f0ff",
        "deep-muted": "#9fb7d9",
        "deep-accent": "#8fb3ff",
        "dark-bg": "#0a0a0a",
        "dark-bg2": "#141414",
        "dark-panel": "#141414c7",
        "dark-text": "#f2f2f2",
        "dark-muted": "#b8b8b8",
        "dark-accent": "#9cc0ff",
      },
    },
  },
  plugins: [forms],
};
