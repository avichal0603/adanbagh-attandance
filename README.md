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
- **🚀 Zero Volunteer Setup:** The Apps Script backend is statically hardcoded—volunteers never have to enter any URLs or technical configurations!

---

## 📁 Repository Structure

```text
├── index.html        # PWA App Shell with automatic in-app install prompt & static backend
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

## 🌐 Live PWA Link

👉 **`https://avichal0603.github.io/adanbagh-attandance/`**

---

## 📲 How Volunteers Install on Android

1. Open `https://avichal0603.github.io/adanbagh-attandance/` in Chrome on an Android phone.
2. Tap the in-app prompt banner: **"📲 Install Adanbagh App [Install]"** (or tap Chrome's `⋮` $\rightarrow$ **Install app**).
3. The app installs directly to the phone's home screen.
4. When opened, it launches in **pure full screen** and opens straight into the attendance portal. No setup required!
