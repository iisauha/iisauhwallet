// vite.config.ts
import { defineConfig } from "file:///Users/isaiah/Documents/iisauhwallet/node_modules/vite/dist/node/index.js";
import react from "file:///Users/isaiah/Documents/iisauhwallet/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///Users/isaiah/Documents/iisauhwallet/node_modules/vite-plugin-pwa/dist/index.js";
var devCspPermissive = [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src * 'unsafe-inline' 'unsafe-eval' blob:",
  "connect-src * data: blob: ws: wss:",
  "frame-src * data: blob:",
  "img-src * data: blob:",
  "style-src * 'unsafe-inline'",
  "font-src * data:"
].join("; ");
var vite_config_default = defineConfig({
  base: "/iisauhwallet/",
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    },
    headers: {
      "Content-Security-Policy": devCspPermissive,
      "Cache-Control": "no-store, no-cache, must-revalidate"
    }
  },
  plugins: [
    react(),
    // Dev only: remove CSP meta tag so only the permissive server CSP applies (no restrictive meta)
    {
      name: "strip-csp-meta-in-dev",
      apply: "serve",
      transformIndexHtml(html) {
        return html.replace(
          /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/?>\s*/gi,
          ""
        );
      }
    },
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.png"],
      devOptions: { enabled: false },
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
        mode: "development",
        navigateFallback: "/iisauhwallet/index.html"
      }
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvaXNhaWFoL0RvY3VtZW50cy9paXNhdWh3YWxsZXRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9pc2FpYWgvRG9jdW1lbnRzL2lpc2F1aHdhbGxldC92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvaXNhaWFoL0RvY3VtZW50cy9paXNhdWh3YWxsZXQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJztcblxuLy8gTG9jYWwgZGV2OiBwZXJtaXNzaXZlIENTUCBmb3IgdGhpcmQtcGFydHkgc2NyaXB0c1xuY29uc3QgZGV2Q3NwUGVybWlzc2l2ZSA9IFtcbiAgXCJkZWZhdWx0LXNyYyAqICd1bnNhZmUtaW5saW5lJyAndW5zYWZlLWV2YWwnIGRhdGE6IGJsb2I6XCIsXG4gIFwic2NyaXB0LXNyYyAqICd1bnNhZmUtaW5saW5lJyAndW5zYWZlLWV2YWwnIGJsb2I6XCIsXG4gIFwiY29ubmVjdC1zcmMgKiBkYXRhOiBibG9iOiB3czogd3NzOlwiLFxuICBcImZyYW1lLXNyYyAqIGRhdGE6IGJsb2I6XCIsXG4gIFwiaW1nLXNyYyAqIGRhdGE6IGJsb2I6XCIsXG4gIFwic3R5bGUtc3JjICogJ3Vuc2FmZS1pbmxpbmUnXCIsXG4gIFwiZm9udC1zcmMgKiBkYXRhOlwiLFxuXS5qb2luKCc7ICcpO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBiYXNlOiAnL2lpc2F1aHdhbGxldC8nLFxuICBzZXJ2ZXI6IHtcbiAgICBwcm94eToge1xuICAgICAgJy9hcGknOiB7XG4gICAgICAgIHRhcmdldDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMScsXG4gICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBoZWFkZXJzOiB7XG4gICAgICAnQ29udGVudC1TZWN1cml0eS1Qb2xpY3knOiBkZXZDc3BQZXJtaXNzaXZlLFxuICAgICAgJ0NhY2hlLUNvbnRyb2wnOiAnbm8tc3RvcmUsIG5vLWNhY2hlLCBtdXN0LXJldmFsaWRhdGUnLFxuICAgIH0sXG4gIH0sXG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIC8vIERldiBvbmx5OiByZW1vdmUgQ1NQIG1ldGEgdGFnIHNvIG9ubHkgdGhlIHBlcm1pc3NpdmUgc2VydmVyIENTUCBhcHBsaWVzIChubyByZXN0cmljdGl2ZSBtZXRhKVxuICAgIHtcbiAgICAgIG5hbWU6ICdzdHJpcC1jc3AtbWV0YS1pbi1kZXYnLFxuICAgICAgYXBwbHk6ICdzZXJ2ZScsXG4gICAgICB0cmFuc2Zvcm1JbmRleEh0bWwoaHRtbCkge1xuICAgICAgICByZXR1cm4gaHRtbC5yZXBsYWNlKFxuICAgICAgICAgIC88bWV0YVxccytodHRwLWVxdWl2PVwiQ29udGVudC1TZWN1cml0eS1Qb2xpY3lcIlxccytjb250ZW50PVwiW15cIl0qXCJcXHMqXFwvPz5cXHMqL2dpLFxuICAgICAgICAgICcnXG4gICAgICAgICk7XG4gICAgICB9LFxuICAgIH0sXG4gICAgVml0ZVBXQSh7XG4gICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcbiAgICAgIGluY2x1ZGVBc3NldHM6IFsnaWNvbi5wbmcnXSxcbiAgICAgIGRldk9wdGlvbnM6IHsgZW5hYmxlZDogZmFsc2UgfSxcbiAgICAgIG1hbmlmZXN0OiB7XG4gICAgICAgIG5hbWU6ICdpaXNhdWh3YWxsZXQnLFxuICAgICAgICBzaG9ydF9uYW1lOiAnaWlzYXVoJyxcbiAgICAgICAgc3RhcnRfdXJsOiAnLicsXG4gICAgICAgIGRpc3BsYXk6ICdzdGFuZGFsb25lJyxcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyMwYjBiMGYnLFxuICAgICAgICB0aGVtZV9jb2xvcjogJyMwYjBiMGYnLFxuICAgICAgICBpY29uczogW3sgc3JjOiAnLi9pY29uLnBuZycsIHNpemVzOiAnNTEyeDUxMicsIHR5cGU6ICdpbWFnZS9wbmcnIH1dXG4gICAgICB9LFxuICAgICAgd29ya2JveDoge1xuICAgICAgICBtb2RlOiAnZGV2ZWxvcG1lbnQnLFxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrOiAnL2lpc2F1aHdhbGxldC9pbmRleC5odG1sJ1xuICAgICAgfVxuICAgIH0pXG4gIF1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE4UixTQUFTLG9CQUFvQjtBQUMzVCxPQUFPLFdBQVc7QUFDbEIsU0FBUyxlQUFlO0FBR3hCLElBQU0sbUJBQW1CO0FBQUEsRUFDdkI7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRixFQUFFLEtBQUssSUFBSTtBQUVYLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLE1BQU07QUFBQSxFQUNOLFFBQVE7QUFBQSxJQUNOLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxNQUNoQjtBQUFBLElBQ0Y7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLDJCQUEyQjtBQUFBLE1BQzNCLGlCQUFpQjtBQUFBLElBQ25CO0FBQUEsRUFDRjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBO0FBQUEsSUFFTjtBQUFBLE1BQ0UsTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLE1BQ1AsbUJBQW1CLE1BQU07QUFDdkIsZUFBTyxLQUFLO0FBQUEsVUFDVjtBQUFBLFVBQ0E7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxJQUNBLFFBQVE7QUFBQSxNQUNOLGNBQWM7QUFBQSxNQUNkLGVBQWUsQ0FBQyxVQUFVO0FBQUEsTUFDMUIsWUFBWSxFQUFFLFNBQVMsTUFBTTtBQUFBLE1BQzdCLFVBQVU7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLFdBQVc7QUFBQSxRQUNYLFNBQVM7QUFBQSxRQUNULGtCQUFrQjtBQUFBLFFBQ2xCLGFBQWE7QUFBQSxRQUNiLE9BQU8sQ0FBQyxFQUFFLEtBQUssY0FBYyxPQUFPLFdBQVcsTUFBTSxZQUFZLENBQUM7QUFBQSxNQUNwRTtBQUFBLE1BQ0EsU0FBUztBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sa0JBQWtCO0FBQUEsTUFDcEI7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
