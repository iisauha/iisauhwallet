# Live Preview in Cursor

The dev server runs at **http://localhost:5173/iisauhwallet/**.

## Preview with iPhone-style frame

- **URL:** http://localhost:5173/preview.html  
- This page shows the app inside an iPhone-style device frame and uses the same origin, so **Vite HMR applies**: when you save files under `/src`, the app in the iframe updates automatically.

## Open preview inside Cursor (docked right)

1. Start the dev server: `npm run dev` (if not already running).
2. **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`) → run **“Simple Browser: Show”**.
3. When prompted, enter: `http://localhost:5173/preview.html`
4. Drag the Simple Browser tab to the **right** side of the editor and drop it to dock the preview there.
5. Edits under `/src` will hot-reload in the preview (Vite HMR).

## Optional: Run from Tasks

- **Tasks: Run Task** → **“Open Live Preview (iPhone frame)”** → opens the preview in your default system browser.
- **“Open Live Preview in Cursor (Simple Browser)”** → prints these instructions.

No application code or logic is changed; this is only for development preview.
