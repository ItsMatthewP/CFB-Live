import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],   // <-- ensure paths point at your src files
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
