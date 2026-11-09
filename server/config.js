import 'dotenv/config';

const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

export { LANGS, MODES } from './constants.js';

export const config = {
  port: num(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/wordshooter',
  pgSsl: process.env.PGSSL === 'true',
  isProd: process.env.NODE_ENV === 'production',
  trustProxy: process.env.TRUST_PROXY ? num(process.env.TRUST_PROXY, true) : false,
  maxBatch: 100,
  maxExclude: 3000,
};
