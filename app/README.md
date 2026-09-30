# BukkaGo web app

Next.js 14 App Router prototype. Install and run from the repository root (`npm install`, `npm run dev`); this folder is an npm workspace, so the root scripts proxy to it.

Routes:
- `/` customer discovery, menu, checkout preview, order status preview
- `/vendor` vendor order board, stock toggles, pickup-code interaction
- `/admin` vendor application review preview

All three routes currently use local sample data. Interactions are prototypes and do not persist or charge customers. Connect the Supabase schema at the repository root before pilot use.
