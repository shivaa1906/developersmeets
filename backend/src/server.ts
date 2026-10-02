import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import { env } from './config/environment.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { realtimeServer } from './realtime/realtimeServer.js';
import authRoutes from './routes/authRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import creditRoutes from './routes/creditRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import supportRoutes from './routes/supportRoutes.js';
import developerRoutes from './routes/developerRoutes.js';
import communityRoutes from './routes/communityRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import { LEADERSHIP } from './config/constants.js';
import { apiRateLimiter } from './middlewares/rateLimiter.js';

import { runMigrations } from './database/migrate.js';

const app = express();

// Security & utility middlewares: CSP, strict headers, frameguard, and CORS
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'sameorigin' },
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts:
      env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
  })
);

const allowedOrigins = [env.CORS_ORIGIN, 'http://localhost:3000', 'http://127.0.0.1:3000'].filter(Boolean);
app.use(
  cors({
    origin: (requestOrigin, callback) => {
      // Allow non-browser agents (cURL, tests, background workers) with no Origin header
      if (!requestOrigin) return callback(null, true);
      if (
        allowedOrigins.includes(requestOrigin) ||
        (env.NODE_ENV !== 'production' && (requestOrigin.startsWith('http://localhost:') || requestOrigin.startsWith('http://127.0.0.1:')))
      ) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  })
);

app.use('/api', apiRateLimiter());
app.use(
  express.json({
    limit: '25mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// SEO & Indexability Enforcement Middleware
app.use((req, res, next) => {
  const p = req.path;
  const isPublicShowcase =
    p.startsWith('/api/projects/published') ||
    p.startsWith('/api/projects/public') ||
    p.startsWith('/api/developers/public') ||
    p.startsWith('/api/developers/directory') ||
    p.startsWith('/api/developers/profile') ||
    p.startsWith('/api/developers/skills') ||
    p === '/api/health';

  if (isPublicShowcase) {
    res.setHeader('X-Robots-Tag', 'index, follow');
  } else {
    // Non-indexable: Private client projects, private chats, claims, community, support, admin, credits, internal api
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  next();
});

// System Health & Platform Status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    platform: 'Developer Company Operating System',
    version: '1.0.0',
    governance: {
      ceo: LEADERSHIP.CEO.NAME,
      md: LEADERSHIP.MD.NAME,
    },
    creditEconomy: {
      unitPriceInr: env.CREDIT_PRICE_INR,
      defaultClaimCost: env.CLAIM_COST_CREDITS,
      refundPolicyPercentage: env.DEFAULT_REFUND_PERCENTAGE,
    },
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/developers', developerRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);

// Global Error Handler
app.use(errorHandler);

const httpServer = http.createServer(app);
httpServer.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Backend Service Notice]: Port ${env.PORT} already in use or test harness active.`);
  } else {
    console.error('[Backend Server Error]:', err);
  }
});
realtimeServer.init(httpServer);

const isTestHarness =
  process.env.NODE_ENV === 'test' ||
  process.argv.some((arg) => arg.toLowerCase().includes('test'));

if (!isTestHarness && !httpServer.listening) {
  runMigrations()
    .catch((err) => {
      console.warn('[Startup Migration Warning]:', err?.message || err);
    })
    .finally(() => {
      if (!httpServer.listening) {
        httpServer.listen(env.PORT, () => {
          console.log(`[Backend Service] Listening on port ${env.PORT} (${env.NODE_ENV})`);
          console.log(`[WebSocket Service] Initialized on ws://localhost:${env.PORT}/ws`);
          console.log(`[Governance] CEO: ${LEADERSHIP.CEO.NAME} | MD: ${LEADERSHIP.MD.NAME}`);
        });
      }
    });
}

export { app, httpServer };
export default app;
