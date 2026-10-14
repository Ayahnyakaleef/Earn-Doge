// bahasa: JavaScript (ESM), file: routes/user.js
// Identifikasi user via fingerprint = sha256(ip + user-agent)
import express from 'express';
import crypto from 'crypto';
import db from '../db.js';

const router = express.Router();

export function getFingerprint(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
           || req.socket.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex');
}

export function getOrCreateUser(req) {
  const fp = getFingerprint(req);
  let user = db.prepare('SELECT * FROM users WHERE fingerprint = ?').get(fp);
  if (!user) {
    const info = db.prepare('INSERT INTO users (fingerprint) VALUES (?)').run(fp);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  return user;
}

router.get('/me', (req, res) => {
  const user = getOrCreateUser(req);
  const clickedPerButton = db.prepare(`
    SELECT button_idx, COUNT(*) as cnt
    FROM clicks WHERE user_id = ?
    GROUP BY button_idx
  `).all(user.id);

  const totalButtons = parseInt(process.env.TOTAL_BUTTONS || '6');
  const adsPerButton = parseInt(process.env.ADS_PER_BUTTON || '500');
  const clicked = Array(totalButtons).fill(0);
  for (const row of clickedPerButton) clicked[row.button_idx] = row.cnt;

  res.json({
    balance: user.balance,
    totalClicks: user.total_clicks,
    clicked,
    adsPerButton,
    totalButtons,
    minWithdraw: parseFloat(process.env.MIN_WITHDRAW || '2.0'),
    rewardPerClick: parseFloat(process.env.REWARD_PER_CLICK || '0.0003')
  });
});

export default router;
