# Neighbourly

A hyperlocal handyman marketplace. Neighbours post small jobs (snow removal, plumbing,
cleaning, moving, and so on), nearby helpers browse or search the map, apply, and chat
directly to sort out the details.

Live at: https://neighbourly-1.vercel.app/

## Status

Work in progress, not launched. Core flows (posting a job, browsing/searching, applying,
chatting) work end to end. Payments, reviews, and notifications are not built yet.

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4
- React Router v7
- Express API (`api/index.ts`), also used as the Vercel serverless entrypoint
- Prisma + PostgreSQL
- Supabase Auth (email/password and OAuth)
- Socket.io for realtime chat
- Cloudinary for image uploads
- Leaflet / react-leaflet for maps

## Running locally

**Prerequisites:** Node.js, a PostgreSQL database (e.g. a free Supabase or Neon instance),
a Supabase project (for auth), and a Cloudinary account (for image uploads).

1. Install dependencies:

   ```
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values (see below).

3. Push the Prisma schema to your database:

   ```
   npm run db:push
   ```

4. Run the app:

   ```
   npm run dev
   ```

   This starts the Express server (which also serves the Vite dev middleware) at
   http://localhost:3000.

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | Prisma (server) | PostgreSQL connection string |
| `VITE_SUPABASE_URL` | Supabase client (browser) | From your Supabase project settings |
| `VITE_SUPABASE_ANON_KEY` | Supabase client (browser) | From your Supabase project settings |
| `CLOUDINARY_CLOUD_NAME` | Upload signing (server) | From your Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Upload signing (server) | From your Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | Upload signing (server) | Server-side only, never expose to the client |
| `VITE_CARTO_API_KEY` | Map tiles (browser) | Optional. Without it the map falls back to OpenStreetMap's light tiles, which clash with the dark UI. Free tier is 5M tiles/month |
| `CORS_ORIGIN` | API + sockets (server) | Optional. Comma-separated allowed origins. Blank allows any origin |
| `CSP_ENFORCE` | API (server) | Optional. The CSP ships report-only; set `true` to enforce |
| `DISABLE_HMR` | Vite dev server | Optional, set to `true` to disable hot reload |

## Scripts

- `npm run dev` - start the local dev server
- `npm run build` - production build (Vite)
- `npm run db:push` - push the Prisma schema to your database
- `npm run lint` - type-check with `tsc --noEmit`
- `npm run e2e` - end-to-end API check against a running server (see below)
- `npm run preview` - preview the production build locally

## Before launching

Two things are configuration, not code, and both currently block real signups:

1. **Email confirmation is on, and the built-in Supabase mailer is rate limited.**
   New users are sent a confirmation link through Supabase's shared sender,
   which allows only a handful of messages an hour and is explicitly not for
   production - signups fail with `over_email_send_rate_limit`. Either turn off
   Authentication > Providers > Email > "Confirm email", or configure real SMTP
   (Resend, Postmark, SendGrid) under Authentication > Emails.

2. **Only Google is enabled as a social provider.** The sign-in screen now
   offers Google alone for that reason. To offer Facebook or Apple, enable them
   in Authentication > Providers first, then add the buttons back.

Also worth doing before real traffic:

- Set `CORS_ORIGIN` to the deployed URL.
- Watch the browser console on a real deploy for CSP violation reports, then
  set `CSP_ENFORCE=true`.
- Add rate limiting. There is none, and in-process limiting does not work on
  Vercel's serverless functions - it needs a platform-level rule or a shared
  store (Vercel WAF, Upstash).
- Realtime chat needs a long-running server. Socket.IO cannot hold connections
  open on serverless functions, so chat works locally but not on a plain Vercel
  deploy.

### Running the end-to-end check

`npm run e2e` signs up two throwaway users and walks the whole flow - post,
browse, apply, hire, complete, review - asserting the authorisation and
address-privacy rules at each step. It needs email confirmation turned off
(point 1 above) so signup returns a session immediately.
