# EyeLeux Virtual Try-On App

A Shopify app that allows merchants to upload 3D GLB files for eyeglasses product variants, and gives customers a real-time AR try-on experience powered by MediaPipe + Three.js.

---

## Features

- **Admin App** – Upload GLB files per variant, enable/disable try-on per product
- **Theme Block** – Drop into any product template via Theme Editor
- **3D View** – Interactive model-viewer with auto-rotate and mobile AR
- **Live Try-On** – Real-time face tracking with MediaPipe, glasses overlay with correct scale, tilt, and PBR metallic rendering

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18.20.4 |
| Shopify CLI | ≥ 3.x (`npm install -g @shopify/cli @shopify/theme`) |
| Shopify Partner account | Required |
| Development store | Required |

---

## Quick Start

### 1. Clone & Install

```bash
cd shopify-tryon-app
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in your SHOPIFY_API_KEY and SHOPIFY_API_SECRET from the Partner Dashboard
```

### 3. Set Up Database

```bash
npx prisma migrate dev --name init
```

### 4. Link to Your Shopify App

```bash
shopify app config link
```

Select your app from the Partner Dashboard.

### 5. Run Locally

```bash
shopify app dev
```

This will:
- Start the Remix dev server on port 3000
- Create an ngrok tunnel
- Open your development store with the app installed

---

## Theme Extension Setup

After running `shopify app dev`:

1. Open your development store admin
2. Go to **Online Store → Themes → Customize**
3. Navigate to a **Product** template
4. Click **Add block**
5. Find **EyeLeux Try-On Block** under Apps
6. Position it above the Buy Button
7. Save

---

## Admin App Usage

1. Open the app from your Shopify admin
2. Browse your products list
3. Click **Manage Try-On** on any product
4. Toggle **Enable Try-On** on
5. For each variant, click **Upload GLB** and select a `.glb` file (max 50 MB)
6. After upload, the green "GLB Uploaded ✓" badge appears
7. Click **Preview** to see the 3D model
8. Click **Save Settings**

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite path: `file:./dev.db` |
| `SHOPIFY_API_KEY` | From Partner Dashboard → App → Client credentials |
| `SHOPIFY_API_SECRET` | From Partner Dashboard → App → Client credentials |
| `SCOPES` | See `shopify.app.toml` (pre-configured) |
| `HOST` | Your public URL (auto-set by `shopify app dev`) |

---

## Deployment (Vercel)

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Add a `vercel.json`

```json
{
  "builds": [{ "src": "build/server/index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "build/server/index.js" }]
}
```

### 3. Build & Deploy

```bash
npm run build
vercel --prod
```

### 4. Set Environment Variables in Vercel Dashboard

Add all variables from `.env.example`.

### 5. Update shopify.app.toml

```toml
[auth]
redirect_urls = [
  "https://your-app.vercel.app/auth/callback",
  "https://your-app.vercel.app/auth/shopify/callback"
]
```

### 6. Deploy the Extension

```bash
shopify app deploy
```

---

## File Structure

```
shopify-tryon-app/
├── app/
│   ├── routes/
│   │   ├── _index.jsx              ← Redirect to /app
│   │   ├── app.jsx                 ← App layout (auth wrapper)
│   │   ├── app._index.jsx          ← Products list page
│   │   ├── app.products.$id.jsx    ← Product Try-On Manager
│   │   ├── api.upload.jsx          ← GLB upload API endpoint
│   │   └── auth.$.jsx              ← Shopify auth callback
│   ├── components/
│   │   └── GlbPreviewModal.jsx     ← model-viewer modal
│   ├── utils/
│   │   ├── metafields.server.js    ← Metafield CRUD helpers
│   │   └── files.server.js         ← Staged upload helpers
│   ├── shopify.server.js           ← Shopify app config
│   ├── root.jsx                    ← Remix root
│   ├── entry.client.jsx
│   └── entry.server.jsx
├── extensions/
│   └── tryon-block/
│       ├── assets/
│       │   ├── tryon-init.js       ← Lazy loader + modal orchestrator
│       │   └── tryon-ar.js         ← Full AR engine (MediaPipe + Three.js)
│       ├── blocks/
│       │   └── tryon.liquid        ← Theme block template
│       └── shopify.extension.toml
├── prisma/
│   └── schema.prisma
├── shopify.app.toml
├── vite.config.js
└── package.json
```

---

## Metafields Used

| Owner | Namespace | Key | Type | Description |
|-------|-----------|-----|------|-------------|
| Product | `tryon` | `enabled` | `boolean` | Whether try-on is enabled for this product |
| ProductVariant | `tryon` | `glb_url` | `url` | CDN URL of the GLB file for this variant |

---

## AR Calibration

The glasses scale is controlled by a calibration factor (default: **1.8**).

**To adjust in development:**
1. Open the Try-On modal on any product page
2. Press the **C** key to show the calibration slider
3. Adjust until glasses fit correctly
4. The value is saved to `localStorage`

---

## Testing Checklist

- [ ] Products list loads with try-on status badges
- [ ] Searching products works
- [ ] Navigating to a product shows all variants
- [ ] Enable toggle saves to metafield
- [ ] GLB upload shows progress bar → success badge
- [ ] Preview modal opens with rotating 3D model
- [ ] Remove GLB resets to "No GLB" status
- [ ] Storefront buttons appear only for variants with GLBs
- [ ] Switching variants hides/shows buttons correctly
- [ ] 3D View modal opens with correct GLB
- [ ] Try-On: camera opens and face is tracked
- [ ] Glasses scale correctly at different distances
- [ ] Head tilt tracking works
- [ ] Mobile Safari: HTTPS camera works
- [ ] Mobile Chrome: AR try-on works

---

## Troubleshooting

### "Camera access denied"
- Make sure your store is on HTTPS (all Shopify stores are)
- Go to browser settings → Site permissions → Camera → Allow

### GLB file doesn't load in Try-On
- Verify the file is a valid `.glb` format
- Check browser console for CORS errors (Shopify CDN handles CORS automatically)
- Try the Preview button in admin first to confirm the model is valid

### Glasses position is off
- Use the calibration slider (press **C** in the Try-On modal)
- Typical range: 1.4–2.5 depending on the model's original scale

### MediaPipe fails to initialize
- Try switching from GPU delegate to CPU: edit `tryon-ar.js`, change `delegate: 'GPU'` to `delegate: 'CPU'`
- This is slower but more compatible

---

## License

MIT
