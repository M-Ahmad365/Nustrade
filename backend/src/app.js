'use strict';

const path    = require('path');
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const morgan  = require('morgan');
const { z }   = require('zod');

const { env }          = require('./config/env');
const { errorHandler } = require('./middleware/errorHandler');
const { validate }     = require('./middleware/validate');
const { logger }       = require('./utils/logger');

const app = express();

// Security headers — disable COEP and allow cross-origin resource loads (images from localhost:4000)
app.use(helmet({
  crossOriginResourcePolicy:  { policy: 'cross-origin' },
  crossOriginEmbedderPolicy:  false,
}));

// CORS — wildcard in dev, explicit allowlist in prod
app.use(cors(
  env.NODE_ENV === 'development'
    ? { origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }
    : (() => {
        const origins = env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
        return { origin: origins.length === 1 ? origins[0] : origins, methods: ['GET','POST','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], credentials: true };
      })()
));

// Request logging
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve uploaded files — explicit CORP header so browsers allow cross-origin image loads
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '..', 'uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────

/** GET /health — liveness check */
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok' } });
});

// Phase 2 validation smoke-test route — remove after Phase 3
app.post(
  '/_test/validate',
  validate(z.object({ name: z.string().min(3) }).strict()),
  (req, res) => res.status(200).json({ success: true, data: req.body })
);

// ── API routes ────────────────────────────────────────────────────────────────
const { router: authRouter }         = require('./routes/auth');
const { router: usersRouter }        = require('./routes/users');
const { router: listingsRouter }     = require('./routes/listings');
const { router: offersRouter }       = require('./routes/offers');
const { router: transactionsRouter } = require('./routes/transactions');
const { router: chatRouter }         = require('./routes/chat');
const { router: reviewsRouter }       = require('./routes/reviews');
const { router: wishlistRouter }      = require('./routes/wishlist');
const { router: savedSearchesRouter } = require('./routes/savedSearches');
const { router: notificationsRouter } = require('./routes/notifications');
const { router: adminRouter }         = require('./routes/admin');
const { router: categoriesRouter }    = require('./routes/categories');

app.use('/api/v1/auth',           authRouter);
app.use('/api/v1/users',          usersRouter);
app.use('/api/v1/listings',       listingsRouter);
app.use('/api/v1/offers',         offersRouter);
app.use('/api/v1/transactions',   transactionsRouter);
app.use('/api/v1/chat',           chatRouter);
app.use('/api/v1/reviews',        reviewsRouter);
app.use('/api/v1/wishlist',       wishlistRouter);
app.use('/api/v1/saved-searches', savedSearchesRouter);
app.use('/api/v1/notifications',  notificationsRouter);
app.use('/api/v1/admin',          adminRouter);
app.use('/api/v1/categories',     categoriesRouter);

// Central error handler — must be last
app.use(errorHandler);

module.exports = { app };
