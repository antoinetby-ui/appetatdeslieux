import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, transaction, PHOTOS_DIR } from './src/db.js';
import { analyserPiece, ETATS, CATEGORIES } from './src/ia.js';
import { genererPdf } from './src/pdf.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));
app.use('/photos', express.static(PHOTOS_DIR, { maxAge: '7d' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 20 } });

// Pièces et espaces proposés à l'ajout ; l'utilisateur peut aussi saisir un type libre.
const TYPES_PIECES = [
  'Entrée', 'Salon', 'Séjour', 'Salle à manger', 'Cuisine', 'Chambre', 'Salle de bain', "Salle d'eau",
  'WC', 'Bureau', 'Couloir', 'Dégagement', 'Dressing', 'Buanderie', 'Cellier', 'Mezzanine', 'Véranda',
  'Balcon', 'Terrasse', 'Jardin', 'Piscine', 'Cave', 'Grenier', 'Garage', 'Place de parking', 'Abri de jardin',
];

app.get('/api/catalogue', (req, res) => res.json({ typesPieces: TYPES_PIECES, etats: ETATS, categories: CATEGORIES }));

// --- CRUD générique pour les entités simples ---------------------------------
function crud(table, champs) {
  const pick = (body) => champs.map((c) => body[c] ?? null);
  const r = express.Router();
  r.get('/', (req, res) => res.json(all(`SELECT * FROM ${table} ORDER BY nom COLLATE NOCASE`)));
  r.get('/:id', (req, res) => {
    const row = get(`SELECT * FROM ${table} WHERE id = ?`, req.params.id);
    row ? res.json(row) : res.status(404).json({ error: 'Introuvable' });
  });
  r.post('/', (req, res) => {
    if (!req.body.nom?.trim()) return res.status(400).json({ error: 'Le nom est obligatoire' });
    const { lastInsertRowid } = run(
      `INSERT INTO ${table} (${champs.join(',')}) VALUES (${champs.map(() => '?').join(',')})`, ...pick(req.body));
    res.status(201).json(get(`SELECT * FROM ${table} WHERE id = ?`, lastInsertRowid));
  });
  r.put('/:id', (req, res) => {
    if (!req.body.nom?.trim()) return res.status(400).json({ error: 'Le nom est obligatoire' });
    run(`UPDATE ${table} SET ${champs.map((c) => `${c} = ?`).join(',')} WHERE id = ?`, ...pick(req.body), req.params.id);
    res.json(get(`SELECT * FROM ${table} WHERE id = ?`, req.params.id));
  });
  r.delete('/:id', (req, res) => {
    try {
      run(`DELETE FROM ${table} WHERE id = ?`, req.params.id);
      res.status(204).end();
    } catch {
      res.status(409).json({ error: 'Impossible de supprimer : utilisé par un état des lieux.' });
    }
  });
  return r;
}

app.use('/api/proprietaires', crud('proprietaires', ['civilite', 'nom', 'prenom', 'societe', 'adresse', 'email', 'telephone']));
app.use('/api/locataires', crud('locataires', ['civilite', 'nom', 'prenom', 'adresse', 'email', 'telephone']));

// --- Biens (avec leurs pièces) -----------------------------------------------
const CHAMPS_BIEN = ['nom', 'type', 'adresse', 'code_postal', 'ville', 'surface', 'etage', 'meuble', 'notes'];
const bienComplet = (id) => {
  const bien = get('SELECT * FROM biens WHERE id = ?', id);
  if (bien) bien.pieces = all('SELECT * FROM pieces WHERE bien_id = ? ORDER BY ordre, id', id);
  return bien;
};

function enregistrerPieces(bienId, pieces = []) {
  const gardees = pieces.filter((p) => p.id).map((p) => Number(p.id));
  for (const p of all('SELECT id FROM pieces WHERE bien_id = ?', bienId)) {
    if (!gardees.includes(p.id)) run('DELETE FROM pieces WHERE id = ?', p.id);
  }
  pieces.forEach((p, ordre) => {
    const nom = p.nom?.trim() || p.type;
    if (p.id) run('UPDATE pieces SET type = ?, nom = ?, ordre = ? WHERE id = ? AND bien_id = ?', p.type, nom, ordre, p.id, bienId);
    else run('INSERT INTO pieces (bien_id, type, nom, ordre) VALUES (?, ?, ?, ?)', bienId, p.type, nom, ordre);
  });
}

