# CLAUDE.md — TODO mate clone

Project context for Claude Code (and humans). Read this before making changes.

## What this is

A personal todo app that copies the look and feel of **Todo Mate** (the Korean todo/calendar app), built as a
**mobile-first web app / PWA** so it can be installed on an iPhone via Safari → Share → Add to Home Screen.
The long-term goal is to connect it to **Google Calendar** and **Microsoft (Outlook/Teams, possibly Planner)**.

Owner preferences (decided in conversation, don't re-litigate without asking):
- **Web app + PWA**, not a native/App Store app (no Mac, no $99 Apple dev account needed).
- **Local storage only** for now — no backend, no accounts.
- **Mobile-first** narrow layout (max width 440px, centered on desktop) with a bottom tab bar.
- v1 features chosen: calendar with day-progress icons, colored goals, todo actions, repeat. **Day emoji/diary was
  explicitly not wanted.**
- Kanban: a **built-in board** (not an external tool) was chosen; external board sync (Microsoft Planner is the
  suggested fit) is deferred to the Microsoft OAuth phase.
- Google Calendar v1 is **read-only**. Pushing todos to Google is the next planned step.
- Use a **personal Google account** for the Google Cloud project, not the work account.

## Commands

```bash
npm install
npm run dev      # http://localhost:5173 (Google OAuth redirect URI is registered for this port)
npm run build    # tsc -b && vite build  → dist/
npm run lint     # oxlint (3 known "only-export-components" warnings in store.tsx — harmless)
npm run preview  # serve dist/ (service worker only registers in production builds)
```

`.env.local` (git-ignored) holds `VITE_GOOGLE_CLIENT_ID` (and a `VERCEL_OIDC_TOKEN` written by `vercel link` — leave it). See `.env.example`.
Vite only reads env files at startup — **restart `npm run dev` after editing it**.

## Stack

React 19 + TypeScript + Vite 8, plain CSS, **no runtime dependencies besides React**. No router (tabs are local
state in `App.tsx`), no state library (a `useReducer` + context store), no UI kit (icons are inline SVG).
Keep it that way unless there's a real need.

## File map

```
src/
  main.tsx              Entry. Consumes the Google OAuth redirect hash BEFORE render; registers sw.js in prod.
  App.tsx               Shell: tab state (home | board | goals | my), bottom tab bar, error banner.
  App.css / index.css   All styles. index.css = reset + CSS variables; App.css = components, grouped by section.
  types.ts              Goal, Todo, RepeatRule, TodoStatus, TodoSource, State.
  store.tsx             Reducer + context + localStorage persistence (key `todomate.v1`). All mutations live here.
  lib/date.ts           Date-key helpers (YYYY-MM-DD local dates), month/week grids, repeat date generation.
  lib/status.ts         Kanban status ↔ (done, inProgress) mapping.
  lib/google.ts         Google OAuth (redirect implicit flow), token store (useSyncExternalStore), events API.
  pages/
    HomePage.tsx        Calendar + Google events section + goals with todos (the Todo Mate main screen).
    BoardPage.tsx       Kanban: To do / In progress / Done, range + goal filters, drag & drop, quick-advance button.
    GoalsPage.tsx       Create / rename / recolor / delete goals (deleting a goal deletes its todos).
    MyPage.tsx          Stats, streak, Google connect/disconnect, reset data.
  components/
    Calendar.tsx        Month/week calendar with per-day icons (remaining count / colored ✓) and event dots.
    GoalSection.tsx     Goal chip + todo rows + inline add/edit input.
    TodoInput.tsx       Inline input (Enter = add & keep open, Esc/blur = close).
    TodoSheets.tsx      Bottom-sheet actions for a todo: status switch, edit, delete, tomorrow, copy, move, repeat.
    TodoFormSheet.tsx   Full create/edit form (title, goal, date). Used by Board and Google "import as todo".
    GoogleEvents.tsx    useMonthEvents() hook + the Google section on Home.
    DatePicker.tsx      Month picker used by "Change date" / "Do another day".
    BottomSheet.tsx     Modal sheet (backdrop click / Esc closes).
    icons.tsx           Inline SVG icons.
public/
  manifest.webmanifest, sw.js, apple-touch-icon.png, icon-192/512.png, icon-maskable-512.png, favicon.svg
```

## Data model (src/types.ts)

- **Dates are local `YYYY-MM-DD` strings**, never `Date` objects or UTC ISO strings. Use `lib/date.ts`
  (`toKey`, `fromKey`, `addDays`, …). `new Date().toISOString().slice(0,10)` is wrong (UTC shift) — don't use it.
- `Todo.done` is the source of truth for completion. `Todo.inProgress` only matters while `done` is false.
  Use `statusOf()` / `statusFields()` from `lib/status.ts` instead of reading/writing these directly for Kanban.
- `Todo.order` is the sort order **within one goal on one date**. `nextOrder()` in the store appends to the end.
- **Repeats are materialized**: setting a repeat rule creates real todo copies up to `rule.until` (max 400), all
  sharing `seriesId`. Changing the rule deletes *unfinished future* instances and regenerates; finished ones are kept.
  "Delete this and following" removes series members with `date >= this.date`.
- `Todo.source` (`local` | `google` | `microsoft`) + `Todo.externalId` link a todo to a calendar event.
  Google-imported todos have `source: 'google'`, `externalId: <event id>` (unique per recurring instance because
  events are fetched with `singleEvents=true`).
- `State.version` is `1`. If you change the shape incompatibly, bump it and migrate in `load()` in `store.tsx` —
  users have real data in localStorage.

## Google Calendar integration (src/lib/google.ts)

- **Flow:** OAuth 2.0 implicit/token flow via **full-page redirect** to `accounts.google.com/o/oauth2/v2/auth`
  (`response_type=token`). Redirect, not popup, because popups are unreliable inside an iOS home-screen PWA.
  `handleGoogleRedirect()` runs in `main.tsx` before React renders, validates `state` (CSRF), stores the token,
  and strips the hash from the URL.
- **Scope:** `calendar.events.readonly`. Writing events later needs `calendar.events` → users must reconnect once.
- **Redirect URI** is `${location.origin}/`. Every origin the app runs on (localhost:5173, the deployed URL) must be
  added to the Google Cloud OAuth client under both *Authorized JavaScript origins* and *Authorized redirect URIs*
  (redirect URI with trailing slash).
- **Tokens last ~1 hour; no refresh token** (impossible without a backend). A timer drops the token 60s before
  expiry and a 401 also drops it; the UI then shows **Reconnect** (one tap, usually no consent screen).
  Auth state lives in localStorage key `todomate.google` (`{accessToken?, expiresAt?, calendarName?}`);
  "connected but expired" = object present without `accessToken`.
- **Fetching:** `listMonthEvents(token, 'YYYY-MM')` gets the primary calendar for the month ±1 week, paginated,
  cancelled events dropped. `useMonthEvents` caches per month per token; Refresh clears the cache.
- All-day event `end.date` is exclusive; `GEvent.days` lists every local date an event touches.
- Google Cloud project is in **Testing** mode → only listed test users can sign in, and users see
  "Google hasn't verified this app" → Continue. That's expected for personal use.

## PWA

- `index.html` has the manifest, apple-touch-icon and `apple-mobile-web-app-*` meta tags; `viewport-fit=cover` and
  `env(safe-area-inset-bottom)` handle the notch/home bar.
- `public/sw.js`: network-first for page navigations (cached `/` fallback offline), cache-first for hashed
  `/assets/*`. **Never caches cross-origin requests** (Google APIs). Bump `CACHE` name if caching logic changes.
- Registered only in production builds, so dev/HMR isn't affected.
- Live at **https://newtodo-beryl.vercel.app** — Vercel project `newtodo` (team `daniel-medados-projects`), connected
  to GitHub so every push to `main` auto-deploys; `vercel.json` sets `no-cache` on `sw.js`
  so updates reach installed apps. iPhone install requires this HTTPS deployment. Home-screen web apps are
  exempt from Safari's 7-day storage eviction, but data is still per-device until there's sync.

## Testing approach

No test framework is set up. Changes have been verified by `npm run build` + `npm run lint` and by driving the app
in **headless Edge via the Chrome DevTools Protocol** (Node script: navigate, click via `Runtime.evaluate`, type via
`Input.insertText`, screenshots via `Page.captureScreenshot`). Google was tested with `Fetch.enable` intercepting
`accounts.google.com` / `googleapis.com` and returning mock responses, with a second dev server started with a
fake `VITE_GOOGLE_CLIENT_ID`. Note: navigating to the same URL with only a different `#hash` does **not** reload the
page — go to `about:blank` first when simulating an OAuth return.

## Known limitations

- No drag-to-reorder of todos (Home or within a Board column). Board columns sort by date → goal → order.
- Board drag & drop uses HTML5 DnD → desktop only; on touch use the ▶ / ✓ quick button or the status switch.
- Editing a repeating todo's title only changes that one instance.
- Data is local to each browser/device. "All" on the Board can get long with big repeat series.
- Google is read-only and primary-calendar only; imported todos don't update if the event changes.

## Roadmap / next steps (in rough order)

1. Add the Vercel URL to the Google OAuth client (origins + redirect URI) and `VITE_GOOGLE_CLIENT_ID` to Vercel env vars.
2. **Push todos → Google Calendar** (scope `calendar.events`; create/update/delete events for linked todos; decide
   all-day vs. timed; use `extendedProperties.private` to tag events created by the app).
3. **Microsoft**: Outlook calendar (and Teams meetings, which live there) via Microsoft Graph with MSAL; possibly
   Microsoft Planner as an external Kanban. Work/tenant accounts may require admin consent.
4. Probably a small **backend** (refresh tokens, cross-device sync) once integrations are two-way.

## Conventions

- Match existing style: functional components, named exports (except `App`), `import type` for types
  (`verbatimModuleSyntax`), no enums/parameter properties (`erasableSyntaxOnly`), 2-space indent, single quotes.
- State changes go through reducer actions in `store.tsx` — add an action rather than mutating elsewhere.
- Styling: add to the relevant section of `App.css`; use the CSS variables in `index.css`.
- Respect IME composition in key handlers (`e.nativeEvent.isComposing`) — the app may be used with Korean input.
