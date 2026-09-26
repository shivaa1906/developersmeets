import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/environment.js';
import { errorHandler } from './middlewares/errorHandler.js';
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

const app = express();

// Security & utility middlewares
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use('/api', apiRateLimiter());
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

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

if (process.env.NODE_ENV !== 'test') {
  app.listen(env.PORT, () => {
    console.log(`[Backend Service] Listening on port ${env.PORT} (${env.NODE_ENV})`);
    console.log(`[Governance] CEO: ${LEADERSHIP.CEO.NAME} | MD: ${LEADERSHIP.MD.NAME}`);
  });
}

export default app;
