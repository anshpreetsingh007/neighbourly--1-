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
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Resolve the local row once here so every route shares it, and so a ban is
    // enforced on every authenticated path - including /api/uploads/sign, which
    // does not otherwise need a DB user.
    const dbUser = await getOrCreateDbUser(data.user);
    if (dbUser.is_banned) {
      return res.status(403).json({ error: 'This account has been suspended' });
    }

    (req as AuthedRequest).authUser = data.user;
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
  neighbourhood: true,
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
  const isPoster = job.poster_id === viewerId;
  const all = job.applications || [];
  const mine = all.find((a: any) => a.helper_id === viewerId);
  const isAcceptedHelper = mine?.status === 'ACCEPTED';

  // Who else applied, and what they bid, is the poster's business alone.
  // Everyone else sees only their own application plus a count.
  const base = {
    ...job,
    applications: isPoster ? all : mine ? [mine] : [],
    application_count: all.length,
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
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return next(new Error('Invalid or expired token'));
    const dbUser = await getOrCreateDbUser(data.user);
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
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = Number(process.env.PORT) || 3000;

  // Security Middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for development to allow Vite
  }));
  app.use(cors());
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
          applications: true
        },
        orderBy: { created_at: 'desc' }
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

    try {
      // The poster is whoever holds the token. A poster_id in the body is ignored.
      const user = currentUser(req);

      const job = await prisma.job.create({
        data: {
          poster_id: user.id,
          title,
          category,
          description,
          urgency,
          lat: latitude,
          lng: longitude,
          address,
          budget_min: parseFloat(budget_min) || 0,
          budget_max: parseFloat(budget_max) || 0,
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
        },
        orderBy: { created_at: 'desc' },
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
      const data: Record<string, unknown> = {};

      if (typeof title === 'string') {
        if (!title.trim()) return res.status(400).json({ error: 'A title is required' });
        data.title = title.trim();
      }
      if (typeof description === 'string') data.description = description;
      if (typeof category === 'string' && category) data.category = category;
      if (typeof urgency === 'string' && urgency) data.urgency = urgency;

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
        const min = parseFloat(req.body.budget_min);
        const max = parseFloat(req.body.budget_max);
        if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
          return res.status(400).json({ error: 'Enter a valid budget range' });
        }
        data.budget_min = min;
        data.budget_max = max;
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

      // Photos are their own rows, so a change means replacing the set.
      const replacePhotos = Array.isArray(photos);

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

      // Photos have a required relation, so they must go first. Conversations
      // reference the job optionally and are detached by the database.
      await prisma.$transaction([
        prisma.jobPhoto.deleteMany({ where: { job_id: id } }),
        prisma.job.delete({ where: { id } }),
      ]);
      res.json({ deleted: true, cancelled: false });
    } catch (err) {
      console.error('Failed to delete job:', err);
      res.status(500).json({ error: 'Failed to delete this job' });
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
  app.get('/api/users/me', requireAuth, async (req, res) => {
    try {
      const user = currentUser(req);

      const [jobs_posted_count, reviews_count, ratingAgg] = await Promise.all([
        prisma.job.count({ where: { poster_id: user.id } }),
        prisma.review.count({ where: { reviewee_id: user.id } }),
        prisma.review.aggregate({ where: { reviewee_id: user.id }, _avg: { rating: true } })
      ]);

      res.json({
        ...user,
        jobs_posted_count,
        reviews_count,
        avg_rating: ratingAgg._avg.rating
      });
    } catch (err) {
      console.error('Failed to fetch/sync user:', err);
      res.status(500).json({ error: 'Failed to fetch user' });
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
        orderBy: { created_at: 'desc' }
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

      // Fetch participants for each conversation manually since they are stored as a string
      const conversationsWithParticipants = await Promise.all(conversations.map(async (conv) => {
        const pIds = conv.participant_ids.split(',');
        const otherId = pIds.find(id => id !== user.id);
        const otherUser = otherId
          ? await prisma.user.findUnique({ where: { id: otherId }, select: PUBLIC_USER_SELECT })
          : null;
        return { ...conv, otherUser };
      }));

      res.json(conversationsWithParticipants);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/conversations/:id/messages', requireAuth, async (req, res) => {
    try {
      const me = currentUser(req);

      // Reading a thread requires being in it.
      if (!(await isParticipant(req.params.id, me.id))) {
        return res.status(403).json({ error: 'You are not a participant in this conversation' });
      }

      const messages = await prisma.message.findMany({
        where: { conversation_id: req.params.id },
        include: { sender: { select: PUBLIC_USER_SELECT } },
        orderBy: { created_at: 'asc' }
      });
      res.json(messages);
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
          proposed_price: parseFloat(proposed_price) || job.budget_min,
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
