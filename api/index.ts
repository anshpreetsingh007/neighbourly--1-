import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
// import { createServer as createViteServer } from 'vite'; (Moved to dynamic import)
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { RequestHandler, Request } from 'express';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { CATEGORIES } from '../src/lib/categories';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local for local development. Values already present in the
// environment (e.g. those Vercel injects) always win - dotenv never overrides.
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });
const prisma = new PrismaClient();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Server-side Supabase client, used only to verify caller access tokens. The anon
// key is sufficient for auth.getUser() and carries no elevated privileges.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabaseAuth = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

if (!supabaseAuth) {
  console.warn(
    'SUPABASE_URL / SUPABASE_ANON_KEY are not set - authenticated routes will reject every request.'
  );
}

interface AuthedRequest extends Request {
  authUser?: SupabaseUser;
  dbUser?: Awaited<ReturnType<typeof getOrCreateDbUser>>;
}

/**
 * Short-lived cache of verified access tokens.
 *
 * supabase.auth.getUser() is an HTTPS round trip to Supabase on every single
 * authenticated request - it was the largest fixed cost in the app, paid
 * before any route did its own work, on every feed load, every poll, every
 * navigation. The token is signed and time-limited, so re-verifying the same
 * string seconds later cannot produce a different answer.
 *
 * Only the token -> Supabase user mapping is cached. The local DB row is still
 * read fresh on every request, so a profile edit or a ban takes effect on the
 * very next call rather than whenever this expires.
 */
const TOKEN_CACHE_TTL_MS = 60_000;
const TOKEN_CACHE_MAX = 5_000;
const tokenCache = new Map<string, { user: SupabaseUser; expiresAt: number }>();

/**
 * The `exp` claim, read WITHOUT verifying the signature. Only ever used to
 * shorten a cache lifetime - identity always comes from the verified
 * getUser() response - so a forged payload can shrink its own cache entry and
 * nothing else.
 */
function tokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json?.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function cachedUserFor(token: string): SupabaseUser | null {
  const hit = tokenCache.get(token);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    tokenCache.delete(token);
    return null;
  }
  return hit.user;
}

function cacheVerifiedUser(token: string, user: SupabaseUser) {
  // Never cache past the token's own expiry, so a token that dies in ten
  // seconds is not honoured for sixty.
  const exp = tokenExpiryMs(token);
  const expiresAt = Math.min(Date.now() + TOKEN_CACHE_TTL_MS, exp ?? Infinity);
  if (expiresAt <= Date.now()) return;

  // Bounded so a stream of distinct tokens cannot grow this without limit.
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    for (const [key, value] of tokenCache) {
      if (value.expiresAt <= Date.now()) tokenCache.delete(key);
    }
    if (tokenCache.size >= TOKEN_CACHE_MAX) {
      tokenCache.delete(tokenCache.keys().next().value as string);
    }
  }
  tokenCache.set(token, { user, expiresAt });
}

/**
 * Verifies the caller's Supabase access token and attaches the resolved user to
 * the request. Fails closed: a missing token, an invalid token, or missing server
 * config all result in a rejection rather than an unauthenticated pass-through.
 *
 * This trusts the signed JWT, not a client-supplied id header.
 */
