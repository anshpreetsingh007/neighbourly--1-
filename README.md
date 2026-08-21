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
| `DISABLE_HMR` | Vite dev server | Optional, set to `true` to disable hot reload |

## Scripts

- `npm run dev` - start the local dev server
- `npm run build` - production build (Vite)
- `npm run db:push` - push the Prisma schema to your database
- `npm run lint` - type-check with `tsc --noEmit`
- `npm run preview` - preview the production build locally