const valeursBien = (b) => CHAMPS_BIEN.map((c) => (c === 'meuble' ? (b.meuble ? 1 : 0) : b[c] === '' ? null : b[c] ?? null));

app.get('/api/biens', (req, res) => {
  res.json(all(`SELECT b.*, (SELECT COUNT(*) FROM pieces WHERE bien_id = b.id) AS nb_pieces
                FROM biens b ORDER BY nom COLLATE NOCASE`));
});
app.get('/api/biens/:id', (req, res) => {
  const b = bienComplet(req.params.id);
  b ? res.json(b) : res.status(404).json({ error: 'Introuvable' });
});
app.post('/api/biens', (req, res) => {
  if (!req.body.nom?.trim()) return res.status(400).json({ error: 'Le nom est obligatoire' });
  const id = transaction(() => {
    const { lastInsertRowid } = run(
      `INSERT INTO biens (${CHAMPS_BIEN.join(',')}) VALUES (${CHAMPS_BIEN.map(() => '?').join(',')})`, ...valeursBien(req.body));
    enregistrerPieces(lastInsertRowid, req.body.pieces);
    return lastInsertRowid;
  });
  res.status(201).json(bienComplet(id));
});
app.put('/api/biens/:id', (req, res) => {
  if (!req.body.nom?.trim()) return res.status(400).json({ error: 'Le nom est obligatoire' });
  transaction(() => {
    run(`UPDATE biens SET ${CHAMPS_BIEN.map((c) => `${c} = ?`).join(',')} WHERE id = ?`, ...valeursBien(req.body), req.params.id);
    enregistrerPieces(req.params.id, req.body.pieces);
  });
  res.json(bienComplet(req.params.id));
});
app.delete('/api/biens/:id', (req, res) => {
  try {
    run('DELETE FROM biens WHERE id = ?', req.params.id);
    res.status(204).end();
  } catch {
    res.status(409).json({ error: 'Impossible de supprimer : ce bien a des états des lieux.' });
  }
});

// --- États des lieux ---------------------------------------------------------
function edlComplet(id) {
  const edl = get('SELECT * FROM etats_des_lieux WHERE id = ?', id);
  if (!edl) return null;
  edl.bien = get('SELECT * FROM biens WHERE id = ?', edl.bien_id);
  edl.proprietaire = get('SELECT * FROM proprietaires WHERE id = ?', edl.proprietaire_id);
  edl.locataire = get('SELECT * FROM locataires WHERE id = ?', edl.locataire_id);
  edl.pieces = all('SELECT * FROM edl_pieces WHERE edl_id = ? ORDER BY ordre, id', id).map((p) => ({
    ...p,
    elements: all(`SELECT * FROM elements WHERE edl_piece_id = ? ORDER BY CASE categorie
      WHEN 'revetement' THEN 0 WHEN 'menuiserie' THEN 1 WHEN 'electricite' THEN 2 WHEN 'plomberie' THEN 3
      WHEN 'equipement' THEN 4 WHEN 'mobilier' THEN 5 ELSE 6 END, id`, p.id),
    photos: all('SELECT * FROM photos WHERE edl_piece_id = ? ORDER BY id', p.id),
  }));
  return edl;
}

app.get('/api/edl', (req, res) => {
  res.json(all(`
    SELECT e.id, e.type, e.date, e.statut, b.nom AS bien, b.ville,
           TRIM(COALESCE(p.prenom,'') || ' ' || p.nom) AS proprietaire,
           TRIM(COALESCE(l.prenom,'') || ' ' || l.nom) AS locataire
    FROM etats_des_lieux e
    JOIN biens b ON b.id = e.bien_id
    JOIN proprietaires p ON p.id = e.proprietaire_id
    JOIN locataires l ON l.id = e.locataire_id
    ORDER BY e.date DESC, e.id DESC`));
});

