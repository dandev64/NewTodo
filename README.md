# TODO mate (clone)

A mobile-first todo app inspired by [Todo Mate](https://www.todomate.net/): a monthly calendar where each day shows
your progress, color-coded goals, a Kanban board, and Google Calendar events alongside your todos.
Installable on iPhone/Android as a home-screen web app (PWA). Data is stored locally in the browser.

**Live:** https://newtodo-beryl.vercel.app

## Features

- **Calendar**: month/week view; each day shows how many todos are left, or a colored ✓ when everything is done.
- **Goals**: colored categories; tap a goal to quickly type todos (Enter keeps adding).
- **Todo actions**: edit, delete, do it tomorrow / today, do another day, change date, repeat (daily / weekly / monthly).
- **Board**: To do / In progress / Done columns with filters by range and goal; drag & drop on desktop.
- **Google Calendar** (read-only): see the selected day's events on Home and turn any event into a todo.
- **PWA**: app icon, full-screen standalone mode, works offline.

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint`.

## Google Calendar setup (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API**.
2. Configure the OAuth consent screen (**External**) and add your Google account as a **test user**.
3. Create an **OAuth client ID** of type **Web application** with:
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:5173/`
4. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID`.
5. Restart `npm run dev`, then go to **My → Connect**.

Google shows "Google hasn't verified this app" while the project is in testing mode — choose **Continue**.
Sign-in lasts about an hour (no backend = no refresh token); tap **Reconnect** when prompted.
When you deploy, add the deployed URL to the same two lists.

## Install on iPhone

Deploy the app to an HTTPS host (e.g. Vercel, Netlify, Cloudflare Pages: build command `npm run build`, output `dist`),
open the URL in Safari, then **Share → Add to Home Screen**.

## Tech

React 19, TypeScript, Vite — no other runtime dependencies. See [CLAUDE.md](CLAUDE.md) for architecture, data model
and design decisions.
