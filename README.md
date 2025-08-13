# To‑Do Task Reminder App

A lightweight To‑Do + Reminder web app built with **Vite + React + TypeScript + Tailwind**.

## ✨ Features
- Create, edit, delete, duplicate tasks
- Due date & time, priority, lists, tags
- Multiple reminders per task (minutes before due)
- Snooze (15m / 1h), complete/un-complete
- Filters: Today / Upcoming / Overdue / Completed / All
- Search + filters for list, tag, priority
- Local persistence (saves to `localStorage`)
- In‑app toast reminders + optional browser notifications

## 🚀 Run locally
```bash
npm install
npm run dev
# open the URL shown in your terminal
```

## 🌍 Deploy (Vercel/Netlify)
- Push this folder to GitHub.
- **Vercel**: Import the repo → Framework preset: Vite → Deploy.
- **Netlify**: New site from Git → Build command: `npm run build` → Publish dir: `dist/`.

## 🔐 Notes on notifications
This prototype uses the Notification API (permission required). For reliable background reminders, convert to a PWA with a Service Worker alarm or server-side scheduler.
