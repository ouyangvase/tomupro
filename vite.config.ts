import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-slot', '@radix-ui/react-tabs', '@radix-ui/react-toast', '@radix-ui/react-tooltip', '@radix-ui/react-select', '@radix-ui/react-switch', '@radix-ui/react-label', '@radix-ui/react-popover', '@radix-ui/react-dropdown-menu', 'class-variance-authority', 'clsx', 'tailwind-merge', 'lucide-react'],
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
}));