const requireAuth: RequestHandler = async (req, res, next) => {
  if (!supabaseAuth) {
    console.error('Rejecting authenticated request: Supabase auth is not configured.');
    return res.status(503).json({ error: 'Authentication is not configured on the server' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  try {
    let authUser = cachedUserFor(token);
    if (!authUser) {
      const { data, error } = await supabaseAuth.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      authUser = data.user;
      cacheVerifiedUser(token, authUser);
    }
    // Resolve the local row once here so every route shares it, and so a ban is
    // enforced on every authenticated path - including /api/uploads/sign, which
    // does not otherwise need a DB user. Deliberately not cached: a ban or a
    // profile edit has to apply on the next request, not a minute later.
    const dbUser = await getOrCreateDbUser(authUser);
    if (dbUser.is_banned) {
      return res.status(403).json({ error: 'This account has been suspended' });
    }

    (req as AuthedRequest).authUser = authUser;
    (req as AuthedRequest).dbUser = dbUser;
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * The only User columns another user is ever allowed to see. Everything else on
 * the row - email, phone, supabase_uid, lat/lng, stripe ids, is_banned - stays
 * server-side. Use this wherever a User is attached to a response that someone
 * other than that user will read.
 */
const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  avatar_url: true,
  bio: true,
  // neighbourhood is deliberately NOT here. The field is labelled
  // "Neighbourhood" but people type their full street address into it, and
  // several already have. Publishing it undid the whole point of blurring job
  // locations: the pin was approximate while the poster's profile gave away
  // the exact house. Own-profile reads go through /api/users/me, which returns
  // the full row, so editing it still works.
  is_id_verified: true,
  created_at: true,
} as const;

/** Narrows a request that has already passed through requireAuth. */
function authed(req: Request): SupabaseUser {
  const user = (req as AuthedRequest).authUser;
  if (!user) {
    // Unreachable via requireAuth; guards against a route wired up without it.
    throw new Error('authed() called on a route that is not behind requireAuth');
  }
  return user;
}

/** The local User row for the caller, resolved once by requireAuth. */
function currentUser(req: Request) {
  const user = (req as AuthedRequest).dbUser;
  if (!user) {
    throw new Error('currentUser() called on a route that is not behind requireAuth');
  }
  return user;
}

/**
 * The name other users see: first name plus a last initial, e.g. "Karan P.".
 * Full surnames stay server-side - people meet strangers at their homes through
 * this app, so a browsable list of full names is a safety problem, not just a
 * privacy one. `name` is the only one of these in PUBLIC_USER_SELECT.
 */
function publicDisplayName(first?: string | null, last?: string | null) {
  const f = (first || '').trim();
  const l = (last || '').trim();
  if (!f && !l) return 'Anonymous Neighbour';
  if (!l) return f;
  return `${f} ${l.charAt(0).toUpperCase()}.`;
}

/** Pulls whatever name parts a provider gave us out of the token's claims. */
function nameFromMetadata(metadata: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  let first = str(metadata.first_name) || str(metadata.given_name);
  let last = str(metadata.last_name) || str(metadata.family_name);

  // OAuth providers usually give one combined name; split on the first space.
  if (!first) {
    const full = str(metadata.full_name) || str(metadata.name);
    if (full) {
      const parts = full.split(/\s+/);
      first = parts.shift() || '';
      last = last || parts.join(' ');
    }
  }
  return { first, last };
}

/**
 * Maps a verified Supabase user onto our local User row, creating it on first
 * sight. Profile details come from the token's own claims, never from the body.
 */
async function getOrCreateDbUser(authUser: SupabaseUser) {
  const metadata = (authUser.user_metadata || {}) as Record<string, unknown>;
  const { first, last } = nameFromMetadata(metadata);

  // Upsert, not findUnique-then-create: it is one atomic statement, and the
  // split version measured 20 req/sec against 18 - noise - while opening a
  // race on first sign-in, when the browser fires several requests at once.
  return prisma.user.upsert({
    where: { supabase_uid: authUser.id },
    update: {},
    create: {
      supabase_uid: authUser.id,
      email: authUser.email || `user_${authUser.id.slice(0, 8)}@example.com`,
      first_name: first || null,
      last_name: last || null,
      name: publicDisplayName(first, last),
      // Deliberately left null: AuthGuard treats a missing neighbourhood as
      // "this profile is incomplete" and routes the user to /profile-setup.
      // Filling in a placeholder here would silently skip that step.
    },
  });
}

/**
 * Stable pseudo-random offset in [-1, 1) derived from a string, so a given job
 * always blurs to the same spot instead of jittering on every request (which
 * would let someone average many reads back to the true position).
 */
function stableUnit(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return ((h >>> 0) % 100000) / 100000 * 2 - 1;
}

/**
 * Drops the street line from a geocoded address, keeping the neighbourhood and
 * city. "58 Corner Ridge Mews NE, Cornerstone, Calgary, Alberta" becomes
 * "Cornerstone, Calgary" - useful for orienting, useless for finding the house.
 */
function coarseArea(address?: string | null) {
  if (!address) return null;
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1, 3).join(', ') : 'Approximate area';
}

/**
 * What a job looks like to someone who is not entitled to the exact address.
 *
 * Browsing users get the neighbourhood and a pin blurred by a few hundred
 * metres - enough to judge "is this near me?", not enough to identify the house.
 * A public list of addresses plus "nobody home Tuesday, fence is broken" is a
 * safety problem, not just a privacy one.
 *
 * The full address is revealed to the poster, and to a helper whose application
 * has been ACCEPTED.
 */
function jobForViewer(job: any, viewerId: string) {
  const { _count, ...rest } = job;
  const isPoster = job.poster_id === viewerId;
  const all = job.applications || [];
  const mine = all.find((a: any) => a.helper_id === viewerId);
  const isAcceptedHelper = mine?.status === 'ACCEPTED';

  // Who else applied, and what they bid, is the poster's business alone.
  // Everyone else sees only their own application plus a count.
  //
  // The count comes from _count when the caller selected it, because the feed
  // no longer loads every application row just to call .length on them - on a
  // job with 40 applicants that was 40 rows fetched and thrown away, per job,
  // per feed load.
  const base = {
    ...rest,
    applications: isPoster ? all : mine ? [mine] : [],
    application_count: _count?.applications ?? all.length,
  };

  if (isPoster || isAcceptedHelper) {
    return { ...base, location_precision: 'exact' };
  }

  // ~±400 m; enough to hide which house, small enough to stay useful on a map.
  const RADIUS_DEG = 0.004;
  return {
    ...base,
    address: coarseArea(job.address),
    lat: job.lat + stableUnit(job.id + 'lat') * RADIUS_DEG,
    lng: job.lng + stableUnit(job.id + 'lng') * RADIUS_DEG,
    location_precision: 'approximate',
  };
}

/**
 * Caps on free text, mirroring the maxLength on the Post a Job form.
 *
 * The client limit is only a suggestion - curl ignores it - and an unbounded
 * description is not just an ugly card: it ships in every /api/jobs response,
 * so one abusive post slows the feed for every user.
 */
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 1000;
const ADDRESS_MAX = 300;
const REVIEW_MAX = 600;
/** Ratings are whole stars, 1 to 5. */
const RATING_MIN = 1;
const RATING_MAX = 5;

/**
 * The two people who actually worked together on a job: the poster and whoever
 * they hired. Nobody else may review, and they may only review each other.
 * Returns null when the job has no accepted helper.
 */
function jobCounterparties(job: {
  poster_id: string;
  applications: { status: string; helper_id: string }[];
}) {
  const hired = job.applications.find(a => a.status === 'ACCEPTED');
  if (!hired) return null;
  return { posterId: job.poster_id, helperId: hired.helper_id };
}

/** Storage and bandwidth are billed per image, so the set has a ceiling. */
const PHOTO_MAX = 10;

/**
 * Ceilings on every list endpoint.
 *
 * None of these had one. A feed query returned every OPEN job ever posted, the
 * notification list returned every notification a user had ever received, and
 * opening a chat returned the entire message history - all of it serialised
 * into one JSON response on every page load. That is fine with the twenty rows
 * in this database today and a cliff later, so the cap goes in now while the
 * numbers are small enough that nobody notices it arriving.
 */
const JOB_PAGE_SIZE = 100;
const NOTIFICATION_PAGE_SIZE = 50;
const MESSAGE_PAGE_SIZE = 200;

/**
 * Categories come from the same module the Post a Job form renders, so the
 * list the server accepts can never drift from the list the UI offers - a
 * mismatch there rejects a perfectly ordinary job post.
 */
const VALID_CATEGORIES = new Set(CATEGORIES.map(c => c.id));

/** Mirrors the three choices on the form, which are upper-cased on submit. */
const VALID_URGENCIES = new Set(['FLEXIBLE', 'THIS WEEK', 'ASAP']);

/**
 * Required free-text field: present, a string, and not just whitespace.
 * Without this a body with no title reached prisma.job.create and came back as
 * a 500 "Failed to create job", which tells the caller nothing about what was
 * actually wrong with their request.
 */
function requiredText(value: unknown, label: string): string | null {
  return typeof value === 'string' && value.trim() ? null : `${label} is required`;
}

/**
 * Photos arrive as an array of Cloudinary URLs. Anything else - a non-array, a
 * non-string entry, more than the cap - is rejected rather than written, since
 * these strings end up in an <img src> on every viewer's page.
 */
function validatePhotos(photos: unknown): string | null {
  if (photos === undefined || photos === null) return null;
  if (!Array.isArray(photos)) return 'Photos must be a list';
  if (photos.length > PHOTO_MAX) return `You can add up to ${PHOTO_MAX} photos`;
  if (photos.some(url => typeof url !== 'string' || !url.trim())) {
    return 'One of those photos is not a valid image';
  }
  return null;
}

/**
 * A job budget is a neighbourhood odd-job price, not a number people should be
 * able to make arbitrarily large. Without a ceiling someone types enough zeroes
 * that Float renders as 1e+29, which overflows every card and detail header.
 * $900,000 is the agreed ceiling - high enough never to block a real job,
 * low enough that the figure still fits a card without going exponential.
 */
const BUDGET_MAX = 900000;

/**
 * Parses and range-checks a budget pair. Returns the numbers or an error string;
 * never returns a silent default, because `parseFloat(x) || 0` used to turn
 * garbage into a free job.
 */
function parseBudget(rawMin: unknown, rawMax: unknown):
  | { min: number; max: number; error?: undefined }
  | { error: string; min?: undefined; max?: undefined } {
  const min = parseFloat(String(rawMin));
  const max = parseFloat(String(rawMax));
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { error: 'Enter a valid budget range' };
  }
  if (min < 0 || max < 0) return { error: 'A budget cannot be negative' };
  if (max < min) return { error: 'The maximum budget must be at least the minimum' };
  if (max > BUDGET_MAX) {
    return { error: `A budget cannot be more than $${BUDGET_MAX.toLocaleString('en-US')}` };
  }
  // Fractions of a cent are noise on a board priced in whole dollars.
  return { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100 };
}

/**
 * Turns a Cloudinary delivery URL back into the public_id the Admin API needs
 * to delete it. Returns null for anything that is not one of ours - a Google
 * OAuth avatar must never be handed to cloudinary.destroy.
 *
 *   https://res.cloudinary.com/<cloud>/image/upload/v1234/neighbourly_jobs/abc.jpg
 *     -> neighbourly_jobs/abc
 */
function cloudinaryPublicId(url: string): string | null {
  const match = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(.+)$/.exec(url || '');
  if (!match) return null;

  const segments = match[1].split('/');
  // Drop the version marker and any transformation segment sitting in front of
  // the public_id, so a resized URL still resolves to the original asset.
  while (segments.length > 1 && /^(v\d+|[a-z]{1,3}_[^/]*)$/.test(segments[0])) {
    segments.shift();
  }
  const path = segments.join('/');
  if (!path) return null;
  return path.replace(/\.[a-zA-Z0-9]+$/, '');
}

/**
 * Removes images from Cloudinary once their rows are gone. Best effort on
 * purpose: the database is the source of truth, and a failed cleanup should
 * leave an orphaned file and a log line, never a failed request for a delete
 * that already happened.
 */
async function destroyCloudinaryImages(urls: string[]) {
  const ids = urls.map(cloudinaryPublicId).filter((id): id is string => Boolean(id));
  if (!ids.length || !process.env.CLOUDINARY_API_SECRET) return;

  await Promise.all(
    ids.map(id =>
      cloudinary.uploader
        .destroy(id)
        .catch(err => console.error(`Failed to delete Cloudinary asset ${id}:`, err))
    )
  );
}

/** Returns an error message if a field is over its cap, otherwise null. */
function tooLong(value: unknown, max: number, label: string) {
  return typeof value === 'string' && value.length > max
    ? `${label} must be ${max} characters or fewer`
    : null;
}

/**
 * Total unread messages across every conversation someone is in.
 *
 * Shared by the REST endpoint the nav calls once on load and by the socket
 * push below, so the badge can never disagree with itself depending on which
 * path produced the number.
 */
async function unreadMessageCount(userId: string) {
  const candidates = await prisma.conversation.findMany({
    where: { participant_ids: { contains: userId } },
    select: { id: true, participant_ids: true },
  });
  // 'contains' is a substring match on a joined string, so re-check exactly.
  const ids = candidates
    .filter(c => c.participant_ids.split(',').includes(userId))
    .map(c => c.id);
  if (!ids.length) return 0;

  return prisma.message.count({
    where: { conversation_id: { in: ids }, sender_id: { not: userId }, read_at: null },
  });
}

/** True only if userId is an exact member of the conversation's participant list. */
async function isParticipant(conversationId: string, userId: string) {
  if (!conversationId) return false;
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  return !!conversation && conversation.participant_ids.split(',').includes(userId);
}

/**
 * Socket.IO equivalent of requireAuth. Runs once at handshake; the resolved user
 * is stashed on socket.data so individual events never trust client-sent ids.
 */
const authenticateSocket = async (socket: any, next: (err?: Error) => void) => {
  if (!supabaseAuth) return next(new Error('Authentication is not configured'));

  const token = socket.handshake?.auth?.token;
  if (!token) return next(new Error('Missing access token'));

  try {
    let authUser = cachedUserFor(token);
    if (!authUser) {
      const { data, error } = await supabaseAuth.auth.getUser(token);
      if (error || !data?.user) return next(new Error('Invalid or expired token'));
      authUser = data.user;
      cacheVerifiedUser(token, authUser);
    }
    const dbUser = await getOrCreateDbUser(authUser);
    if (dbUser.is_banned) return next(new Error('This account has been suspended'));
    socket.data.user = dbUser;
    next();
  } catch (err) {
    console.error('Socket token verification failed:', err);
    next(new Error('Invalid or expired token'));
  }
};

async function startServer() {

  const app = express();
  const httpServer = createServer(app);

  // Same origin policy as the REST API below: locked to CORS_ORIGIN when it is
  // set, open otherwise so local dev and preview deploys keep working. Note
  // that the handshake still requires a valid token either way - this is
  // defence in depth, not the actual gate.
  const socketOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: socketOrigins.length ? socketOrigins : '*',
      methods: ["GET", "POST"]
    }
  });

  const PORT = Number(process.env.PORT) || 3000;

  // Security Middleware
  const isProduction = process.env.NODE_ENV === 'production';

  /**
   * Content-Security-Policy, in report-only mode unless explicitly enforced.
   *
   * A wrong CSP is a white screen, and this one cannot be verified from a
   * terminal - only a browser enforces it. So it ships as Report-Only: the
   * browser reports what *would* have been blocked without blocking anything.
   * Check the console against a real deploy, then set CSP_ENFORCE=true.
   *
   * Left off entirely in dev, where Vite needs inline scripts and eval.
   */
  const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    // framer-motion animates through inline style attributes; the Google
    // Fonts stylesheet is linked from index.html.
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    // Map tiles, Cloudinary uploads and OAuth avatars come from many hosts;
    // images are the lowest-risk resource type to allow broadly.
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    connectSrc: [
      "'self'",
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://api.cloudinary.com',
      'https://res.cloudinary.com',
      'https://nominatim.openstreetmap.org',
    ],
    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
  };

  app.use(helmet({
    contentSecurityPolicy: isProduction
      ? { directives: cspDirectives, reportOnly: process.env.CSP_ENFORCE !== 'true' }
      : false, // Vite's dev server needs inline scripts and eval.
  }));

  /**
   * Browsers only need to reach this API from the app's own origin. Set
   * CORS_ORIGIN (comma-separated) in production to lock it down; the default
   * stays open so local development and preview deploys keep working.
   */
  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));
  app.use(express.json());

  // Socket.io Namespaces. Both require a verified token at handshake time.
  const chatNamespace = io.of('/chat');
  chatNamespace.use(authenticateSocket);
  chatNamespace.on('connection', (socket) => {
    const me = socket.data.user;

    socket.on('join_room', async (roomId) => {
      // Joining a room grants you every message broadcast to it, so membership
      // has to be checked here and not only on the REST read path.
      if (!(await isParticipant(roomId, me.id))) {
        socket.emit('room_error', 'You are not a participant in that conversation');
        return;
      }
      socket.join(roomId);
    });

    socket.on('send_message', async (data) => {
      // sender_id is deliberately NOT read from the payload - the sender is
      // whoever authenticated at handshake.
      const { conversation_id, body, photo_url } = data || {};
      const trimmedBody = typeof body === 'string' ? body.trim() : '';
      if (!conversation_id || (!trimmedBody && !photo_url)) return;

      try {
        if (!(await isParticipant(conversation_id, me.id))) {
          socket.emit('room_error', 'You are not a participant in that conversation');
          return;
        }

        const message = await prisma.message.create({
          data: {
            conversation_id,
            sender_id: me.id,
            body: trimmedBody,
            photo_url: photo_url || null,
            type: photo_url ? 'IMAGE' : 'TEXT'
          },
          include: { sender: { select: PUBLIC_USER_SELECT } }
        });
        chatNamespace.to(conversation_id).emit('receive_message', message);

        // Notify the other participant(s) in the conversation.
        const conversation = await prisma.conversation.findUnique({ where: { id: conversation_id } });
        if (conversation) {
          const recipientIds = conversation.participant_ids.split(',').filter(id => id && id !== me.id);
          for (const recipientId of recipientIds) {
            const notification = await prisma.notification.create({
              data: {
                user_id: recipientId,
                type: 'MESSAGE',
                title: `New message from ${me.name || 'a neighbour'}`,
                body: trimmedBody
                  ? (trimmedBody.length > 120 ? `${trimmedBody.slice(0, 120)}...` : trimmedBody)
                  : 'Sent a photo',
                data: JSON.stringify({ conversation_id })
              }
            });
            notificationNamespace.to(recipientId).emit('notification', notification);
          }
        }
      } catch (err) {
        console.error('Failed to save message:', err);
      }
    });

    // Marks every message the caller received (not sent) in this conversation
    // as read, and tells the room so the sender's checkmarks can update live.
    socket.on('mark_read', async (conversationId: string) => {
      if (!(await isParticipant(conversationId, me.id))) return;
      try {
        const { count } = await prisma.message.updateMany({
          where: { conversation_id: conversationId, sender_id: { not: me.id }, read_at: null },
          data: { read_at: new Date() },
        });
        if (count > 0) {
          chatNamespace.to(conversationId).emit('messages_read', { conversation_id: conversationId, reader_id: me.id });
          // Push the reader's new badge total instead of making the nav
          // re-query it on every navigation. Also makes the dot clear the
          // instant the thread is opened rather than on the next route change.
          notificationNamespace
            .to(me.id)
            .emit('unread_count', { count: await unreadMessageCount(me.id) });
        }
      } catch (err) {
        console.error('Failed to mark messages read:', err);
      }
    });

    socket.on('disconnect', () => {
    });
  });

  const notificationNamespace = io.of('/notifications');
  notificationNamespace.use(authenticateSocket);
  notificationNamespace.on('connection', (socket) => {
    // Room is derived from the verified identity, not a client-supplied id.
    socket.join(socket.data.user.id);
  });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Jobs API
  app.get('/api/jobs', requireAuth, async (req, res) => {
    try {
      const me = currentUser(req);
      const jobs = await prisma.job.findMany({
        // This feed is work you could actually take: not your own postings
        // (you cannot apply to those), and not jobs already assigned to
        // someone else. Your own jobs live under Account > Your Jobs.
        where: {
          status: 'OPEN',
          poster_id: { not: me.id },
        },
        include: {
          poster: { select: PUBLIC_USER_SELECT },
          photos: true,
          // Only your own application. This feed excludes your own postings,
          // so the viewer is never the poster here and jobForViewer would
          // discard everyone else's rows anyway.
          applications: { where: { helper_id: me.id } },
          _count: { select: { applications: true } },
        },
        orderBy: { created_at: 'desc' },
        take: JOB_PAGE_SIZE,
      });
      res.json(jobs.map(job => jobForViewer(job, me.id)));
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
      res.status(500).json({ error: 'Failed to fetch jobs' });
    }
  });

  app.post('/api/jobs', requireAuth, async (req, res) => {
    const {
      title,
      category,
      description,
      urgency,
      lat,
      lng,
      address,
      budget_min,
      budget_max,
      photos
    } = req.body;

    // Coordinates drive the whole board - distance labels, the map, "near me".
    // A job at 0,0 or with no coordinates at all is worse than no job, so this
    // rejects rather than silently falling back to a default like the client
    // used to. Belt and braces alongside the address confirmation in PostJob.
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const hasRealCoords =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180 &&
      // Null Island: the classic signature of a failed geocode.
      !(Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001);

    if (!hasRealCoords) {
      return res.status(400).json({ error: 'Pick a real address so neighbours can find the job' });
    }
    if (typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({ error: 'A location is required' });
    }

    // Presence first, then length. These are all NOT NULL columns, so without
    // the presence checks a missing field became a Prisma error and a 500.
    const missing =
      requiredText(title, 'A title') ??
      requiredText(description, 'A description') ??
      requiredText(category, 'A category') ??
      requiredText(urgency, 'An urgency');
    if (missing) return res.status(400).json({ error: missing });

    if (!VALID_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Pick one of the listed categories' });
    }
    if (!VALID_URGENCIES.has(urgency)) {
      return res.status(400).json({ error: 'Pick one of the listed urgency options' });
    }

    const lengthError =
      tooLong(title, TITLE_MAX, 'The title') ??
      tooLong(description, DESCRIPTION_MAX, 'The description') ??
      tooLong(address, ADDRESS_MAX, 'The address');
    if (lengthError) return res.status(400).json({ error: lengthError });

    const budget = parseBudget(budget_min, budget_max);
    if (budget.error) return res.status(400).json({ error: budget.error });

    const photoError = validatePhotos(photos);
    if (photoError) return res.status(400).json({ error: photoError });

    try {
      // The poster is whoever holds the token. A poster_id in the body is ignored.
      const user = currentUser(req);

      const job = await prisma.job.create({
        data: {
          poster_id: user.id,
          title: title.trim(),
          category,
          description: description.trim(),
          urgency,
          lat: latitude,
          lng: longitude,
          address: address.trim(),
          budget_min: budget.min,
          budget_max: budget.max,
          photos: {
            create: (photos || []).map((url: string, index: number) => ({
              url,
              order: index
            }))
          }
        },
        include: { photos: true, poster: { select: PUBLIC_USER_SELECT } }
      });

      res.status(201).json(job);
    } catch (err) {
      console.error('CRITICAL: Failed to create job:', err);
      res.status(500).json({ error: 'Failed to create job' });
    }
  });

  // Declared before '/api/jobs/:id' on purpose - otherwise Express matches
  // this path with id === 'mine'.
  /**
   * Jobs you have applied to - the helper's mirror of /api/jobs/mine.
   *
   * This exists because the browse feed only lists OPEN jobs that are not
   * yours, so the moment you are hired the job disappears from it: the one
   * listing that matters most to you becomes the one you cannot find. Includes
   * every status, so declined and assigned work stays visible too.
   *
   * Runs through jobForViewer, which is what reveals the exact address once
   * your application is ACCEPTED.
   */
  app.get('/api/jobs/applied', requireAuth, async (req, res) => {
    try {
      const me = currentUser(req);
      const jobs = await prisma.job.findMany({
        where: { applications: { some: { helper_id: me.id } } },
        include: {
          poster: { select: PUBLIC_USER_SELECT },
          photos: true,
          applications: true,
          // Only your own review, so the client can tell "leave a review" from
          // "already reviewed" without leaking what the other person wrote.
          reviews: { where: { reviewer_id: me.id }, select: { id: true, rating: true } },
        },
        orderBy: { created_at: 'desc' },
        take: JOB_PAGE_SIZE,
      });
      res.json(jobs.map(job => jobForViewer(job, me.id)));
    } catch (err) {
      console.error('Failed to fetch applied jobs:', err);
      res.status(500).json({ error: 'Failed to fetch your applications' });
    }
  });

  app.get('/api/jobs/mine', requireAuth, async (req, res) => {
    try {
      const me = currentUser(req);
      const jobs = await prisma.job.findMany({
        where: { poster_id: me.id, status: { not: 'CANCELLED' } },
        include: {
          photos: true,
          applications: {
            include: { helper: { select: PUBLIC_USER_SELECT } },
            orderBy: { created_at: 'asc' },
          },
          reviews: { where: { reviewer_id: me.id }, select: { id: true, rating: true } },
        },
        orderBy: { created_at: 'desc' },
        take: JOB_PAGE_SIZE,
      });
      // Already the poster, so jobForViewer would return these unchanged.
      res.json(jobs);
    } catch (err) {
      console.error('Failed to fetch own jobs:', err);
      res.status(500).json({ error: 'Failed to fetch your jobs' });
    }
  });

  /**
   * Remove a job you posted.
   *
   * Deletes outright only when nobody else is involved yet. Once someone has
   * applied, other people have put time into this - and there may be messages,
   * payments or reviews hanging off it - so the job is cancelled instead of
   * erased. Cancelled jobs drop out of every feed, so it looks like a delete
   * to the poster while preserving the other side's history.
   */
  /**
   * Edit a job you posted.
   *
   * Title, description, category, urgency and photos are always editable. The
   * budget and the location are not, once anyone has applied: people bid
   * against a stated price and applied because of where it was, so quietly
   * moving either invalidates their offer. Delete works the same way.
   */
  app.patch('/api/jobs/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const me = currentUser(req);

      const job = await prisma.job.findUnique({
        where: { id },
        include: { _count: { select: { applications: true } } },
      });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.poster_id !== me.id) {
        return res.status(403).json({ error: 'You can only edit jobs you posted' });
      }
      if (job.status !== 'OPEN') {
        return res.status(409).json({ error: 'This job is no longer open, so it cannot be edited' });
      }

      const { title, description, category, urgency, photos } = req.body;

      const lengthError =
        tooLong(title, TITLE_MAX, 'The title') ??
        tooLong(description, DESCRIPTION_MAX, 'The description') ??
        tooLong(req.body.address, ADDRESS_MAX, 'The address');
      if (lengthError) return res.status(400).json({ error: lengthError });

      const data: Record<string, unknown> = {};

      if (typeof title === 'string') {
        if (!title.trim()) return res.status(400).json({ error: 'A title is required' });
        data.title = title.trim();
      }
      if (typeof description === 'string') data.description = description.trim();
      if (category !== undefined) {
        // Same whitelist as creation - an edit is not a way around it.
        if (!VALID_CATEGORIES.has(category)) {
          return res.status(400).json({ error: 'Pick one of the listed categories' });
        }
        data.category = category;
      }
      if (urgency !== undefined) {
        if (!VALID_URGENCIES.has(urgency)) {
          return res.status(400).json({ error: 'Pick one of the listed urgency options' });
        }
        data.urgency = urgency;
      }

      const locked = job._count.applications > 0;
      const wantsBudget = req.body.budget_min !== undefined || req.body.budget_max !== undefined;
      const wantsMove = req.body.lat !== undefined || req.body.lng !== undefined ||
        req.body.address !== undefined;

      if (locked && (wantsBudget || wantsMove)) {
        return res.status(409).json({
          error: 'People have already applied, so the budget and location are fixed. Delete and repost to change them.',
        });
      }

      if (wantsBudget) {
        const budget = parseBudget(req.body.budget_min, req.body.budget_max);
        if (budget.error) return res.status(400).json({ error: budget.error });
        data.budget_min = budget.min;
        data.budget_max = budget.max;
      }

      if (wantsMove) {
        // Same guard as creation: a job at 0,0 breaks every distance on the board.
        const latitude = parseFloat(req.body.lat);
        const longitude = parseFloat(req.body.lng);
        const realCoords =
          Number.isFinite(latitude) && Number.isFinite(longitude) &&
          Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
          !(Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001);

        if (!realCoords || typeof req.body.address !== 'string' || !req.body.address.trim()) {
          return res.status(400).json({ error: 'Pick a real address so neighbours can find the job' });
        }
        data.lat = latitude;
        data.lng = longitude;
        data.address = req.body.address;
      }

      const photoError = validatePhotos(photos);
      if (photoError) return res.status(400).json({ error: photoError });

      // Photos are their own rows, so a change means replacing the set.
      const replacePhotos = Array.isArray(photos);

      // Whatever the edit drops is orphaned in Cloudinary otherwise. Compare
      // against the incoming list so a photo that was kept is not deleted.
      const removedPhotos = replacePhotos
        ? (await prisma.jobPhoto.findMany({ where: { job_id: id }, select: { url: true } }))
            .map(p => p.url)
            .filter(url => !photos.includes(url))
        : [];

      const [updated] = await prisma.$transaction([
        prisma.job.update({ where: { id }, data }),
        ...(replacePhotos
          ? [
              prisma.jobPhoto.deleteMany({ where: { job_id: id } }),
              prisma.jobPhoto.createMany({
                data: photos.map((url: string, order: number) => ({ job_id: id, url, order })),
              }),
            ]
          : []),
      ]);

      await destroyCloudinaryImages(removedPhotos);

      res.json(updated);
    } catch (err) {
      console.error('Failed to update job:', err);
      res.status(500).json({ error: 'Failed to update this job' });
    }
  });

  app.delete('/api/jobs/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const me = currentUser(req);

      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          _count: { select: { applications: true, payments: true, reviews: true } },
        },
      });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.poster_id !== me.id) {
        return res.status(403).json({ error: 'You can only delete jobs you posted' });
      }

      const hasHistory =
        job._count.applications > 0 || job._count.payments > 0 || job._count.reviews > 0;

      if (hasHistory) {
        await prisma.job.update({ where: { id }, data: { status: 'CANCELLED' } });
        return res.json({ deleted: false, cancelled: true });
      }

      // Read the URLs before the rows go, since that is the only record of
      // what this job had in Cloudinary.
      const photos = await prisma.jobPhoto.findMany({
        where: { job_id: id },
        select: { url: true },
      });

      // Photos have a required relation, so they must go first. Conversations
      // reference the job optionally and are detached by the database.
      await prisma.$transaction([
        prisma.jobPhoto.deleteMany({ where: { job_id: id } }),
        prisma.job.delete({ where: { id } }),
      ]);

      // Only after the rows are actually gone: destroying first would lose the
      // images for a delete that then failed.
      await destroyCloudinaryImages(photos.map(p => p.url));

      res.json({ deleted: true, cancelled: false });
    } catch (err) {
      console.error('Failed to delete job:', err);
      res.status(500).json({ error: 'Failed to delete this job' });
    }
  });

  /**
   * The poster marks the work finished. This is what closes the loop: until a
   * job is COMPLETED nobody can review anyone, so reputation cannot start.
   * Only the poster can call it - the helper saying "I am done" is a different
   * claim, and letting them set it would make every rating self-served.
   */
  app.post('/api/jobs/:id/complete', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const me = currentUser(req);
      const job = await prisma.job.findUnique({
        where: { id },
        include: { applications: true },
      });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.poster_id !== me.id) {
        return res
          .status(403)
          .json({ error: 'Only the person who posted this job can mark it complete' });
      }
      // Idempotent, like accepting an application twice.
      if (job.status === 'COMPLETED') return res.json({ job });
      if (job.status !== 'ASSIGNED') {
        return res
          .status(409)
          .json({ error: 'Only a job with someone hired can be marked complete' });
      }

      const updated = await prisma.job.update({
        where: { id },
        data: { status: 'COMPLETED' },
      });

      const parties = jobCounterparties(job);
      if (parties) {
        const notification = await prisma.notification.create({
          data: {
            user_id: parties.helperId,
            type: 'JOB_COMPLETED',
            title: 'Job marked complete',
            body: `${me.name || 'The poster'} marked this job as done. Leave them a review.`,
            data: JSON.stringify({ job_id: id }),
          },
        });
        notificationNamespace.to(parties.helperId).emit('notification', notification);
      }

      res.json({ job: updated });
    } catch (err) {
      console.error('Failed to complete job:', err);
      res.status(500).json({ error: 'Failed to mark this job complete' });
    }
  });

  /**
   * A review of the other party on a finished job. One per person per job, and
   * only between the two people who actually worked together - otherwise a
   * rating is just something strangers can write about you.
   */
  app.post('/api/jobs/:id/reviews', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { rating, body } = req.body;

    const score = Number(rating);
    if (!Number.isInteger(score) || score < RATING_MIN || score > RATING_MAX) {
      return res
        .status(400)
        .json({ error: `Give a rating from ${RATING_MIN} to ${RATING_MAX} stars` });
    }
    const lengthError = tooLong(body, REVIEW_MAX, 'Your review');
    if (lengthError) return res.status(400).json({ error: lengthError });

    try {
      const me = currentUser(req);
      const job = await prisma.job.findUnique({
        where: { id },
        include: { applications: true },
      });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.status !== 'COMPLETED') {
        return res.status(409).json({ error: 'You can review once the job is marked complete' });
      }

      const parties = jobCounterparties(job);
      if (!parties) {
        return res.status(409).json({ error: 'Nobody was hired for this job' });
      }
      // You review the other one. Anyone who is neither was not involved.
      const revieweeId =
        me.id === parties.posterId
          ? parties.helperId
          : me.id === parties.helperId
            ? parties.posterId
            : null;
      if (!revieweeId) {
        return res.status(403).json({ error: 'Only the two people on this job can review it' });
      }

      const review = await prisma.review.create({
        data: {
          job_id: id,
          reviewer_id: me.id,
          reviewee_id: revieweeId,
          rating: score,
          body: typeof body === 'string' ? body.trim() : '',
          // Published on write. The column exists for a future double-blind
          // scheme (hold both until each side has written one), but nothing
          // reads it yet, and a review that never appears is worse than none.
          is_published: true,
        },
      });

      const notification = await prisma.notification.create({
        data: {
          user_id: revieweeId,
          type: 'REVIEW',
          title: 'You got a review',
          body: `${me.name || 'A neighbour'} left you ${score} star${score === 1 ? '' : 's'}`,
          data: JSON.stringify({ job_id: id }),
        },
      });
      notificationNamespace.to(revieweeId).emit('notification', notification);

      res.status(201).json({ review });
    } catch (err: any) {
      // @@unique([job_id, reviewer_id]) enforces one review per person per
      // job, so a duplicate lands here rather than needing a read first.
      if (err?.code === 'P2002') {
        return res.status(409).json({ error: 'You have already reviewed this job' });
      }
      console.error('Failed to create review:', err);
      res.status(500).json({ error: 'Failed to save your review' });
    }
  });

  /** Published reviews written about someone, newest first. */
  app.get('/api/users/:id/reviews', requireAuth, async (req, res) => {
    try {
      const reviews = await prisma.review.findMany({
        where: { reviewee_id: req.params.id, is_published: true },
        include: {
          reviewer: { select: PUBLIC_USER_SELECT },
          job: { select: { id: true, title: true, category: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      });
      res.json(reviews);
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
      res.status(500).json({ error: 'Failed to fetch reviews' });
    }
  });

  app.get('/api/jobs/:id/applications', requireAuth, async (req, res) => {
    try {
      const me = currentUser(req);
      const job = await prisma.job.findUnique({ where: { id: req.params.id } });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.poster_id !== me.id) {
        return res.status(403).json({ error: 'Only the poster can see who applied' });
      }

      const applications = await prisma.application.findMany({
        where: { job_id: req.params.id },
        include: { helper: { select: PUBLIC_USER_SELECT } },
        orderBy: { created_at: 'asc' },
      });
      res.json(applications);
    } catch (err) {
      console.error('Failed to fetch applications:', err);
      res.status(500).json({ error: 'Failed to fetch applications' });
    }
  });

  /**
   * The poster hires one applicant. This is what flips a job from OPEN to
   * ASSIGNED, and what unlocks the exact address for that helper - see
   * jobForViewer.
   */
  app.post('/api/jobs/:id/applications/:applicationId/accept', requireAuth, async (req, res) => {
    const { id: job_id, applicationId } = req.params;
    try {
      const me = currentUser(req);

      const job = await prisma.job.findUnique({ where: { id: job_id } });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.poster_id !== me.id) {
        return res.status(403).json({ error: 'Only the person who posted this job can accept an application' });
      }

      const application = await prisma.application.findUnique({ where: { id: applicationId } });
      if (!application || application.job_id !== job_id) {
        return res.status(404).json({ error: 'Application not found for this job' });
      }

      // Idempotent: accepting the same person twice is not an error.
      if (application.status === 'ACCEPTED') {
        return res.json({ application });
      }
      if (job.status !== 'OPEN') {
        return res.status(409).json({ error: 'This job already has someone assigned' });
      }

      // One transaction, so a job can never end up assigned with two accepted
      // applications if two requests land at once.
      const [accepted] = await prisma.$transaction([
        prisma.application.update({
          where: { id: applicationId },
          data: { status: 'ACCEPTED' },
        }),
        prisma.application.updateMany({
          where: { job_id, id: { not: applicationId } },
          data: { status: 'REJECTED' },
        }),
        prisma.job.update({ where: { id: job_id }, data: { status: 'ASSIGNED' } }),
      ]);

      // Let the hired helper know. Everyone else who applied just sees their
      // status flip to REJECTED next time they look, which needs no push.
      const sortedIds = [application.helper_id, job.poster_id].sort().join(',');
      const conversation = await prisma.conversation.findFirst({
        where: { job_id, participant_ids: sortedIds },
      });
      const notification = await prisma.notification.create({
        data: {
          user_id: application.helper_id,
          type: 'HIRED',
          title: "You're hired!",
          body: `${me.name || 'The poster'} accepted your application for "${job.title}"`,
          data: JSON.stringify({ job_id, conversation_id: conversation?.id })
        }
      });
      notificationNamespace.to(application.helper_id).emit('notification', notification);

      res.json({ application: accepted });
    } catch (err) {
      console.error('Failed to accept application:', err);
      res.status(500).json({ error: 'Failed to accept application' });
    }
  });

  app.get('/api/jobs/:id', requireAuth, async (req, res) => {
    try {
      const job = await prisma.job.findUnique({
        where: { id: req.params.id },
        include: {
          poster: { select: PUBLIC_USER_SELECT },
          photos: true,
          applications: {
            include: { helper: { select: PUBLIC_USER_SELECT } }
          }
        }
      });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      res.json(jobForViewer(job, currentUser(req).id));
    } catch (err) {
      console.error('Failed to fetch job:', err);
      res.status(500).json({ error: 'Failed to fetch job' });
    }
  });

  // Users API
  // Deliberately lean: requireAuth has already resolved this row, so this
  // route just returns it. It's called on nearly every screen (profile
  // completeness checks, "who am I" before starting a chat, the sidebar) -
  // the aggregate stats below used to run here too, which meant three extra
  // queries on every one of those calls even though only the Account page
  // ever displays them. Those live at /api/users/me/stats now, fetched once
  // by the one screen that needs them.
  app.get('/api/users/me', requireAuth, async (req, res) => {
    res.json(currentUser(req));
  });

  app.get('/api/users/me/stats', requireAuth, async (req, res) => {
    try {
      const user = currentUser(req);
      const [jobs_posted_count, reviews_count, ratingAgg] = await Promise.all([
        prisma.job.count({ where: { poster_id: user.id } }),
        prisma.review.count({ where: { reviewee_id: user.id } }),
        prisma.review.aggregate({ where: { reviewee_id: user.id }, _avg: { rating: true } })
      ]);
      res.json({ jobs_posted_count, reviews_count, avg_rating: ratingAgg._avg.rating });
    } catch (err) {
      console.error('Failed to fetch user stats:', err);
      res.status(500).json({ error: 'Failed to fetch user stats' });
    }
  });

  app.post('/api/users/profile', requireAuth, async (req, res) => {
    // Identity comes from the token; only profile fields are taken from the body.
    const authUser = authed(req);
    const { first_name, last_name, neighbourhood, avatar_url, bio } = req.body;

    const first = typeof first_name === 'string' ? first_name.trim() : '';
    const last = typeof last_name === 'string' ? last_name.trim() : '';

    if (!first) {
      return res.status(400).json({ error: 'First name is required' });
    }

    const name = publicDisplayName(first, last);

    try {
      const user = await prisma.user.upsert({
        where: { supabase_uid: authUser.id },
        update: { first_name: first, last_name: last || null, name, neighbourhood, avatar_url, bio },
        create: {
          supabase_uid: authUser.id,
          email: authUser.email || `user_${authUser.id.slice(0, 8)}@example.com`,
          first_name: first,
          last_name: last || null,
          name,
          neighbourhood,
          avatar_url,
          bio
        },
      });
      res.json(user);
    } catch (err) {
      console.error('Profile update failed:', err);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Notifications API
  app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
      const user = currentUser(req);
      const notifications = await prisma.notification.findMany({
        where: { user_id: user.id },
        orderBy: { created_at: 'desc' },
        take: NOTIFICATION_PAGE_SIZE,
      });
      res.json(notifications);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
    try {
      const user = currentUser(req);

      // Ownership must be checked before mutating: without this, any signed-in
      // user could mark any other user's notification as read just by guessing an id.
      const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
      if (!notification || notification.user_id !== user.id) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      const updated = await prisma.notification.update({
        where: { id: req.params.id },
        data: { read_at: new Date() }
      });
      res.json(updated);
    } catch (err) {
      console.error('Failed to mark notification read:', err);
      res.status(500).json({ error: 'Failed to mark notification read' });
    }
  });

  // Conversations & Messages API
  app.get('/api/conversations', requireAuth, async (req, res) => {
    try {
      const user = currentUser(req);

      // 'contains' narrows in the DB, but it is a substring match on a joined
      // string, so the exact membership filter below is what actually decides.
      const candidates = await prisma.conversation.findMany({
        where: {
          participant_ids: {
            contains: user.id
          }
        },
        include: {
          messages: {
            orderBy: { created_at: 'desc' },
            take: 1
          },
          job: true
        }
      });

      const conversations = candidates.filter(conv =>
        conv.participant_ids.split(',').includes(user.id)
      );

      // One grouped query for every conversation rather than a count per row.
      // Unread means: sent by the other person and never marked read.
      const unreadGroups = await prisma.message.groupBy({
        by: ['conversation_id'],
        where: {
          conversation_id: { in: conversations.map(c => c.id) },
          sender_id: { not: user.id },
          read_at: null,
        },
        _count: { _all: true },
      });
      const unreadByConversation = new Map(
        unreadGroups.map(g => [g.conversation_id, g._count._all])
      );

      // Participants are stored as a joined string, so the other person has to
      // be looked up separately - but in ONE query for the whole list. This
      // was a findUnique per conversation inside a Promise.all, i.e. a round
      // trip per row: thirty conversations meant thirty queries to draw one
      // screen.
      const otherIds = [
        ...new Set(
          conversations
            .map(conv => conv.participant_ids.split(',').find(id => id !== user.id))
            .filter((id): id is string => Boolean(id))
        ),
      ];
      const others = otherIds.length
        ? await prisma.user.findMany({
            where: { id: { in: otherIds } },
            select: PUBLIC_USER_SELECT,
          })
        : [];
      const otherById = new Map(others.map(u => [u.id, u]));

      const conversationsWithParticipants = conversations.map(conv => {
        const otherId = conv.participant_ids.split(',').find(id => id !== user.id);
        return {
          ...conv,
          otherUser: otherId ? otherById.get(otherId) ?? null : null,
          unread_count: unreadByConversation.get(conv.id) ?? 0,
        };
      });

      // Newest activity first, so a conversation someone just replied to rises
      // to the top of the list. Conversations with no messages sort by when
      // they were opened.
      conversationsWithParticipants.sort((a, b) => {
        const at = new Date(a.messages[0]?.created_at ?? a.created_at).getTime();
        const bt = new Date(b.messages[0]?.created_at ?? b.created_at).getTime();
        return bt - at;
      });

      res.json(conversationsWithParticipants);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  /**
   * Total unread messages across every conversation, for the chat dot in the
   * nav. Deliberately its own tiny endpoint: the nav is mounted on every
   * screen and must not pull the whole conversation list to draw one dot.
   */
  app.get('/api/messages/unread-count', requireAuth, async (req, res) => {
    try {
      res.json({ count: await unreadMessageCount(currentUser(req).id) });
    } catch (err) {
      console.error('Failed to count unread messages:', err);
      res.status(500).json({ error: 'Failed to count unread messages' });
    }
  });

  app.get('/api/conversations/:id/messages', requireAuth, async (req, res) => {
    try {
      const me = currentUser(req);

      // Reading a thread requires being in it.
      if (!(await isParticipant(req.params.id, me.id))) {
        return res.status(403).json({ error: 'You are not a participant in this conversation' });
      }

      // Take the newest N, then flip back to oldest-first for display. Asking
      // for the first N ascending would pin a long thread to its opening
      // messages and never show anything recent.
      const recent = await prisma.message.findMany({
        where: { conversation_id: req.params.id },
        include: { sender: { select: PUBLIC_USER_SELECT } },
        orderBy: { created_at: 'desc' },
        take: MESSAGE_PAGE_SIZE,
      });
      res.json(recent.reverse());
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.post('/api/conversations', requireAuth, async (req, res) => {
    const { job_id, participant_ids } = req.body; // participant_ids is array of strings
    if (!Array.isArray(participant_ids) || participant_ids.length < 2) {
        return res.status(400).json({ error: 'At least 2 participants required' });
    }

    try {
      // You may only open a conversation you are yourself part of.
      const me = currentUser(req);
      if (!participant_ids.includes(me.id)) {
        return res.status(403).json({ error: 'You cannot create a conversation you are not part of' });
      }

      // Sort IDs for consistent lookup
      const sortedIds = [...participant_ids].sort().join(',');

      const existing = await prisma.conversation.findFirst({
        where: {
          job_id,
          participant_ids: sortedIds
        }
      });

      if (existing) return res.json(existing);

      const conversation = await prisma.conversation.create({
        data: {
          job_id,
          participant_ids: sortedIds
        }
      });
      res.status(201).json(conversation);
    } catch (err) {
      console.error('Failed to create conversation:', err);
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  });

  // Application API
  app.post('/api/jobs/:id/apply', requireAuth, async (req, res) => {
    const { id: job_id } = req.params;
    const { message, proposed_price } = req.body;

    // A bid carries the same ceiling as a budget - it is the number the poster
    // sees on the applicant card and the one they agree to pay.
    const bid = parseFloat(String(proposed_price));
    if (!Number.isFinite(bid) || bid <= 0) {
      return res.status(400).json({ error: 'Enter a price greater than zero' });
    }
    if (bid > BUDGET_MAX) {
      return res
        .status(400)
        .json({ error: `A price cannot be more than $${BUDGET_MAX.toLocaleString('en-US')}` });
    }

    const lengthError = tooLong(message, DESCRIPTION_MAX, 'Your message');
    if (lengthError) return res.status(400).json({ error: lengthError });

    try {
      // The helper is whoever holds the token. A helper_supabase_uid in the
      // body is ignored entirely.
      const helper = currentUser(req);

      const job = await prisma.job.findUnique({ where: { id: job_id } });
      if (!job) return res.status(404).json({ error: 'Job not found' });

      if (job.poster_id === helper.id) {
          return res.status(400).json({ error: "You cannot apply for your own job!" });
      }

      // Check for existing application
      const existingApp = await prisma.application.findFirst({
          where: { job_id, helper_id: helper.id }
      });

      if (existingApp) {
          const sortedIds = [helper.id, job.poster_id].sort().join(',');
          const conversation = await prisma.conversation.findFirst({
              where: { job_id, participant_ids: sortedIds }
          });
          return res.json({ application: existingApp, conversation_id: conversation?.id });
      }

      // Create application
      const application = await prisma.application.create({
        data: {
          job_id,
          helper_id: helper.id,
          message: message || `I am interested in helping with: ${job.title}`,
          proposed_price: Math.round(bid * 100) / 100,
          status: 'PENDING'
        }
      });

      // Automatically start a conversation
      const sortedIds = [helper.id, job.poster_id].sort().join(',');

      let conversation = await prisma.conversation.findFirst({
          where: { job_id, participant_ids: sortedIds }
      });

      if (!conversation) {
          conversation = await prisma.conversation.create({
              data: { job_id, participant_ids: sortedIds }
          });
      }

      // Send initial message
      await prisma.message.create({
        data: {
            conversation_id: conversation.id,
            sender_id: helper.id,
            body: message || `Hey! I would like to help with "${job.title}".`,
            type: 'TEXT'
        }
      });

      // Notify the job poster
      const notification = await prisma.notification.create({
        data: {
          user_id: job.poster_id,
          type: 'APPLICATION',
          title: 'New applicant',
          body: `${helper.name || 'Someone'} applied to your job "${job.title}"`,
          data: JSON.stringify({ job_id, conversation_id: conversation.id })
        }
      });
      notificationNamespace.to(job.poster_id).emit('notification', notification);

      res.status(201).json({ application, conversation_id: conversation.id });
    } catch (err: any) {
      console.error('Failed to apply:', err);
      res.status(500).json({ error: 'Failed to apply' });
    }
  });

  // Reports API
  const REPORT_TARGET_TYPES = new Set(['USER', 'JOB', 'MESSAGE']);

  app.post('/api/reports', requireAuth, async (req, res) => {
    const { target_type, target_id, reason } = req.body;

    if (!REPORT_TARGET_TYPES.has(target_type) || typeof target_id !== 'string' || !target_id) {
      return res.status(400).json({ error: 'Invalid report target' });
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'A reason is required' });
    }

    try {
      const me = currentUser(req);
      const report = await prisma.report.create({
        data: {
          reporter_id: me.id,
          target_type,
          target_id,
          reason: reason.trim(),
        },
      });
      res.status(201).json(report);
    } catch (err) {
      console.error('Failed to create report:', err);
      res.status(500).json({ error: 'Failed to submit report' });
    }
  });

  // Cloudinary Signing API
  const UPLOAD_FOLDERS = new Set(['neighbourly_jobs', 'neighbourly_avatars', 'neighbourly_chat']);

  app.post('/api/uploads/sign', requireAuth, (req, res) => {
    if (!process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_CLOUD_NAME) {
      console.error('Cannot sign upload: Cloudinary credentials are missing.');
      return res.status(503).json({ error: 'Uploads are not configured on the server' });
    }

    // The signature covers whichever folder is actually used - Cloudinary
    // recomputes it over the params it receives, so a mismatch here (e.g.
    // always signing "neighbourly_jobs" while the client uploads to
    // "neighbourly_avatars") makes every non-matching upload fail silently
    // with an invalid-signature error.
    const folder = UPLOAD_FOLDERS.has(req.body?.folder) ? req.body.folder : 'neighbourly_jobs';

    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      signature,
      timestamp,
      folder,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
    });
  });

  // Last API route. Anything under /api that got here matched nothing, and
  // must not fall through to the SPA handlers below - index.html arriving
  // where JSON was expected means axios resolves happily and the caller does
  // `.map` on a string. One 404 here instead of a guard at every fetch.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Vite Middleware
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    // Only serve static files if NOT on Vercel.
    // Vercel serves the 'dist' folder automatically from its global CDN.
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return { app, httpServer, port: PORT };
}

const appPromise = startServer();

// For local development
if (process.env.NODE_ENV !== 'production') {
  appPromise.then(({ httpServer, port }) => {
    httpServer.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  });
}

export default async (req: any, res: any) => {
  const { app } = await appPromise;
  return app(req, res);
};
