# CLAUDE.md — TODO mate clone

Project context for Claude Code (and humans). Read this before making changes.

## What this is

A personal todo app that copies the look and feel of **Todo Mate** (the Korean todo/calendar app), built as a
**mobile-first web app / PWA** so it can be installed on an iPhone via Safari → Share → Add to Home Screen.
The long-term goal is to connect it to **Google Calendar** and **Microsoft (Outlook/Teams, possibly Planner)**.

Owner preferences (decided in conversation, don't re-litigate without asking):
- **Web app + PWA**, not a native/App Store app (no Mac, no $99 Apple dev account needed).
- **Accounts = Google accounts** ("Sign in with Google"), so one account works on several devices. Data is
  local-first (localStorage) and synced to **Neon Postgres** through two Vercel Functions. Supabase was dropped
  because the user couldn't log in there; Neon was provisioned through the existing Vercel login (`vercel
  integration add neon`), so no extra accounts. Email/password sign-in was not built.
- **Mobile-first** narrow layout (max width 440px, centered on desktop) with a bottom tab bar.
- v1 features chosen: calendar with day-progress icons, colored goals, todo actions, repeat.
- **"Goals" are called "Categories" in the UI** (the user's word; same concept as Todo Mate's goals). Code and
  data keep the `Goal` / `goalId` names — don't rename them (localStorage compatibility). **Day emoji/diary was
  explicitly not wanted.**
- Kanban: a **built-in board** (not an external tool) was chosen; external board sync (Microsoft Planner is the
  suggested fit) is deferred to the Microsoft OAuth phase.
- Google Calendar: events show on Home (import as todo), and todos can be **pushed to Google** per todo
  ("Time & Google Calendar" sheet: all-day or a set time + duration), with an optional "add new todos automatically" setting.
- Use a **personal Google account** for the Google Cloud project, not the work account.

## Commands

```bash
npm install
npm run dev      # http://localhost:5173 — frontend only; /api is NOT served, so you can't get past the login page
vercel dev --listen 5173   # frontend + /api functions (uses Vercel "development" env vars)
npm run build    # tsc -b && vite build  → dist/
npm run lint     # oxlint (3 known "only-export-components" warnings in store.tsx — harmless)
npm run preview  # serve dist/ (service worker only registers in production builds)
node --env-file=<pulled env file> scripts/migrate.mjs   # apply db/schema.sql (idempotent)
```

Server env vars (Vercel): `DATABASE_URL` (+ other `PG*`/`POSTGRES_*` from the Neon integration),
`SESSION_SECRET` (signs app sessions; hidden "sensitive" value in Production/Preview, a separate known value in
Development that matches `.env.local`), and `VITE_GOOGLE_CLIENT_ID` (also used server-side as the expected ID-token
audience). Never commit pulled env files; pull them into a temp dir.

`.env.local` (git-ignored) holds `VITE_GOOGLE_CLIENT_ID` (and a `VERCEL_OIDC_TOKEN` written by `vercel link` — leave it). See `.env.example`.
Vite only reads env files at startup — **restart `npm run dev` after editing it**.

## Stack

React 19 + TypeScript + Vite 8, plain CSS. Frontend has **no runtime dependencies besides React**. The backend
(`api/`, Vercel Functions, Web `Request`/`Response` handlers) uses `@neondatabase/serverless` and `jose`. No router (tabs are local
state in `App.tsx`), no state library (a `useReducer` + context store), no UI kit (icons are inline SVG).
Keep it that way unless there's a real need.

## File map

```
api/                    Vercel Functions (type-checked by tsconfig.api.json; `_lib` files aren't routes)
  auth/google.ts        POST { idToken, nonce } → verify Google ID token (JWKS, aud = client id, nonce) →
                        upsert users → { token: 180-day HS256 session, user }
  sync.ts               POST { since, changes } → last-write-wins upsert + everything with seq > since
  _lib/session.ts       Google ID-token verification, session create/verify
  _lib/http.ts          json(), readJson(), db() (Neon HTTP driver)
db/schema.sql           users + records tables (apply with scripts/migrate.mjs)
src/
  main.tsx              Entry. Consumes the Google OAuth redirect hash BEFORE render; registers sw.js in prod.
  App.tsx               Shell: tab state (home | board | categories | my), bottom tab bar, error banner.
  App.css / index.css   All styles. index.css = reset + CSS variables; App.css = components, grouped by section.
  types.ts              Goal, Todo, RepeatRule, TodoStatus, TodoSource, State.
  store.tsx             Reducer + context + localStorage persistence (key `todomate.v1`). All mutations live here.
  lib/date.ts           Date-key helpers (YYYY-MM-DD local dates), month/week grids, repeat date generation.
  lib/status.ts         Kanban status ↔ (done, inProgress) mapping.
  lib/google.ts         Google OAuth (redirect implicit flow), token store (useSyncExternalStore), events API.
  lib/gcalSync.ts       Todo ↔ Google event mapping + useGoogleSync() engine (mounted in App): push + pull.
  lib/gcalPull.ts       Shared per-month events cache (useMonthEvents), focus/visibility + polling refresh.
  lib/account.ts        App account session store (useAccount), completeSignIn(), sync status.
  lib/cloudSync.ts      useCloudSync() engine (mounted in App) + signOut().
  pages/
    HomePage.tsx        Calendar + Google events section + goals with todos (the Todo Mate main screen).
    BoardPage.tsx       Kanban: To do / In progress / Done, range + goal filters, drag & drop, quick-advance button.
    CategoriesPage.tsx  List, reorder (up/down), edit, end/restore categories; "Ended" section.
    MyPage.tsx          Stats, streak, Google connect/disconnect, reset data.
  components/
    Calendar.tsx        Month/week calendar with per-day icons (remaining count / colored ✓) and event dots.
    GoalSection.tsx     Category chip + todo rows + inline add/edit input (ended categories: no "+").
    CategoryEditorSheet.tsx  Create/edit a category: name, color, End/Restore, Delete. Used by Home + Categories.
    TodoInput.tsx       Inline input (Enter = add & keep open, Esc/blur = close).
    TodoSheets.tsx      Bottom-sheet actions for a todo: status switch, edit, delete, tomorrow, copy, move, repeat.
    TodoFormSheet.tsx   Full create/edit form (title, goal, date). Used by Board and Google "import as todo".
    GoogleEvents.tsx    The Google section on Home (re-exports useMonthEvents from lib/gcalPull).
    (TodoSheets.tsx also holds ScheduleForm — time/duration + "Show in Google Calendar".)
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
- `Goal.archived` = an **ended** category: hidden from Home (except on days that still have its todos), from Board
  filters and from new-todo pickers; its todos are kept. Deleting a category deletes its todos. The order of
  `State.goals` is the display order (`goal/move` swaps with the next non-ended neighbour).
- `Todo.order` is the sort order **within one goal on one date**. `nextOrder()` in the store appends to the end.
- **Repeats are materialized**: setting a repeat rule creates real todo copies up to `rule.until` (max 400), all
  sharing `seriesId`. Changing the rule deletes *unfinished future* instances and regenerates; finished ones are kept.
  "Delete this and following" removes series members with `date >= this.date`.
- `Todo.source` (`local` | `google` | `microsoft`) + `Todo.externalId` link a todo to a calendar event.
  Google-imported todos have `source: 'google'`, `externalId: <event id>` (unique per recurring instance because
  events are fetched with `singleEvents=true`).
- `Todo.time` (`HH:MM`, absent = all day) + `Todo.duration` (minutes). `Todo.gcal` present = mirrored to Google
  (`eventId`, `syncedSig`, `error`/`errorSig`). `State.gcalDeletes` is an outbox of event ids to delete;
  `State.settings.autoGcal` auto-links new todos. Copies/repeats inherit time, duration and the gcal flag.
- `State.version` is `1`. If you change the shape incompatibly, bump it and migrate in `load()` in `store.tsx` —
  users have real data in localStorage.

## Google Calendar integration (src/lib/google.ts)

- **Flow:** OAuth 2.0 implicit/token flow via **full-page redirect** to `accounts.google.com/o/oauth2/v2/auth`
  (`response_type=token`). Redirect, not popup, because popups are unreliable inside an iOS home-screen PWA.
  `handleGoogleRedirect()` runs in `main.tsx` before React renders, validates `state` (CSRF), stores the token,
  and strips the hash from the URL.
- **Scopes:** `calendar.events` (read + write events) + `calendar.calendarlist.readonly` (list calendars so events
  from every calendar ticked in the user's Google sidebar are shown, each with its calendar color). The granted
  `scope` from the redirect is stored; `canWrite` / `allCalendars` flags drive **Update permissions** /
  **Show all calendars** prompts (one reconnect). Without the list scope only `primary` is read. A 403
  "insufficient" clears the stored scope. Writes always go to `primary`.
- **Redirect URI** is `${location.origin}/`. Every origin the app runs on (localhost:5173, the deployed URL) must be
  added to the Google Cloud OAuth client under both *Authorized JavaScript origins* and *Authorized redirect URIs*
  (redirect URI with trailing slash).
- **Tokens last ~1 hour; no refresh token** (impossible without a backend). A timer drops the token 60s before
  expiry and a 401 also drops it; the UI then shows **Reconnect** (one tap, usually no consent screen).
  Auth state lives in localStorage key `todomate.google` (`{accessToken?, expiresAt?, calendarName?}`);
  "connected but expired" = object present without `accessToken`.
- **Fetching:** `listMonthEvents(token, 'YYYY-MM')` reads all visible calendars for the month −6/+8 days
  (paginated, cancelled dropped; one failing secondary calendar is skipped, primary failing fails the fetch) and
  returns `{ events, appEvents, from, to }`: display events, plus events tagged with `todomateId` (ours) parsed back
  into title/done/date/time/duration. The cache in `lib/gcalPull.ts` is module-level and shared; months on screen
  (ref-counted) refetch on window focus / `visibilitychange` (if older than 3 s) and every 15 s tick once older than
  60 s. App always keeps the current month active so pulls happen even off the Home tab. (A single 60 s interval
  with a 55 s max-age once caused ~2 min gaps — keep tick ≪ max age.)
- All-day event `end.date` is exclusive; `GEvent.days` lists every local date an event touches.
- **Push sync (lib/gcalSync.ts):** `buildEvent()` maps a todo to an event (summary gets a `✓ ` prefix when done;
  goal color → nearest Google `colorId`; `extendedProperties.private.todomateId` tags it). A signature of the event
  content is compared with `gcal.syncedSig`; stale → POST (no `eventId`) or PATCH. Failures store `error`+`errorSig`
  and only retry when the todo changes (plus once per app session). 404/410 or a `cancelled` response = deleted in
  Google → the todo is unlinked (we don't resurrect it). Deletions go through `gcalDeletes`.
  Events tagged with `todomateId` are filtered out of the Home events list so they don't show twice.
- **Pull sync (Google → todo):** for each fetched month, linked todos in state `synced` whose `gcal.syncedAt` is
  older than that fetch's `fetchStartedAt` are compared with their event (`pulledPatch`). Differences (renamed,
  moved, retimed, `✓ ` added/removed) are applied via `gcal/pulled`, which also stores the new signature +
  `syncedAt` so nothing is pushed back. Local unsynced edits (`pending`) always win. If the event is missing from a
  window that covers the todo's date (and isn't now a recurring series), it was deleted in Google → the todo is
  kept and unlinked. Imported todos (`source: 'google'`) are snapshots and don't update.
- **PATCH merges nested objects.** Switching all-day ↔ timed must send `null` for the other form
  (`date: null` / `dateTime: null, timeZone: null`), otherwise Google returns 400 "Invalid start time". Nulls are
  stripped from POST bodies. (This bug shipped once — keep it.)
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

## Accounts & cloud sync

- **Sign-in:** `signInWithGoogleRedirect()` (lib/google.ts) redirects with `response_type=id_token`, scope
  `openid email profile`, a `nonce`, `prompt=select_account`. The pending redirect is stored as JSON
  `{ state, purpose: 'signin' | 'calendar', nonce }` under `todomate.google.oauthState`; `handleGoogleRedirect()`
  returns `{ error?, signIn? }`, and main.tsx calls `completeSignIn()` which exchanges the ID token at
  `/api/auth/google`. The session lives in localStorage `todomate.account` (180 days). Signing in is separate from
  connecting Google Calendar (different scopes, different flow).
- **Records:** each category (`goal`, data includes `pos` = list index), todo (`todo`) and `settings` object is one
  row in `records` keyed by (user_id, kind, id). `gcalDeletes` is device-local and not synced.
- **Client engine (lib/cloudSync.ts):** per-record meta in localStorage `todomate.sync`
  (`{ userId, cursor, initialized, records: { key: { h: hash, u: editedAt, p?: pending, d?: deleted } } }`).
  After each store change, records whose stable-JSON hash changed get a new `u` and `p`. A round POSTs pending
  records (batches of 400) with `since: cursor` and applies what comes back via `sync/apply` (skipping records
  where a local pending edit is newer). Echoes of our own writes match by hash and are no-ops. Runs on change
  (400 ms debounce), every 5 s while visible, on focus/visibility/online.
- **First sync on a device** pulls everything first. If the device has **no todos**, it adopts the account's data
  (`sync/replace`) instead of uploading its starter Work/Personal categories (no duplicates); otherwise it merges and
  uploads local-only records.
- **Server (api/sync.ts):** writes for a user are serialized with `pg_advisory_xact_lock` inside one transaction so
  `seq` order = visibility order (pull-after-cursor never skips). Upsert only if `updated_at` is newer.
  `updated_at` is clamped to now + 5 min. Max 500 changes/request, 32 KB/record, 1000 rows/page (`hasMore`).
- **Login gate:** `App` renders `LoginPage` unless there's a non-expired session; the real app (`SignedInApp`, which
  mounts the sync hooks) only renders when signed in. Expired sessions land on the login page with a note and keep
  local data. Redirect errors (e.g. cancelled sign-in) show on the login page.
- **Switching accounts on one device:** if the stored sync meta belongs to another user id, the engine clears local
  data (`sync/clear`), forgets the Calendar token and adopts the new account's server data (`meta.adoptRemote`), so
  one account's todos are never uploaded into another. Data from never-signed-in use (no meta) merges into the first
  account that signs in.
- **Sign out** (`signOut()`): clears session + sync meta + local data (`sync/clear`, which does *not* queue Google
  event deletions) and forgets the Calendar token on this device without revoking it. Cloud data stays.
  A 401 from /api/sync marks the session `expired` (local data kept, "Sign in again" shown).
- **Google Calendar with several devices:** new events are created with a deterministic id
  (`eventIdFor()` = `tm` + todo UUID hex); a second device inserting the same event gets 409 and PATCHes instead,
  so two devices can't create duplicates. `gcal` sync state is part of the synced todo record.
- **Other people** can only sign in while the Google Cloud project is in Testing mode if they're added as test
  users (max 100). Publishing the app (basic scopes need no verification; calendar scopes show an unverified
  warning) would open it to anyone.

## iPhone / touch conventions (keep these)

- **Inputs must be ≥ 16px** (`input, select, textarea { font-size: 16px !important }` at the end of App.css) or iOS
  zooms the page on focus. Don't "fix" zoom with `maximum-scale=1` (kills pinch-zoom on Android).
- **Hover styles only inside `@media (hover: hover)`**, otherwise they stick after a tap on iOS.
- Touch sizes live in the `@media (pointer: coarse)` block (≈40–44 px targets; checkbox hit area via `::after`).
- **Keyboard:** `lib/viewport.ts` sets `--kb` (keyboard height) and `--vvh` from `visualViewport`. Bottom sheets
  sit at `bottom: var(--kb)`; `.content` gets `--kb` extra bottom padding. Inline inputs focus with
  `preventScroll` and call `revealAboveKeyboard()` (on focus and after each add) because iOS opens the keyboard after
  focus and won't scroll the field up itself.
- Open sheets add `html.sheet-open` (body scroll lock). `touch-action: manipulation` disables double-tap zoom.
- Inputs set `enterKeyHint` / `autoCapitalize`.

## Testing approach

Two-device sync was tested with two isolated headless Edge profiles against `vercel dev` and the real Neon DB,
using a throwaway user row + a session minted with the Development `SESSION_SECRET` (Google's own login can't be
automated; the redirect was simulated and `/api/auth/google` intercepted). Delete test rows afterwards.

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
- Sync is near-real-time by polling (5 s), not push. Conflicts are last-write-wins per whole record (a todo edited
  on two devices while offline keeps the later edit). Device clocks decide "later".
- "All" on the Board can get long with big repeat series.
- Google: sync (both directions) only runs while the app is open and signed in (~1h tokens, no backend). Imported
  todos are snapshots. Pushed events live on the primary calendar. Description/color/attendee edits in Google aren't
  pulled (only title, done ✓, date, time, duration).

## Roadmap / next steps (in rough order)

1. Add the Vercel URL to the Google OAuth client (origins + redirect URI) and `VITE_GOOGLE_CLIENT_ID` to Vercel env vars.
3. **Microsoft**: Outlook calendar (and Teams meetings, which live there) via Microsoft Graph with MSAL; possibly
   Microsoft Planner as an external Kanban. Work/tenant accounts may require admin consent.
4. Use the backend for Google **refresh tokens** (code flow + client secret in Vercel env) so Calendar sync
   doesn't need hourly reconnects and can run while the app is closed.

## Conventions

- Match existing style: functional components, named exports (except `App`), `import type` for types
  (`verbatimModuleSyntax`), no enums/parameter properties (`erasableSyntaxOnly`), 2-space indent, single quotes.
- State changes go through reducer actions in `store.tsx` — add an action rather than mutating elsewhere.
- Styling: add to the relevant section of `App.css`; use the CSS variables in `index.css`.
- Respect IME composition in key handlers (`e.nativeEvent.isComposing`) — the app may be used with Korean input.
