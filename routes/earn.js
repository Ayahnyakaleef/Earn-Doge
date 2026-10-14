// bahasa: JavaScript (ESM), file: routes/earn.js
// Flow: user klik tombol → /api/earn/start → server kasih token + panggil Monetag
//       → Monetag postback ke /api/earn/postback?token=... → server tambah balance
import express from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { getOrCreateUser } from './user.js';

const router = express.Router();

// Step 1: user mulai klik → server kasih token unik
router.post('/start', (req, res) => {
  const user = getOrCreateUser(req);
  const buttonIdx = parseInt(req.body.button_idx);
  const totalButtons = parseInt(process.env.TOTAL_BUTTONS || '6');
  const adsPerButton = parseInt(process.env.ADS_PER_BUTTON || '500');

  if (isNaN(buttonIdx) || buttonIdx < 0 || buttonIdx >= totalButtons) {
    return res.status(400).json({ error: 'invalid_button' });
  }

  // Cooldown 3 detik
  const now = Math.floor(Date.now() / 1000);
  if (now - user.last_click < 3) {
    return res.status(429).json({ error: 'cooldown', wait: 3 - (now - user.last_click) });
  }

  // Cek kuota tombol
  const cnt = db.prepare('SELECT COUNT(*) as c FROM clicks WHERE user_id=? AND button_idx=?')
                .get(user.id, buttonIdx).c;
  if (cnt >= adsPerButton) return res.status(400).json({ error: 'button_exhausted' });

  // Buat token pending
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO pending_ads (user_id, button_idx, token) VALUES (?,?,?)')
    .run(user.id, buttonIdx, token);

  // Update last_click
  db.prepare('UPDATE users SET last_click=? WHERE id=?').run(now, user.id);

  // Frontend akan panggil Monetag SDK; postback dari Monetag akan hit /postback
  res.json({ token });
});

// Step 2: Monetag postback (server-to-server)
// Monetag akan kirim GET/POST ke URL ini setelah user selesai nonton
// Format: /api/earn/postback?token=xxx&secret=xxx
router.all('/postback', (req, res) => {
  const { token, secret } = { ...req.query, ...req.body };

  if (secret !== process.env.MONETAG_POSTBACK_SECRET) {
    return res.status(403).json({ error: 'bad_secret' });
  }
  if (!token) return res.status(400).json({ error: 'no_token' });

  const pending = db.prepare('SELECT * FROM pending_ads WHERE token=? AND used=0').get(token);
  if (!pending) return res.status(400).json({ error: 'invalid_token' });

  const reward = parseFloat(process.env.REWARD_PER_CLICK || '0.0003');

  const tx = db.transaction(() => {
    db.prepare('UPDATE pending_ads SET used=1 WHERE id=?').run(pending.id);
    db.prepare('INSERT INTO clicks (user_id, button_idx, reward) VALUES (?,?,?)')
      .run(pending.user_id, pending.button_idx, reward);
    db.prepare('UPDATE users SET balance = balance + ?, total_clicks = total_clicks + 1 WHERE id=?')
      .run(reward, pending.user_id);
  });
  tx();

  res.json({ ok: true });
});

export default router;