app.post('/api/edl', (req, res) => {
  const { bien_id, proprietaire_id, locataire_id, type = 'entree', date } = req.body;
  if (!bien_id || !proprietaire_id || !locataire_id) {
    return res.status(400).json({ error: 'Sélectionnez un propriétaire, un locataire et un bien.' });
  }
  const id = transaction(() => {
    const { lastInsertRowid } = run(
      'INSERT INTO etats_des_lieux (bien_id, proprietaire_id, locataire_id, type, date) VALUES (?, ?, ?, ?, ?)',
      bien_id, proprietaire_id, locataire_id, type, date || new Date().toISOString().slice(0, 10));
    for (const p of all('SELECT * FROM pieces WHERE bien_id = ? ORDER BY ordre, id', bien_id)) {
      run('INSERT INTO edl_pieces (edl_id, type, nom, ordre) VALUES (?, ?, ?, ?)', lastInsertRowid, p.type, p.nom, p.ordre);
    }
    return lastInsertRowid;
  });
  res.status(201).json(edlComplet(id));
});

app.get('/api/edl/:id', (req, res) => {
  const edl = edlComplet(req.params.id);
  edl ? res.json(edl) : res.status(404).json({ error: 'Introuvable' });
});

app.put('/api/edl/:id', (req, res) => {
  const champs = ['type', 'date', 'statut', 'compteurs', 'cles', 'observations'].filter((c) => c in req.body);
  if (champs.length) {
    run(`UPDATE etats_des_lieux SET ${champs.map((c) => `${c} = ?`).join(',')} WHERE id = ?`,
      ...champs.map((c) => req.body[c]), req.params.id);
  }
  res.json(edlComplet(req.params.id));
});

app.delete('/api/edl/:id', (req, res) => {
  const fichiers = all(`SELECT ph.fichier FROM photos ph JOIN edl_pieces p ON p.id = ph.edl_piece_id WHERE p.edl_id = ?`, req.params.id);
  run('DELETE FROM etats_des_lieux WHERE id = ?', req.params.id);
  for (const f of fichiers) fs.rm(path.join(PHOTOS_DIR, f.fichier), { force: true }, () => {});
  res.status(204).end();
});

app.get('/api/edl/:id/pdf', (req, res) => {
  const edl = edlComplet(req.params.id);
  if (!edl) return res.status(404).json({ error: 'Introuvable' });
  const nom = `etat-des-lieux-${edl.type}-${edl.bien.nom}-${edl.date}`.normalize('NFD').replace(/[^\w.-]+/g, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nom}.pdf"`);
  genererPdf(edl, res);
});

// --- Pièces d'un état des lieux ---------------------------------------------
const pieceEdl = (id) => get('SELECT * FROM edl_pieces WHERE id = ?', id);

app.post('/api/edl/:id/pieces', (req, res) => {
  const { type, nom } = req.body;
  if (!type?.trim()) return res.status(400).json({ error: 'Type de pièce obligatoire' });
  const { m } = get('SELECT COALESCE(MAX(ordre), -1) + 1 AS m FROM edl_pieces WHERE edl_id = ?', req.params.id);
  run('INSERT INTO edl_pieces (edl_id, type, nom, ordre) VALUES (?, ?, ?, ?)', req.params.id, type, nom?.trim() || type, m);
  res.status(201).json(edlComplet(req.params.id));
});

app.put('/api/edl-pieces/:id', (req, res) => {
  const champs = ['nom', 'etat_general', 'observations', 'resume_ia'].filter((c) => c in req.body);
  if (champs.length) {
    run(`UPDATE edl_pieces SET ${champs.map((c) => `${c} = ?`).join(',')} WHERE id = ?`,
      ...champs.map((c) => req.body[c]), req.params.id);
  }
  res.json(pieceEdl(req.params.id));
});

app.delete('/api/edl-pieces/:id', (req, res) => {
  const fichiers = all('SELECT fichier FROM photos WHERE edl_piece_id = ?', req.params.id);
  run('DELETE FROM edl_pieces WHERE id = ?', req.params.id);
  for (const f of fichiers) fs.rm(path.join(PHOTOS_DIR, f.fichier), { force: true }, () => {});
  res.status(204).end();
});

// Photos : redimensionnées et converties en JPEG (compatibles IA et PDF, HEIC inclus si supporté).
app.post('/api/edl-pieces/:id/photos', upload.array('photos'), async (req, res) => {
  if (!pieceEdl(req.params.id)) return res.status(404).json({ error: 'Pièce introuvable' });
  const erreurs = [];
  for (const f of req.files ?? []) {
    try {
      const fichier = `${crypto.randomUUID()}.jpg`;
      await sharp(f.buffer).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 }).toFile(path.join(PHOTOS_DIR, fichier));
      run('INSERT INTO photos (edl_piece_id, fichier) VALUES (?, ?)', req.params.id, fichier);
    } catch {
      erreurs.push(f.originalname);
    }
  }
  res.status(201).json({
    photos: all('SELECT * FROM photos WHERE edl_piece_id = ? ORDER BY id', req.params.id),
    erreurs,
  });
});

