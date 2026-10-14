// bahasa: JavaScript (ESM), file: server.js
import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import userRoutes from './routes/user.js';
import earnRoutes from './routes/earn.js';
import withdrawRoutes from './routes/withdraw.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limit global — cegah spam
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API
app.use('/api/user', userRoutes);
app.use('/api/earn', earnRoutes);
app.use('/api/withdraw', withdrawRoutes);

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[dogeclick] listening on :${PORT}`);
});
