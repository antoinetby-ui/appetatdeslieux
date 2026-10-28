import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
export const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'etatsdeslieux.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS proprietaires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  civilite TEXT, nom TEXT NOT NULL, prenom TEXT,
  societe TEXT, adresse TEXT, email TEXT, telephone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS locataires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  civilite TEXT, nom TEXT NOT NULL, prenom TEXT,
  adresse TEXT, email TEXT, telephone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS biens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL, type TEXT, adresse TEXT, code_postal TEXT, ville TEXT,
  surface REAL, etage TEXT, meuble INTEGER DEFAULT 0, notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Pièces / espaces composant un bien (modèle réutilisé à chaque état des lieux)
CREATE TABLE IF NOT EXISTS pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bien_id INTEGER NOT NULL REFERENCES biens(id) ON DELETE CASCADE,
  type TEXT NOT NULL, nom TEXT NOT NULL, ordre INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS etats_des_lieux (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bien_id INTEGER NOT NULL REFERENCES biens(id),
  proprietaire_id INTEGER NOT NULL REFERENCES proprietaires(id),
  locataire_id INTEGER NOT NULL REFERENCES locataires(id),
  type TEXT NOT NULL DEFAULT 'entree',
  date TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'brouillon',
  compteurs TEXT,
  cles TEXT,
  observations TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Copie des pièces au moment de l'état des lieux (le bien peut évoluer ensuite)
CREATE TABLE IF NOT EXISTS edl_pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edl_id INTEGER NOT NULL REFERENCES etats_des_lieux(id) ON DELETE CASCADE,
  type TEXT NOT NULL, nom TEXT NOT NULL, ordre INTEGER DEFAULT 0,
  etat_general TEXT, resume_ia TEXT, observations TEXT,
  analyse_at TEXT
);
CREATE TABLE IF NOT EXISTS elements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edl_piece_id INTEGER NOT NULL REFERENCES edl_pieces(id) ON DELETE CASCADE,
  categorie TEXT NOT NULL DEFAULT 'mobilier',
  nom TEXT NOT NULL,
  quantite INTEGER NOT NULL DEFAULT 1,
  etat TEXT,
  commentaire TEXT,
  source TEXT NOT NULL DEFAULT 'manuel'
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edl_piece_id INTEGER NOT NULL REFERENCES edl_pieces(id) ON DELETE CASCADE,
  fichier TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Colonnes ajoutées après la première version : créées si absentes (bases existantes).
function ajouterColonnes(table, colonnes) {
  const existantes = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const [nom, type] of Object.entries(colonnes)) {
    if (!existantes.includes(nom)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${nom} ${type}`);
  }
}
ajouterColonnes('etats_des_lieux', {
  sig_bailleur: 'TEXT', sig_bailleur_nom: 'TEXT', sig_bailleur_le: 'TEXT',
  sig_locataire: 'TEXT', sig_locataire_nom: 'TEXT', sig_locataire_le: 'TEXT',
  envoye_le: 'TEXT',
});

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
