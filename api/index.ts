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
    (req as AuthedRequest).authUser = data.user;
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/** Narrows a request that has already passed through requireAuth. */
function authed(req: Request): SupabaseUser {
  const user = (req as AuthedRequest).authUser;
  if (!user) {
    // Unreachable via requireAuth; guards against a route wired up without it.
    throw new Error('authed() called on a route that is not behind requireAuth');
  }
  return user;
}

/**
 * Maps a verified Supabase user onto our local User row, creating it on first
 * sight. Profile details come from the token's own claims, never from the body.
 */
async function getOrCreateDbUser(authUser: SupabaseUser) {
  const metadata = (authUser.user_metadata || {}) as Record<string, unknown>;
  const name =
    (typeof metadata.full_name === 'string' && metadata.full_name) ||
    (typeof metadata.name === 'string' && metadata.name) ||
    'Anonymous Neighbour';

  return prisma.user.upsert({
    where: { supabase_uid: authUser.id },
    update: {},
    create: {
      supabase_uid: authUser.id,
      email: authUser.email || `user_${authUser.id.slice(0, 8)}@example.com`,
      name,
      neighbourhood: 'Local area',
    },
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
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return next(new Error('Invalid or expired token'));
    socket.data.user = await getOrCreateDbUser(data.user);
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
      const { conversation_id, body } = data || {};
      if (!conversation_id || !body) return;

      try {
        if (!(await isParticipant(conversation_id, me.id))) {
          socket.emit('room_error', 'You are not a participant in that conversation');
          return;
        }

        const message = await prisma.message.create({
          data: {
            conversation_id,
            sender_id: me.id,
            body,
            type: 'TEXT'
          },
          include: { sender: true }
        });
        chatNamespace.to(conversation_id).emit('receive_message', message);

        // Notify the other participant(s) in the conversation
        const conversation = await prisma.conversation.findUnique({ where: { id: conversation_id } });
        if (conversation) {
          const recipientIds = conversation.participant_ids.split(',').filter(id => id && id !== me.id);
          for (const recipientId of recipientIds) {
            const notification = await prisma.notification.create({
              data: {
                user_id: recipientId,
                type: 'MESSAGE',
                title: `New message from ${me.name || 'a neighbour'}`,
                body: body.length > 120 ? `${body.slice(0, 120)}...` : body,
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
      const jobs = await prisma.job.findMany({
        include: {
          poster: true,
          photos: true,
          applications: true
        },
        orderBy: { created_at: 'desc' }
      });
      res.json(jobs);
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

    try {
      // The poster is whoever holds the token. A poster_id in the body is ignored.
      const user = await getOrCreateDbUser(authed(req));

      const job = await prisma.job.create({
        data: {
          poster_id: user.id,
          title,
          category,
          description,
          urgency,
          lat: parseFloat(lat) || 0,
          lng: parseFloat(lng) || 0,
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
        include: { photos: true, poster: true }
      });

      res.status(201).json(job);
    } catch (err) {
      console.error('CRITICAL: Failed to create job:', err);
      res.status(500).json({ error: 'Failed to create job' });
    }
  });

  app.get('/api/jobs/:id', requireAuth, async (req, res) => {
    try {
      const job = await prisma.job.findUnique({
        where: { id: req.params.id },
        include: {
          poster: true,
          photos: true,
          applications: {
            include: { helper: true }
          }
        }
      });
      if (!job) return res.status(404).json({ error: 'Job not found' });
      res.json(job);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch job' });
    }
  });

  // Users API
  app.get('/api/users/me', requireAuth, async (req, res) => {
    try {
      const user = await getOrCreateDbUser(authed(req));

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
    const { name, neighbourhood, avatar_url, bio } = req.body;

    try {
      const user = await prisma.user.upsert({
        where: { supabase_uid: authUser.id },
        update: { name, neighbourhood, avatar_url, bio },
        create: {
          supabase_uid: authUser.id,
          email: authUser.email || `user_${authUser.id.slice(0, 8)}@example.com`,
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

  // Conversations & Messages API
  app.get('/api/conversations', requireAuth, async (req, res) => {
    try {
      const user = await getOrCreateDbUser(authed(req));

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
        const otherUser = otherId ? await prisma.user.findUnique({ where: { id: otherId } }) : null;
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
      const me = await getOrCreateDbUser(authed(req));

      // Reading a thread requires being in it.
      if (!(await isParticipant(req.params.id, me.id))) {
        return res.status(403).json({ error: 'You are not a participant in this conversation' });
      }

      const messages = await prisma.message.findMany({
        where: { conversation_id: req.params.id },
        include: { sender: true },
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
      const me = await getOrCreateDbUser(authed(req));
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
      const helper = await getOrCreateDbUser(authed(req));

      const job = await prisma.job.findUnique({ where: { id: job_id }, include: { poster: true } });
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

  // Notifications API
  app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
      const user = await getOrCreateDbUser(authed(req));
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
      const user = await getOrCreateDbUser(authed(req));

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

  // Cloudinary Signing API
  app.post('/api/uploads/sign', requireAuth, (req, res) => {
    if (!process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_CLOUD_NAME) {
      console.error('Cannot sign upload: Cloudinary credentials are missing.');
      return res.status(503).json({ error: 'Uploads are not configured on the server' });
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder: 'neighbourly_jobs' },
      process.env.CLOUDINARY_API_SECRET
    );

    res.json({
      signature,
      timestamp,
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
