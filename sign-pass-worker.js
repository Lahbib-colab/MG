// Service de signature de passes Apple Wallet pour MG iS (Cloudflare Worker, aucune dépendance).
//
// L'app envoie le contenu du pass (pass.json + images) ; ce service ajoute les identifiants Apple,
// calcule le manifest, signe avec TON certificat « Pass Type ID » et renvoie un fichier .pkpass
// que l'iPhone ouvre directement dans Wallet.
//
// Variables à définir dans Cloudflare (Settings > Variables and Secrets) :
//   PASS_CERT_PEM  certificat du Pass Type ID (PEM, « -----BEGIN CERTIFICATE----- »)
//   PASS_KEY_PEM   clé privée associée (PEM, PKCS#8 ou PKCS#1, sans mot de passe)
//   WWDR_PEM       certificat intermédiaire Apple WWDR G4 (PEM)
//   PASS_TYPE_ID   ex. pass.com.tonnom.mgehs
//   TEAM_ID        identifiant d'équipe Apple Developer (10 caractères)
//   TOKEN          mot de passe de ton choix : l'app l'envoie pour éviter les usages par d'autres
//   ALLOW_ORIGIN   (facultatif) adresse de ton app, ex. https://tonnom.github.io ; « * » par défaut

const te = new TextEncoder();

/* ---------- DER ---------- */
function derLen(n) { if (n < 128) return [n]; const b = []; while (n > 0) { b.unshift(n & 255); n >>= 8; } return [0x80 | b.length, ...b]; }
function cat(...parts) { let n = 0; parts.forEach(p => n += p.length); const o = new Uint8Array(n); let k = 0; parts.forEach(p => { o.set(p, k); k += p.length; }); return o; }
function tlv(tag, c) { c = c instanceof Uint8Array ? c : Uint8Array.from(c); return cat(Uint8Array.of(tag), Uint8Array.from(derLen(c.length)), c); }
function oid(s) { const p = s.split('.').map(Number), b = [p[0] * 40 + p[1]]; for (let i = 2; i < p.length; i++) { let v = p[i]; const t = [v & 127]; v >>= 7; while (v > 0) { t.unshift((v & 127) | 128); v >>= 7; } b.push(...t); } return tlv(0x06, b); }
const seq = (...p) => tlv(0x30, cat(...p)), set = (...p) => tlv(0x31, cat(...p)), nul = () => Uint8Array.of(5, 0);
function readTLV(buf, off) { const tag = buf[off]; let l = buf[off + 1], h = 2; if (l & 0x80) { const n = l & 0x7f; l = 0; for (let i = 0; i < n; i++) l = (l << 8) | buf[off + 2 + i]; h = 2 + n; } return { tag, start: off + h, end: off + h + l, raw: buf.subarray(off, off + h + l) }; }
function pem(text, label) { const m = new RegExp('-----BEGIN ' + label + '-----([\\s\\S]*?)-----END ' + label + '-----').exec(text || ''); if (!m) return null; const b = atob(m[1].replace(/\s+/g, '')); return Uint8Array.from(b, c => c.charCodeAt(0)); }
function certParts(der) { // issuer et numéro de série (encodages DER d'origine)
  const cert = readTLV(der, 0), tbs = readTLV(der, cert.start); let o = tbs.start; let t = readTLV(der, o);
  if (t.tag === 0xA0) { o = t.end; t = readTLV(der, o); }
  const serial = t; o = serial.end; const alg = readTLV(der, o); o = alg.end; const issuer = readTLV(der, o);
  return { serial: serial.raw, issuer: issuer.raw };
}
function toPkcs8(text) {
  const p8 = pem(text, 'PRIVATE KEY'); if (p8) return p8;
  const p1 = pem(text, 'RSA PRIVATE KEY'); if (!p1) throw new Error('Clé privée illisible (PEM attendu, sans mot de passe)');
  return seq(tlv(2, [0]), seq(oid('1.2.840.113549.1.1.1'), nul()), tlv(4, p1));
}

