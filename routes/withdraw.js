// bahasa: JavaScript (ESM), file: routes/withdraw.js
// WD ke FaucetPay via API resmi
// POST https://faucetpay.io/api/v1/send
//   key, to, amount, currency
import express from 'express';
import fetch from 'node-fetch';
import db from '../db.js';
import { getOrCreateUser } from './user.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const user = getOrCreateUser(req);
  const address = (req.body.address || '').trim();
  const minWd = parseFloat(process.env.MIN_WITHDRAW || '2.0');

  if (!address || address.length < 20) return res.status(400).json({ error: 'bad_address' });
  if (user.balance < minWd) return res.status(400).json({ error: 'below_min', min: minWd });

  // Rate limit WD: max 1 per 10 menit
  const last = db.prepare("SELECT created_at FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 1").get(user.id);
  const now = Math.floor(Date.now() / 1000);
  if (last && now - last.created_at < 600) {
    return res.status(429).json({ error: 'wd_cooldown' });
  }

  const amount = Math.floor(user.balance * 1e8) / 1e8; // 8 desimal, hindari float error
  const ref = 'dc_' + Date.now() + '_' + user.id;

  // Insert pending record dulu
  const ins = db.prepare(`
    INSERT INTO withdrawals (user_id, address, amount, status, tx_ref)
    VALUES (?,?,?,?,?)
  `).run(user.id, address, amount, 'pending', ref);
  const wdId = ins.lastInsertRowid;

  // Kurangi balance langsung (optimistic) — kalau gagal, refund
  db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, user.id);

  try {
    const params = new URLSearchParams({
      key: process.env.FAUCETPAY_API_KEY,
      to: address,
      amount: amount.toString(),
      currency: process.env.FAUCETPAY_CURRENCY || 'DOGE'
    });

    const r = await fetch('https://faucetpay.io/api/v1/send', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const data = await r.json();

    if (data.status === 200) {
      db.prepare('UPDATE withdrawals SET status=? WHERE id=?').run('sent', wdId);
      res.json({ ok: true, amount, address, payout_id: data.payout_id });
    } else {
      // Refund
      db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, user.id);
      db.prepare('UPDATE withdrawals SET status=? WHERE id=?').run('failed', wdId);
      res.status(400).json({ error: 'faucetpay_error', message: data.message });
    }
  } catch (e) {
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, user.id);
    db.prepare('UPDATE withdrawals SET status=? WHERE id=?').run('failed', wdId);
    res.status(500).json({ error: 'network_error', message: e.message });
  }
});

export default router;
