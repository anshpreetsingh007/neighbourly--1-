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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Note: Database_passwoerd has been corrected to DATABASE_URL in .env.local
const prisma = new PrismaClient();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Security Middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for development to allow Vite
  }));
  app.use(cors());
  app.use(express.json());

  // Socket.io Namespaces
  const chatNamespace = io.of('/chat');
  chatNamespace.on('connection', (socket) => {
    socket.on('join_room', (roomId) => {
      socket.join(roomId);
    });

    socket.on('send_message', async (data) => {
      const { conversation_id, sender_id, body } = data;
      try {
        // The sender_id from frontend might be a Supabase UID
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { id: sender_id },
                    { supabase_uid: sender_id }
                ]
            }
        });

        if (!user) {
            console.error('User not found for message:', sender_id);
            return;
        }

        const message = await prisma.message.create({
          data: {
            conversation_id,
            sender_id: user.id,
            body,
            type: 'TEXT'
          },
          include: { sender: true }
        });
        chatNamespace.to(conversation_id).emit('receive_message', message);
      } catch (err) {
        console.error('Failed to save message:', err);
      }
    });

    socket.on('disconnect', () => {
    });
  });

  const notificationNamespace = io.of('/notifications');
  notificationNamespace.on('connection', (socket) => {
    socket.on('join_user_room', (userId) => {
      socket.join(userId);
    });
  });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Jobs API
  app.get('/api/jobs', async (req, res) => {
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

  app.post('/api/jobs', async (req, res) => {
    console.log('Post Job Request received:', req.body);
    const { 
      poster_id, 
      title, 
      category, 
      description, 
      urgency, 
      lat, 
      lng, 
      address, 
      budget_min, 
      budget_max,
      photos,
      poster_email,
      poster_name
    } = req.body;

    try {
      // Robustly find or create the user in the database
      const user = await prisma.user.upsert({
        where: { supabase_uid: poster_id },
        update: {},
        create: {
          supabase_uid: poster_id,
          email: poster_email || `user_${poster_id.slice(0, 8)}@example.com`,
          name: poster_name || 'Anonymous Neighbour',
          neighbourhood: address?.split(',').slice(-2, -1)[0]?.trim() || 'Local area'
        }
      });

      console.log('User synced for job posting:', user.id);

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
      
      console.log('Job created successfully:', job.id);
      res.status(201).json(job);
    } catch (err) {
      console.error('CRITICAL: Failed to create job:', err);
      res.status(500).json({ error: 'Failed to create job' });
    }
  });

  app.get('/api/jobs/:id', async (req, res) => {
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
  app.get('/api/users/me', async (req, res) => {
    const supabase_uid = req.headers['x-supabase-uid'] as string;
    
    if (!supabase_uid) {
      return res.json({ id: '1', name: 'Guest', email: 'guest@example.com' });
    }

    try {
      let user = await prisma.user.findUnique({
        where: { supabase_uid }
      });

      // If user doesn't exist in our DB yet, create a skeleton record
      if (!user) {
          user = await prisma.user.create({
              data: {
                  supabase_uid,
                  email: `user_${supabase_uid.slice(0, 8)}@example.com`, // Placeholder email
                  name: 'Anonymous Neighbour',
                  neighbourhood: 'New Area'
              }
          });
          console.log('Created new user record for synced session:', user.id);
      }

      res.json(user);
    } catch (err) {
      console.error('Failed to fetch/sync user:', err);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  app.post('/api/users/profile', async (req, res) => {
    const { supabase_uid, email, name, neighbourhood, avatar_url } = req.body;
    
    try {
      const user = await prisma.user.upsert({
        where: { supabase_uid },
        update: { name, neighbourhood, avatar_url },
        create: { 
          supabase_uid, 
          email, 
          name, 
          neighbourhood, 
          avatar_url 
        },
      });
      res.json(user);
    } catch (err) {
      console.error('Profile update failed:', err);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // Conversations & Messages API
  app.get('/api/conversations', async (req, res) => {
    const supabase_uid = req.headers['x-supabase-uid'] as string;
    if (!supabase_uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const user = await prisma.user.findUnique({ where: { supabase_uid } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      // In SQLite, we use 'contains' on the string field
      const conversations = await prisma.conversation.findMany({
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

      // Fetch participants for each conversation manually since they are stored as a string
      const conversationsWithParticipants = await Promise.all(conversations.map(async (conv) => {
        const pIds = conv.participant_ids.split(',');
        const otherId = pIds.find(id => id !== user.id);
        const otherUser = otherId ? await prisma.user.findUnique({ where: { id: otherId } }) : null;
        return { ...conv, otherUser };
      }));

      res.json(conversationsWithParticipants);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/conversations/:id/messages', async (req, res) => {
    try {
      const messages = await prisma.message.findMany({
        where: { conversation_id: req.params.id },
        include: { sender: true },
        orderBy: { created_at: 'asc' }
      });
      res.json(messages);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.post('/api/conversations', async (req, res) => {
    const { job_id, participant_ids } = req.body; // participant_ids is array of strings
    if (!participant_ids || participant_ids.length < 2) {
        return res.status(400).json({ error: 'At least 2 participants required' });
    }

    // Sort IDs for consistent lookup
    const sortedIds = [...participant_ids].sort().join(',');

    try {
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
  app.post('/api/jobs/:id/apply', async (req, res) => {
    const { id: job_id } = req.params;
    const { helper_supabase_uid, message, proposed_price } = req.body;

    console.log(`Apply request: Job ${job_id} from ${helper_supabase_uid}`);

    try {
      // Ensure helper exists in DB
      const helper = await prisma.user.upsert({
          where: { supabase_uid: helper_supabase_uid },
          update: {},
          create: {
              supabase_uid: helper_supabase_uid,
              email: `user_${helper_supabase_uid.slice(0, 8)}@example.com`,
              name: 'Anonymous Neighbour',
              neighbourhood: 'Local area'
          }
      });

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
          console.log('User already applied, returning existing conversation:', conversation?.id);
          return res.json({ application: existingApp, conversation_id: conversation?.id });
      }

      // Create application
      const application = await prisma.application.create({
        data: {
          job_id,
          helper_id: helper.id,
          message: message || `I'm interested in helping with: ${job.title}`,
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
          console.log('Created new conversation for application:', conversation.id);
      } else {
          console.log('Using existing conversation for application:', conversation.id);
      }

      // Send initial message
      await prisma.message.create({
        data: {
            conversation_id: conversation.id,
            sender_id: helper.id,
            body: message || `Hey! I'd like to help with "${job.title}".`,
            type: 'TEXT'
        }
      });

      res.status(201).json({ application, conversation_id: conversation.id });
    } catch (err: any) {
      console.error('Failed to apply:', err);
      res.status(500).json({ error: err.message || 'Failed to apply' });
    }
  });

  // Cloudinary Signing API
  app.post('/api/uploads/sign', (req, res) => {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder: 'neighbourly_jobs' },
      process.env.CLOUDINARY_API_SECRET!
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

  return app;
}

const appPromise = startServer();

// For local development
if (process.env.NODE_ENV !== 'production') {
  appPromise.then(app => {
    app.listen(3000, () => {
      console.log(`Server running on http://localhost:3000`);
    });
  });
}

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
