# Adanbagh Attendance - Dayalbagh

A high-performance, mobile-optimized Attendance Management PWA for **Adanbagh Branch, Dayalbagh**, powered by Google Sheets and Google Apps Script.

---

## 🌟 Features

- **📱 True Full-Screen PWA:** Zero browser address bars, custom launcher icons, and standalone mobile app experience.
- **⚡ Unified Multi-Sheet Search:** Instantly routes and searches across **Student Boys**, **Student Girls**, **Jigyasu Gents**, and **Jigyasu Ladies** simultaneously.
- **🎯 Dynamic Header Resolution:** Automatically adjusts to inserted, removed, or shifted columns in Google Sheets without breaking.
- **🔄 Robust Queue Architecture:** Asynchronous lock-protected batch processing with full back-date attendance and DOR (Date of Registration) validation.
- **🔒 Free & Secure Backend:** 100% free Google Sheets data store with zero paid cloud database dependencies.
- **🎨 Dayalbagh Theme:** Warm cream `#fffbeb` background, amber/gold accents, and `Ra-Dha-Sva-Aah-Mi` header.

---

## 📁 Repository Structure

```text
├── index.html        # PWA App Shell with automatic in-app install prompt
├── manifest.json     # Web App Manifest for Android WebAPK generation
├── sw.js             # Service Worker for shell caching and offline resilience
├── icon-192.png      # 192x192 HD Launcher Icon
├── icon-512.png      # 512x512 HD Launcher & Splash Icon
├── apps-script/      # Google Apps Script Backend Sources
│   ├── Code.gs       # Core Apps Script logic, queue engine, and multi-sheet search
│   ├── Index.html    # Main Attendance Marking UI
│   ├── InfoSearch.html # Member Info & Search View
│   └── Admin.html    # Admin Panel (Back-date & Add Member)
└── README.md
```

---

## 🚀 Activating GitHub Pages (1-Click)

Once pushed to this repository:

1. Open your repository on GitHub: [avichal0603/adanbagh-attandance](https://github.com/avichal0603/adanbagh-attandance).
2. Go to **Settings** (top tab) $\rightarrow$ **Pages** (left navigation bar).
3. Under **Build and deployment $\rightarrow$ Branch**:
   - Select **`main`**
   - Keep folder as **`/(root)`**
   - Click **Save**
4. Within 1 minute, your PWA will be live at:
   👉 **`https://avichal0603.github.io/adanbagh-attandance/`**

---

## 📲 How Volunteers Install on Android

1. Open `https://avichal0603.github.io/adanbagh-attandance/` in Chrome on an Android phone.
2. Tap the in-app prompt banner: **"📲 Install Adanbagh App [Install]"** (or tap Chrome's `⋮` $\rightarrow$ **Install app**).
3. The app is installed directly to the phone's home screen.
4. When launched, it opens in **pure full screen** without any browser URL bar!

---

## ⚙️ Connecting Your Apps Script Deployment URL

1. In Google Apps Script, click **Deploy $\rightarrow$ Manage deployments $\rightarrow$ Web App URL** (ending in `/exec`).
2. When you open the PWA for the first time, it will automatically ask you to paste this URL.
3. Tap **Save & Open App**. The URL will be saved on your device and open automatically every time.
4. (Optional) You can also hardcode your URL inside `index.html` on line 236:
   ```javascript
   const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
   ```
