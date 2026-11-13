import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config.js';
import { authRouter } from './routes/auth.routes.js';
import { teamRouter } from './routes/team.routes.js';
import { choreRouter } from './routes/chore.routes.js';
import { sessionRouter } from './routes/session.routes.js';
import { piggybankRouter } from './routes/piggybank.routes.js';
import { shoppingRouter } from './routes/shopping.routes.js';
import { savingsRouter } from './routes/savings.routes.js';
import { notificationRouter } from './routes/notification.routes.js';
import { uploadRouter } from './routes/upload.routes.js';
import { chatRouter } from './routes/chat.routes.js';
import { expireUnstartedApprovals } from './utils/choreExpiry.js';

const app = express();

// Middlewares
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://chore-tracker-one-gamma.vercel.app',
    config.frontendUrl
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Explicitly handle all preflight OPTIONS requests
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Static file serving for uploaded photos
const uploadsDir = path.resolve(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Chore Manager API',
    currency: 'EUR (€)',
  });
});

// Mount Routes
app.use('/api/auth', authRouter);
app.use('/api/teams', teamRouter);
app.use('/api/chores', choreRouter);
app.use('/api/sessions', sessionRouter);
app.use('/api/piggybank', piggybankRouter);
app.use('/api/shopping', shoppingRouter);
app.use('/api/savings', savingsRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/chat', chatRouter);
app.use('/api/upload', uploadRouter);

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

// Start Server
app.listen(config.port, () => {
  console.log(`[Chore Manager Server] Listening on http://localhost:${config.port}`);
  console.log(`[Environment] Mode: ${config.nodeEnv}`);
});

// Release approved chores that were not started within 48 hours.
setInterval(() => { void expireUnstartedApprovals().catch((error) => console.error('[Chore expiry] Background check failed.', error)); }, 60_000).unref();

export default app;
