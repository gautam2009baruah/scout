import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      boxShadow: {
        "soft-xl": "0 22px 70px -26px rgb(15 23 42 / 0.42)",
        "chat-panel": "0 24px 70px -32px rgb(10 14 29 / 0.5)"
      },
      keyframes: {
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" }
        },
        blink: {
          "0%, 80%, 100%": { opacity: "0.28", transform: "translateY(0)" },
          "40%": { opacity: "1", transform: "translateY(-2px)" }
        }
      },
      animation: {
        "slide-up": "slide-up 240ms ease-out both",
        blink: "blink 1.2s infinite ease-in-out"
      }
    }
  },
  plugins: []
};

export default config;
