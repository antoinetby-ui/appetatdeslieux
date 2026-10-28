import crypto from 'node:crypto';

// Accès protégé par un mot de passe unique (variable APP_PASSWORD).
// Sans APP_PASSWORD, l'application reste ouverte : usage local uniquement.
const MOT_DE_PASSE = process.env.APP_PASSWORD || '';
const COOKIE = 'edl_session';
const DUREE_MS = 30 * 24 * 3600 * 1000;
// Changer le mot de passe invalide toutes les sessions ouvertes.
const SECRET = crypto.createHash('sha256').update(`${process.env.SESSION_SECRET || ''}:${MOT_DE_PASSE}`).digest();

export const authActive = Boolean(MOT_DE_PASSE);

const signer = (expire) => crypto.createHmac('sha256', SECRET).update(String(expire)).digest('base64url');

function egal(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function lireCookie(req) {
  const brut = req.headers.cookie?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return brut?.slice(COOKIE.length + 1);
}

function sessionValide(req) {
  const [expire, signature] = (lireCookie(req) || '').split('.');
  return Number(expire) > Date.now() && signature && egal(signature, signer(expire));
}

function poserCookie(req, res, valeur, maxAge) {
  res.cookie(COOKIE, valeur, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge, path: '/' });
}

// Limite les essais de mot de passe : 10 échecs par adresse IP et par quart d'heure.
const echecs = new Map();
function bloque(ip) {
  const e = echecs.get(ip);
  if (!e || e.debut + 15 * 60_000 < Date.now()) { echecs.delete(ip); return false; }
  return e.n >= 10;
}

export function routesAuth(app) {
  app.get('/api/session', (req, res) => res.json({ connecte: !authActive || sessionValide(req), authActive }));

  app.post('/api/login', (req, res) => {
    if (!authActive) return res.json({ connecte: true });
    if (bloque(req.ip)) return res.status(429).json({ error: 'Trop de tentatives, réessayez dans 15 minutes.' });
    if (!egal(String(req.body?.password ?? ''), MOT_DE_PASSE)) {
      const e = echecs.get(req.ip) ?? { n: 0, debut: Date.now() };
      e.n++; echecs.set(req.ip, e);
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    echecs.delete(req.ip);
    const expire = Date.now() + DUREE_MS;
    poserCookie(req, res, `${expire}.${signer(expire)}`, DUREE_MS);
    res.json({ connecte: true });
  });

  app.post('/api/logout', (req, res) => {
    poserCookie(req, res, '', 0);
    res.status(204).end();
  });

  // Tout le reste de l'API et les photos exigent une session.
  app.use(['/api', '/photos'], (req, res, next) => {
    if (!authActive || sessionValide(req)) return next();
    res.status(401).json({ error: 'Non connecté' });
  });
}
