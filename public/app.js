// bahasa: JavaScript (ESM via <script>), file: public/app.js
// Frontend: render tombol, panggil API, trigger Monetag SDK
const API = {
  me:       () => fetch('/api/user/me').then(r => r.json()),
  earnStart:(idx) => fetch('/api/earn/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ button_idx: idx })
  }).then(async r => ({ ok: r.ok, data: await r.json() })),
  withdraw: (address) => fetch('/api/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address })
  }).then(async r => ({ ok: r.ok, data: await r.json() }))
};

const el = {
  grid:     document.getElementById('grid'),
  balance:  document.getElementById('balance'),
  progress: document.getElementById('progress'),
  fpAddr:   document.getElementById('fpAddr'),
  wdBtn:    document.getElementById('wdBtn'),
  wdStatus: document.getElementById('wdStatus'),
  toast:    document.getElementById('toast')
};

let STATE = null;
let BUSY = false;

function fmtDoge(n) { return Number(n).toFixed(8) + ' DOGE'; }

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('show'), 2200);
}

function render() {
  if (!STATE) return;
  el.balance.textContent = fmtDoge(STATE.balance);
  el.progress.textContent = `${STATE.totalClicks} / ${STATE.totalButtons * STATE.adsPerButton} iklan`;

  el.grid.innerHTML = '';
  for (let i = 0; i < STATE.totalButtons; i++) {
    const remaining = STATE.adsPerButton - STATE.clicked[i];
    const btn = document.createElement('button');
    btn.className = 'earn';
    btn.innerHTML = `EARN DOGE <span class="btn-label">${remaining} iklan tersisa</span>`;
    btn.disabled = remaining <= 0 || BUSY;
    btn.onclick = () => handleEarn(i, btn);
    el.grid.appendChild(btn);
  }

  const addrOk = /^D[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(el.fpAddr.value.trim());
  el.wdBtn.disabled = STATE.balance < STATE.minWithdraw || !addrOk;
  el.wdStatus.textContent = !addrOk
    ? 'Masukkan address Doge FaucetPay yang valid (mulai D)'
    : (STATE.balance < STATE.minWithdraw
        ? `Kurang ${(STATE.minWithdraw - STATE.balance).toFixed(8)} DOGE untuk WD`
        : 'Siap withdraw');
}

async function refresh() {
  STATE = await API.me();
  render();
}

async function handleEarn(idx, btn) {
  if (BUSY) return;
  BUSY = true;
  btn.disabled = true;
  const prev = btn.innerHTML;
  btn.innerHTML = 'Loading...';

  try {
    const { ok, data } = await API.earnStart(idx);
    if (!ok) {
      toast(data.error === 'cooldown'
        ? `Tunggu ${data.wait}s`
        : data.error === 'button_exhausted'
          ? 'Tombol ini habis'
          : 'Gagal mulai');
      return;
    }

    // Panggil Monetag SDK — sesuaikan dengan tipe zone lu
    const showFn = window['show_XXXXXXX'];
    if (typeof showFn !== 'function') {
      toast('Monetag belum load');
      return;
    }

    // Token dikirim ke Monetag sebagai sub-id / custom data
    // Monetag harus dikonfigurasi untuk postback ke:
    //   https://domain-lu/api/earn/postback?token={token}&secret={secret}
    await showFn({
      type: 'inApp',
      inAppSettings: {
        frequency: 2,
        capping: 0.1,
        interval: 30,
        timeout: 5,
        everyPage: false
      },
      // beberapa SDK menerima parameter custom:
      // ymid: data.token
    });

    // Setelah SDK resolve, tunggu postback server ~1.5s lalu refresh
    await new Promise(r => setTimeout(r, 1500));
    await refresh();
    toast('+0.0003 DOGE');
  } catch (e) {
    toast('Iklan dibatalkan / gagal');
  } finally {
    BUSY = false;
    btn.innerHTML = prev;
    render();
  }
}

el.wdBtn.addEventListener('click', async () => {
  const address = el.fpAddr.value.trim();
  if (!address) return;
  if (!confirm(`Withdraw ${fmtDoge(STATE.balance)} ke:\n${address}\n\nLanjut?`)) return;

  el.wdBtn.disabled = true;
  el.wdBtn.textContent = 'Processing...';

  try {
    const { ok, data } = await API.withdraw(address);
    if (ok) {
      toast(`WD sukses: ${data.amount} DOGE`);
      await refresh();
    } else {
      toast('WD gagal: ' + (data.error || 'unknown'));
    }
  } catch {
    toast('Network error');
  } finally {
    el.wdBtn.textContent = 'Withdraw (min 2.0 DOGE)';
    render();
  }
});

// Persist address di localStorage (bukan server)
el.fpAddr.addEventListener('input', () => {
  localStorage.setItem('fp_addr', el.fpAddr.value.trim());
  render();
});

// Init
el.fpAddr.value = localStorage.getItem('fp_addr') || '';
refresh();
setInterval(refresh, 30000); // polling tiap 30s
