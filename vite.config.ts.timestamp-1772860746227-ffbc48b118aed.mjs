// vite.config.ts
import { defineConfig } from "file:///Users/isaiah/Desktop/ledgerlite%20copy/node_modules/vite/dist/node/index.js";
import react from "file:///Users/isaiah/Desktop/ledgerlite%20copy/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///Users/isaiah/Desktop/ledgerlite%20copy/node_modules/vite-plugin-pwa/dist/index.js";
var vite_config_default = defineConfig({
  base: "/ledgerlite-copy/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.png"],
      manifest: {
        name: "iisauhwallet",
        short_name: "iisauh",
        start_url: ".",
        display: "standalone",
        background_color: "#0b0b0f",
        theme_color: "#0b0b0f",
        icons: [{ src: "./icon.png", sizes: "512x512", type: "image/png" }]
      },
      workbox: {
        // Avoid flaky SW minification (terser) during build.
        mode: "development",
        navigateFallback: "/ledgerlite-copy/index.html"
      }
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvaXNhaWFoL0Rlc2t0b3AvbGVkZ2VybGl0ZSBjb3B5XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvaXNhaWFoL0Rlc2t0b3AvbGVkZ2VybGl0ZSBjb3B5L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9pc2FpYWgvRGVza3RvcC9sZWRnZXJsaXRlJTIwY29weS92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBiYXNlOiAnL2xlZGdlcmxpdGUtY29weS8nLFxuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICBWaXRlUFdBKHtcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxuICAgICAgaW5jbHVkZUFzc2V0czogWydpY29uLnBuZyddLFxuICAgICAgbWFuaWZlc3Q6IHtcbiAgICAgICAgbmFtZTogJ2lpc2F1aHdhbGxldCcsXG4gICAgICAgIHNob3J0X25hbWU6ICdpaXNhdWgnLFxuICAgICAgICBzdGFydF91cmw6ICcuJyxcbiAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnIzBiMGIwZicsXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnIzBiMGIwZicsXG4gICAgICAgIGljb25zOiBbeyBzcmM6ICcuL2ljb24ucG5nJywgc2l6ZXM6ICc1MTJ4NTEyJywgdHlwZTogJ2ltYWdlL3BuZycgfV1cbiAgICAgIH0sXG4gICAgICB3b3JrYm94OiB7XG4gICAgICAgIC8vIEF2b2lkIGZsYWt5IFNXIG1pbmlmaWNhdGlvbiAodGVyc2VyKSBkdXJpbmcgYnVpbGQuXG4gICAgICAgIG1vZGU6ICdkZXZlbG9wbWVudCcsXG4gICAgICAgIG5hdmlnYXRlRmFsbGJhY2s6ICcvbGVkZ2VybGl0ZS1jb3B5L2luZGV4Lmh0bWwnXG4gICAgICB9XG4gICAgfSlcbiAgXVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQW1TLFNBQVMsb0JBQW9CO0FBQ2hVLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFFeEIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsTUFBTTtBQUFBLEVBQ04sU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sUUFBUTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QsZUFBZSxDQUFDLFVBQVU7QUFBQSxNQUMxQixVQUFVO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixXQUFXO0FBQUEsUUFDWCxTQUFTO0FBQUEsUUFDVCxrQkFBa0I7QUFBQSxRQUNsQixhQUFhO0FBQUEsUUFDYixPQUFPLENBQUMsRUFBRSxLQUFLLGNBQWMsT0FBTyxXQUFXLE1BQU0sWUFBWSxDQUFDO0FBQUEsTUFDcEU7QUFBQSxNQUNBLFNBQVM7QUFBQTtBQUFBLFFBRVAsTUFBTTtBQUFBLFFBQ04sa0JBQWtCO0FBQUEsTUFDcEI7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