/* ---------- Signature CMS détachée (SHA-256 / RSA) ---------- */
async function cmsSign(content, certDer, wwdrDer, keyPkcs8) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', content));
  const now = new Date(), p2 = n => String(n).padStart(2, '0'), utc = p2(now.getUTCFullYear() % 100) + p2(now.getUTCMonth() + 1) + p2(now.getUTCDate()) + p2(now.getUTCHours()) + p2(now.getUTCMinutes()) + p2(now.getUTCSeconds()) + 'Z';
  const attrs = [
    seq(oid('1.2.840.113549.1.9.3'), set(oid('1.2.840.113549.1.7.1'))),
    seq(oid('1.2.840.113549.1.9.4'), set(tlv(4, digest))),
    seq(oid('1.2.840.113549.1.9.5'), set(tlv(0x17, te.encode(utc))))
  ].sort((a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; });
  const attrBody = cat(...attrs), toSign = tlv(0x31, attrBody), implicit = tlv(0xA0, attrBody);
  const key = await crypto.subtle.importKey('pkcs8', keyPkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, toSign));
  const cp = certParts(certDer), sha256 = seq(oid('2.16.840.1.101.3.4.2.1'), nul());
  const signerInfo = seq(tlv(2, [1]), seq(cp.issuer, cp.serial), sha256, implicit, seq(oid('1.2.840.113549.1.1.1'), nul()), tlv(4, sig));
  const signedData = seq(tlv(2, [1]), set(sha256), seq(oid('1.2.840.113549.1.7.1')), tlv(0xA0, cat(certDer, wwdrDer)), set(signerInfo));
  return seq(oid('1.2.840.113549.1.7.2'), tlv(0xA0, signedData));
}

/* ---------- ZIP sans compression ---------- */
let CRC = null;
function crc32(u) { if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRC[n] = c >>> 0; } } let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(files) {
  const parts = [], cd = []; let off = 0; const now = new Date(), dt = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()), tm = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1));
  files.forEach(f => {
    const nm = te.encode(f.name), crc = crc32(f.data), sz = f.data.length, lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(lh.buffer), nm, f.data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    cd.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + sz;
  });
  const cds = cd.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cds, true); end.setUint32(16, off, true);
  return cat(...parts, ...cd, new Uint8Array(end.buffer));
}
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/* ---------- Service ---------- */
export async function buildPass(input, env) {
  const files = input.files || {}; if (!files['pass.json']) throw new Error('pass.json manquant');
  const pass = JSON.parse(files['pass.json']); pass.passTypeIdentifier = env.PASS_TYPE_ID; pass.teamIdentifier = env.TEAM_ID;
  const out = [{ name: 'pass.json', data: te.encode(JSON.stringify(pass)) }];
  for (const [name, val] of Object.entries(files)) { if (name === 'pass.json') continue; if (!/^[A-Za-z0-9@._-]+$/.test(name)) throw new Error('Nom de fichier refusé : ' + name); out.push({ name, data: b64(val) }); }
  const manifest = {}; for (const f of out) manifest[f.name] = hex(await crypto.subtle.digest('SHA-1', f.data));
  const mf = te.encode(JSON.stringify(manifest));
  const sig = await cmsSign(mf, pem(env.PASS_CERT_PEM, 'CERTIFICATE'), pem(env.WWDR_PEM, 'CERTIFICATE'), toPkcs8(env.PASS_KEY_PEM));
  out.push({ name: 'manifest.json', data: mf }, { name: 'signature', data: sig });
  return zip(out);
}
export async function handle(req, env) {
  const cors = { 'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Service de signature MG iS : utilise POST.', { status: 200, headers: cors });
  if (!env.TOKEN || req.headers.get('authorization') !== 'Bearer ' + env.TOKEN) return new Response('Jeton invalide', { status: 401, headers: cors });
  try {
    const body = await req.json(); const zipped = await buildPass(body, env);
    return new Response(zipped, { status: 200, headers: { ...cors, 'Content-Type': 'application/vnd.apple.pkpass', 'Content-Disposition': 'attachment; filename="pass.pkpass"' } });
  } catch (e) { return new Response('Erreur de signature : ' + (e && e.message || e), { status: 500, headers: cors }); }
}
export default { fetch: (req, env) => handle(req, env) };
