import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import { config } from './config.js';
import { errorHandler, securityHeaders } from './middleware.js';
import apiRouter from './routes/api.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(compression());
  app.use(securityHeaders);
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', apiRouter);
  app.use(express.static(publicDir, { maxAge: config.isProd ? '1h' : 0 }));
  app.use(errorHandler);
  return app;
}
