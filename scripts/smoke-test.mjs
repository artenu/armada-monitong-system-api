// Smoke test end-to-end terhadap server yang sedang berjalan (DEVELOPMENT SAJA: membuat order uji).
// Pakai: node scripts/smoke-test.mjs <pw-admin> <pw-sales> <pw-ops> <pw-salesops> <pw-accounting>
const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8000/api/v1';
const [adminPw, salesPw, opsPw, salesOpsPw, accPw, direkturPw] =
  process.argv.slice(2);
let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  OK   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} ${extra}`);
  }
};

async function call(method, path, { token, body, cookie, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}

async function login(email, password) {
  let r = await call('POST', '/auth/login', { body: { email, password } });
  if (r.status === 429) {
    // Batas login (throttler) tercapai: tunggu jendela 1 menit berikutnya
    console.log('  ...  batas login tercapai, menunggu 61 detik');
    await new Promise((done) => setTimeout(done, 61_000));
    r = await call('POST', '/auth/login', { body: { email, password } });
  }
  const cookie = r.setCookie ? r.setCookie.split(';')[0] : '';
  return { ...r, token: r.json?.data?.token, cookie };
}

console.log('\n[Health & Auth]');
const health = await call('GET', '/health');
check('GET /health 200', health.status === 200 && health.json.success === true);
const wrong = await login('sales@armada.local', 'salah-password');
check(
  'login password salah -> 401 + pesan',
  wrong.status === 401 && wrong.json.message === 'Email atau password salah.',
  JSON.stringify(wrong.json),
);
const unknown = await login('tidakada@armada.local', 'apapun123');
check(
  'login email tak terdaftar -> 401 pesan sama',
  unknown.status === 401 &&
    unknown.json.message === 'Email atau password salah.',
);
const badBody = await call('POST', '/auth/login', {
  body: { email: 'bukan-email' },
});
check(
  'login body salah -> 422 + errors',
  badBody.status === 422 && Array.isArray(badBody.json.errors),
  JSON.stringify(badBody.json),
);

const admin = await login('admin@armada.local', adminPw);
const sales = await login('sales@armada.local', salesPw);
const ops = await login('ops@armada.local', opsPw);
const salesOps = await login('salesops@armada.local', salesOpsPw);
const acc = await login('accounting@armada.local', accPw);
check(
  'login 5 akun berhasil',
  [admin, sales, ops, salesOps, acc].every((s) => s.status === 200 && s.token),
);
check(
  'login mengembalikan user.role',
  sales.json.data.user.role === 'sales' &&
    salesOps.json.data.user.role === 'sales_ops' &&
    acc.json.data.user.role === 'finance',
);
check(
  'refresh token di cookie httpOnly',
  /HttpOnly/i.test(sales.setCookie ?? '') &&
    /Path=\/api\/v1\/auth/i.test(sales.setCookie ?? ''),
  sales.setCookie,
);
check('refresh token TIDAK ada di body', !('refreshToken' in sales.json.data));
const noAuth = await call('GET', '/orders');
check(
  'tanpa token -> 401',
  noAuth.status === 401 && noAuth.json.success === false,
);
const me = await call('GET', '/auth/me', { token: salesOps.token });
check(
  'GET /auth/me',
  me.status === 200 && me.json.data.email === 'salesops@armada.local',
);

console.log('\n[Sales]');
const orderBody = {
  id: 'JOB-LOKAL-999',
  status: 'Lunas', // harus diabaikan server
  customer: 'PT ADP',
  service: 'LAYANAN PBM',
  vessel: 'MV LARUS',
  pol: 'Muara Berau',
  pod: 'PLTU Paiton',
  dropPoint: 'Muara Berau â†’ PLTU Paiton',
  startDate: '2026-11-25',
  estimatedTonnage: 7500,
  chargeUnit: '/MT',
  rateType: 'Contract',
  fieldBaruDariFrontend: { contoh: true },
};
const created = await call('POST', '/orders', {
  token: sales.token,
  body: orderBody,
});
const orderId = created.json?.data?.id;
check(
  'sales buat order -> 201',
  created.status === 201,
  JSON.stringify(created.json),
);
check(
  'nomor JOB dibuat server',
  /^JOB-\d{4}-\d{3}$/.test(orderId ?? ''),
  orderId,
);
check(
  'status dipaksa Draft Sales',
  created.json?.data?.status === 'Draft Sales',
);
check(
  'field baru frontend tetap tersimpan',
  created.json?.data?.fieldBaruDariFrontend?.contoh === true,
);
const invalid = await call('POST', '/orders', {
  token: sales.token,
  body: { service: 'LAYANAN PBM', estimatedTonnage: 'banyak' },
});
check(
  'order tanpa customer -> 422 + errors per field',
  invalid.status === 422 &&
    invalid.json.errors.some((e) => e.field === 'customer') &&
    invalid.json.errors.some((e) => e.field === 'estimatedTonnage'),
  JSON.stringify(invalid.json),
);
const accCreate = await call('POST', '/orders', {
  token: acc.token,
  body: orderBody,
});
check('accounting tidak bisa buat order -> 403', accCreate.status === 403);
const soCreate = await call('POST', '/orders', {
  token: salesOps.token,
  body: { ...orderBody, customer: 'PT CEP' },
});
check('sales_ops bisa buat order (akses Sales)', soCreate.status === 201);
const edit = await call('PUT', `/orders/${orderId}`, {
  token: sales.token,
  body: { notes: 'catatan revisi' },
});
check(
  'edit draft',
  edit.status === 200 &&
    edit.json.data.notes === 'catatan revisi' &&
    edit.json.data.customer === 'PT ADP',
);
const opsEdit = await call('PUT', `/orders/${orderId}`, {
  token: ops.token,
  body: { notes: 'x' },
});
check('operasional tidak bisa edit order sales -> 403', opsEdit.status === 403);
const sent = await call('POST', `/orders/${orderId}/send-to-ops`, {
  token: sales.token,
});
check(
  'kirim ke Ops -> Operational',
  sent.status === 200 && sent.json.data.status === 'Operational',
);
const editAfter = await call('PUT', `/orders/${orderId}`, {
  token: sales.token,
  body: { notes: 'y' },
});
check(
  'edit setelah dikirim -> 409',
  editAfter.status === 409,
  JSON.stringify(editAfter.json),
);
const del = await call('DELETE', `/orders/${orderId}`, { token: sales.token });
check('hapus setelah dikirim -> 409', del.status === 409);
const allOrders = await call('GET', '/orders', { token: acc.token });
check(
  'semua role bisa baca /orders (dashboard)',
  allOrders.status === 200 && allOrders.json.data.length >= 2,
);

console.log('\n[Operasional]');
const opsList = await call('GET', '/operational/orders', { token: ops.token });
check(
  'ops melihat order Operational, bukan Draft',
  opsList.json.data.some((o) => o.id === orderId) &&
    opsList.json.data.every((o) => o.status !== 'Draft Sales'),
);
const salesOpsList = await call('GET', '/operational/orders', {
  token: salesOps.token,
});
check('sales_ops bisa akses Operasional', salesOpsList.status === 200);
const salesOpsDenied = await call('GET', '/operational/orders', {
  token: sales.token,
});
check(
  'sales biasa tidak bisa akses Operasional -> 403',
  salesOpsDenied.status === 403,
);
const opsUpdate = await call('PUT', `/operational/orders/${orderId}`, {
  token: ops.token,
  body: { position: 'Muara Berau', agentPhone: '0812', mooringPic: 'Pak Budi' },
});
check(
  'update ops -> Proses Muat + field baru tersimpan',
  opsUpdate.json?.data?.status === 'Proses Muat' &&
    opsUpdate.json.data.mooringPic === 'Pak Budi',
  JSON.stringify(opsUpdate.json),
);
const trigger = await call('PUT', `/operational/orders/${orderId}`, {
  token: salesOps.token,
  body: {
    position: 'Muara Berau',
    status: 'Siap Ditagihkan',
    sofDocName: 'sof.pdf',
    sofDocUrl: '/uploads/x.pdf',
  },
});
check(
  'trigger dokumen -> Siap Ditagihkan',
  trigger.json?.data?.status === 'Siap Ditagihkan',
);
const illegal = await call('PUT', `/operational/orders/${orderId}`, {
  token: ops.token,
  body: { position: 'x', status: 'Lunas' },
});
check(
  'ops tidak bisa set Lunas / mundurkan status finance',
  illegal.json?.data?.status === 'Siap Ditagihkan',
);
const complete = await call('POST', `/operational/orders/${orderId}/complete`, {
  token: ops.token,
  body: { completeDate: '2026-11-26', finalDsr: 7450.5 },
});
check(
  'complete -> finalDsr & vesselCompleteDate',
  complete.status === 200 &&
    complete.json.data.finalDsr === 7450.5 &&
    complete.json.data.vesselCompleteDate === '2026-11-26',
);
const completeBad = await call(
  'POST',
  `/operational/orders/${orderId}/complete`,
  { token: ops.token, body: { completeDate: 'besok', finalDsr: -1 } },
);
check('complete payload salah -> 422', completeBad.status === 422);

console.log('\n[Finance / Accounting]');
const billList = await call('GET', '/billing/orders', { token: acc.token });
check(
  'accounting melihat order siap ditagih',
  billList.json.data.some((o) => o.id === orderId),
);
const opsBilling = await call('GET', '/billing/orders', { token: ops.token });
check('ops tidak bisa akses billing -> 403', opsBilling.status === 403);
const recvEarly = await call('PATCH', `/billing/orders/${orderId}/received`, {
  token: acc.token,
  body: {},
});
check('diterima sebelum invoice -> 409', recvEarly.status === 409);
const invoice = await call('POST', `/billing/orders/${orderId}/invoice`, {
  token: acc.token,
  body: {
    invoiceNo: 'INV/2026/11/001',
    invoiceDate: '2026-11-27',
    dueDate: '2026-12-27',
    ratePerTon: 11000,
    ppnAmount: 1000,
    totalInvoice: 83000000,
  },
});
check(
  'invoice -> Terkirim + sentDate',
  invoice.json?.data?.status === 'Terkirim' &&
    /^\d{4}-\d{2}-\d{2}$/.test(invoice.json.data.sentDate),
  JSON.stringify(invoice.json),
);
const recv = await call('PATCH', `/billing/orders/${orderId}/received`, {
  token: acc.token,
  body: { receivedDate: '2026-11-28' },
});
check(
  'diterima -> Diterima',
  recv.json?.data?.status === 'Diterima' &&
    recv.json.data.receivedDate === '2026-11-28',
);
const pay = await call('POST', `/billing/orders/${orderId}/payment`, {
  token: acc.token,
  body: { paymentDate: '2026-12-10', paymentNotes: 'Transfer BCA' },
});
check(
  'pembayaran -> Lunas',
  pay.json?.data?.status === 'Lunas' &&
    pay.json.data.paymentNotes === 'Transfer BCA',
);
const final = await call('GET', `/orders/${orderId}`, { token: sales.token });
check(
  'data order lengkap dari sales sampai lunas',
  final.json.data.invoiceNo === 'INV/2026/11/001' &&
    final.json.data.sofDocName === 'sof.pdf' &&
    final.json.data.fieldBaruDariFrontend?.contoh === true,
);

console.log('\n[Refresh token]');
const refreshed = await call('POST', '/auth/refresh', { cookie: sales.cookie });
const newCookie = refreshed.setCookie ? refreshed.setCookie.split(';')[0] : '';
check(
  'refresh dengan cookie -> token baru',
  refreshed.status === 200 &&
    refreshed.json.data.token &&
    newCookie &&
    newCookie !== sales.cookie,
);
const reuse = await call('POST', '/auth/refresh', { cookie: sales.cookie });
check('refresh token lama dipakai ulang -> 401', reuse.status === 401);
const afterTheft = await call('POST', '/auth/refresh', { cookie: newCookie });
check(
  'setelah dipakai ulang, seluruh family dicabut -> 401',
  afterTheft.status === 401,
);
const theftAccess = await call('GET', '/auth/me', { token: sales.token });
check(
  'access token sesi yang dicuri ikut tidak berlaku -> 401',
  theftAccess.status === 401,
);
// Sesi sales dicabut oleh deteksi pencurian di atas: login ulang untuk tes berikutnya
Object.assign(sales, await login('sales@armada.local', salesPw));
const noCookie = await call('POST', '/auth/refresh');
check('refresh tanpa cookie -> 401', noCookie.status === 401);

console.log('\n[Master data]');
const all = await call('GET', '/master', { token: ops.token });
check(
  'GET /master semua resource',
  all.json.data.customer.length === 12 &&
    all.json.data.vessel.length === 25 &&
    all.json.data['tug-boat'].length === 50,
);
const rates = await call('GET', '/master/contract-rates', {
  token: sales.token,
});
check('tarif kontrak 7', rates.json.data.length === 7);
const pnbp = await call('GET', '/master/pnbp-rates', { token: acc.token });
check('tarif PNBP 4', pnbp.json.data.length === 4);
const badRes = await call('GET', '/master/tidak-ada', { token: sales.token });
check('resource tak dikenal -> 404', badRes.status === 404);
const newItem = await call('POST', '/master/vessel', {
  token: admin.token,
  body: {
    id: 'tes-1',
    nama: 'MV UJI COBA',
    status: 'Aktif',
    subDetail: 'Panamax',
  },
});
check(
  'admin tambah vessel (kode otomatis MV-xxx)',
  newItem.status === 200 &&
    /^MV-\d{3}$/.test(newItem.json.data.kode) &&
    newItem.json.data.subDetail === 'Panamax',
  JSON.stringify(newItem.json),
);
const salesMaster = await call('POST', '/master/vessel', {
  token: sales.token,
  body: { nama: 'X' },
});
check('non-admin tidak bisa ubah master -> 403', salesMaster.status === 403);
const delItem = await call('DELETE', '/master/vessel/tes-1', {
  token: admin.token,
});
check('admin hapus vessel', delItem.status === 200);
const newPnbp = await call('POST', '/master/pnbp-rates', {
  token: admin.token,
  body: { portName: 'Balikpapan', barangEksporPerTon: 1400, status: 'Aktif' },
});
check(
  'tambah tarif PNBP (ID otomatis)',
  newPnbp.status === 200 && String(newPnbp.json.data.id).startsWith('PNBP-'),
  JSON.stringify(newPnbp.json),
);
await call('DELETE', `/master/pnbp-rates/${newPnbp.json.data.id}`, {
  token: admin.token,
});

console.log('\n[Users]');
const users = await call('GET', '/users', { token: admin.token });
check(
  'admin list users (tanpa password hash)',
  users.status === 200 &&
    users.json.data.length >= 5 &&
    !JSON.stringify(users.json).includes('passwordHash'),
);
const salesUsers = await call('GET', '/users', { token: sales.token });
check('non-admin -> 403', salesUsers.status === 403);
const shortPw = await call('POST', '/users', {
  token: admin.token,
  body: {
    name: 'Uji',
    email: 'uji@armada.local',
    role: 'sales',
    password: '123',
  },
});
check(
  'password pendek -> 422',
  shortPw.status === 422 &&
    shortPw.json.errors.some((e) => e.field === 'password'),
);
const dup = await call('POST', '/users', {
  token: admin.token,
  body: {
    name: 'Dup',
    email: 'SALES@armada.local',
    role: 'sales',
    password: 'rahasia123',
  },
});
check('email duplikat -> 409', dup.status === 409, JSON.stringify(dup.json));
const selfDisable = await call(
  'PATCH',
  `/users/${admin.json.data.user.id}/status`,
  { token: admin.token },
);
check(
  'admin tidak bisa nonaktifkan diri sendiri -> 409',
  selfDisable.status === 409,
);

console.log('\n[Upload]');
const pdf = new Blob(['%PDF-1.4\n%uji\n'], { type: 'application/pdf' });
const form = new FormData();
form.append('file', pdf, 'Surat Penunjukan.pdf');
const up = await call('POST', '/files', { token: sales.token, form });
check(
  'upload PDF -> url /uploads/...',
  up.status === 201 && /^\/uploads\/[0-9a-f-]+\.pdf$/.test(up.json.data.url),
  JSON.stringify(up.json),
);
const fileRes = await fetch('http://127.0.0.1:8000' + up.json.data.url);
check(
  'berkas bisa diunduh di /uploads',
  fileRes.status === 200 &&
    fileRes.headers.get('content-type')?.includes('pdf'),
);
const exe = new FormData();
exe.append(
  'file',
  new Blob(['MZ'], { type: 'application/x-msdownload' }),
  'virus.exe',
);
const upBad = await call('POST', '/files', { token: sales.token, form: exe });
check(
  'upload .exe ditolak -> 422',
  upBad.status === 422,
  JSON.stringify(upBad.json),
);
const upNoAuth = await call('POST', '/files', { form });
check('upload tanpa login -> 401', upNoAuth.status === 401);

if (direkturPw) {
  console.log('\n[Direktur - akses penuh]');
  const dir = await login('direktur@armada.local', direkturPw);
  check(
    'login direktur',
    dir.status === 200 && dir.json.data.user.role === 'direktur',
  );
  const pages = await Promise.all([
    call('GET', '/users', { token: dir.token }),
    call('GET', '/billing/orders', { token: dir.token }),
    call('GET', '/operational/orders', { token: dir.token }),
    call('GET', '/master', { token: dir.token }),
  ]);
  check(
    'direktur bisa buka Users, Billing, Operasional, Master',
    pages.every((p) => p.status === 200),
    pages.map((p) => p.status).join(','),
  );
  const dirOrder = await call('POST', '/orders', {
    token: dir.token,
    body: { customer: 'PT ADP', service: 'LAYANAN PBM' },
  });
  check('direktur bisa membuat order', dirOrder.status === 201);
  const dirMaster = await call('POST', '/master/agen', {
    token: dir.token,
    body: { id: 'tes-dir', nama: 'AGEN UJI DIREKTUR' },
  });
  check('direktur bisa ubah master data', dirMaster.status === 200);
  await call('DELETE', '/master/agen/tes-dir', { token: dir.token });
  const dirId = dir.json.data.user.id;
  const ownName = await call('PUT', `/users/${dirId}`, {
    token: dir.token,
    body: { name: 'Direktur', role: 'direktur', status: 'Aktif' },
  });
  check('direktur bisa edit profil sendiri', ownName.status === 200);
  const ownRole = await call('PUT', `/users/${dirId}`, {
    token: dir.token,
    body: { role: 'sales' },
  });
  check('direktur tidak bisa ubah role sendiri -> 409', ownRole.status === 409);
}

console.log('\n[Sesi]');
const tmpEmail = 'sesi-uji@armada.local';
const tmpPw = 'SesiUji-12345';
const tmpUser = await call('POST', '/users', {
  token: admin.token,
  body: { name: 'Uji Sesi', email: tmpEmail, role: 'admin', password: tmpPw },
});
check(
  'buat akun uji sesi',
  tmpUser.status === 201,
  JSON.stringify(tmpUser.json),
);
const tmpId = tmpUser.json?.data?.id;
const devA = await login(tmpEmail, tmpPw);
const devB = await login(tmpEmail, tmpPw);
const changeOwn = await call('PUT', `/users/${tmpId}`, {
  token: devA.token,
  body: { password: tmpPw + 'x' },
});
check('ganti password sendiri', changeOwn.status === 200);
const meA = await call('GET', '/auth/me', { token: devA.token });
check('sesi yang mengganti password tetap aktif', meA.status === 200);
const meB = await call('GET', '/auth/me', { token: devB.token });
check(
  'sesi perangkat lain langsung berakhir (access token) -> 401',
  meB.status === 401 &&
    meB.json.message === 'Sesi berakhir. Silakan login kembali.',
);
const refB = await call('POST', '/auth/refresh', { cookie: devB.cookie });
check('sesi perangkat lain tidak bisa refresh -> 401', refB.status === 401);
const byAdmin = await call('PUT', `/users/${tmpId}`, {
  token: admin.token,
  body: { password: tmpPw },
});
check('admin reset password user lain', byAdmin.status === 200);
const meA2 = await call('GET', '/auth/me', { token: devA.token });
check(
  'password direset admin -> semua sesi user berakhir',
  meA2.status === 401,
);
const devC = await login(tmpEmail, tmpPw);
const devD = await login(tmpEmail, tmpPw);
const logoutAll = await call('POST', '/auth/logout-all', { token: devC.token });
check('logout semua perangkat', logoutAll.status === 200);
const [meC, meD, refD] = await Promise.all([
  call('GET', '/auth/me', { token: devC.token }),
  call('GET', '/auth/me', { token: devD.token }),
  call('POST', '/auth/refresh', { cookie: devD.cookie }),
]);
check(
  'setelah logout semua: semua token & refresh -> 401',
  meC.status === 401 && meD.status === 401 && refD.status === 401,
);
const devE = await login(tmpEmail, tmpPw);
await call('PATCH', `/users/${tmpId}/status`, { token: admin.token });
const meE = await call('GET', '/auth/me', { token: devE.token });
check('akun dinonaktifkan -> token langsung 401', meE.status === 401);
const delTmp = await call('DELETE', `/users/${tmpId}`, { token: admin.token });
check('hapus akun uji sesi', delTmp.status === 200);
const forged = await call('GET', '/auth/me', {
  token: admin.token.slice(0, -2) + (admin.token.endsWith('AA') ? 'BB' : 'AA'),
});
check('token dimodifikasi -> 401', forged.status === 401);

console.log('\n[Logout]');
const out = await call('POST', '/auth/logout', { cookie: ops.cookie });
check('logout', out.status === 200);
const afterLogout = await call('POST', '/auth/refresh', { cookie: ops.cookie });
check('refresh setelah logout -> 401', afterLogout.status === 401);
const tokenAfterLogout = await call('GET', '/auth/me', { token: ops.token });
check(
  'access token langsung tidak berlaku setelah logout -> 401',
  tokenAfterLogout.status === 401,
);

console.log(`\nHasil: ${pass} lolos, ${fail} gagal`);
process.exit(fail ? 1 : 0);