app.delete('/api/photos/:id', (req, res) => {
  const p = get('SELECT * FROM photos WHERE id = ?', req.params.id);
  if (p) {
    run('DELETE FROM photos WHERE id = ?', p.id);
    fs.rm(path.join(PHOTOS_DIR, p.fichier), { force: true }, () => {});
  }
  res.status(204).end();
});

// Analyse IA : remplace les éléments détectés précédemment, conserve les ajouts manuels.
app.post('/api/edl-pieces/:id/analyser', async (req, res) => {
  const piece = pieceEdl(req.params.id);
  if (!piece) return res.status(404).json({ error: 'Pièce introuvable' });
  const edl = get('SELECT * FROM etats_des_lieux WHERE id = ?', piece.edl_id);
  const bien = get('SELECT * FROM biens WHERE id = ?', edl.bien_id);
  const photos = all('SELECT * FROM photos WHERE edl_piece_id = ? ORDER BY id', piece.id);
  try {
    const manuels = all("SELECT nom, quantite FROM elements WHERE edl_piece_id = ? AND source = 'manuel'", piece.id);
    const r = await analyserPiece({ piece, photos, bien, manuels });
    transaction(() => {
      run("DELETE FROM elements WHERE edl_piece_id = ? AND source = 'ia'", piece.id);
      for (const e of r.elements) {
        run(`INSERT INTO elements (edl_piece_id, categorie, nom, quantite, etat, commentaire, source)
             VALUES (?, ?, ?, ?, ?, ?, 'ia')`, piece.id, e.categorie, e.nom, e.quantite, e.etat, e.commentaire || null);
      }
      run("UPDATE edl_pieces SET etat_general = ?, resume_ia = ?, analyse_at = datetime('now') WHERE id = ?",
        r.etat_general, r.resume, piece.id);
    });
    res.json(edlComplet(piece.edl_id));
  } catch (e) {
    console.error('Analyse IA :', e);
    const message = e?.status === 401 || /API key|apiKey|authentication/i.test(e?.message || '')
      ? 'Clé API Anthropic absente ou invalide (variable ANTHROPIC_API_KEY).'
      : e.message || 'Erreur pendant l\'analyse';
    res.status(502).json({ error: message });
  }
});

// --- Éléments ----------------------------------------------------------------
const CHAMPS_ELEMENT = ['categorie', 'nom', 'quantite', 'etat', 'commentaire'];

app.post('/api/edl-pieces/:id/elements', (req, res) => {
  if (!req.body.nom?.trim()) return res.status(400).json({ error: 'Nom obligatoire' });
  const e = { categorie: 'mobilier', quantite: 1, ...req.body };
  const { lastInsertRowid } = run(
    `INSERT INTO elements (edl_piece_id, ${CHAMPS_ELEMENT.join(',')}, source) VALUES (?, ?, ?, ?, ?, ?, 'manuel')`,
    req.params.id, ...CHAMPS_ELEMENT.map((c) => e[c] ?? null));
  res.status(201).json(get('SELECT * FROM elements WHERE id = ?', lastInsertRowid));
});

app.put('/api/elements/:id', (req, res) => {
  const champs = CHAMPS_ELEMENT.filter((c) => c in req.body);
  // Un élément IA corrigé à la main devient manuel : il ne sera pas écrasé par une nouvelle analyse.
  if (champs.length) {
    run(`UPDATE elements SET ${champs.map((c) => `${c} = ?`).join(',')}, source = 'manuel' WHERE id = ?`,
      ...champs.map((c) => req.body[c]), req.params.id);
  }
  res.json(get('SELECT * FROM elements WHERE id = ?', req.params.id));
});

app.delete('/api/elements/:id', (req, res) => {
  run('DELETE FROM elements WHERE id = ?', req.params.id);
  res.status(204).end();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erreur serveur' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`État des lieux IA — http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('⚠ ANTHROPIC_API_KEY non définie : l\'analyse des photos ne fonctionnera pas.');
});
