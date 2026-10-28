import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { PHOTOS_DIR } from './db.js';

const TAUPE = '#5b5044';
const GRIS = '#8a8073';
const LIGNE = '#ddd0bd';
const SABLE = '#efe8dd';

const CATEGORIE_LIBELLE = {
  revetement: 'Revêtement', mobilier: 'Mobilier', equipement: 'Équipement',
  electricite: 'Électricité', plomberie: 'Plomberie', menuiserie: 'Menuiserie', autre: 'Autre',
};

const nomComplet = (p) => [p.civilite, p.prenom, p.nom].filter(Boolean).join(' ') + (p.societe ? ` (${p.societe})` : '');
// Les horodatages SQLite sont en UTC (« AAAA-MM-JJ HH:MM:SS »).
const dateHeure = (d) => new Date(`${d.replace(' ', 'T')}Z`).toLocaleString('fr-FR',
  { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

/** Génère le PDF de l'état des lieux et l'écrit dans le flux `out`. */
export function genererPdf(edl, out) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `État des lieux ${edl.id}` } });
  doc.pipe(out);
  const largeur = doc.page.width - 80;

  const titre = (t) => {
    ensureSpace(40);
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(13).fillColor(TAUPE).text(t);
    doc.moveTo(40, doc.y + 2).lineTo(40 + largeur, doc.y + 2).strokeColor(TAUPE).lineWidth(1).stroke();
    doc.moveDown(0.5).font('Helvetica').fontSize(10).fillColor('black');
  };
  const ensureSpace = (h) => { if (doc.y + h > doc.page.height - 60) doc.addPage(); };
  const champ = (label, val) => {
    if (!val) return;
    doc.font('Helvetica-Bold').text(`${label} : `, { continued: true }).font('Helvetica').text(String(val));
  };

  // En-tête
  doc.font('Times-Bold').fontSize(22).fillColor(TAUPE)
    .text(`ÉTAT DES LIEUX ${edl.type === 'sortie' ? 'DE SORTIE' : "D'ENTRÉE"}`, { align: 'center' });
  if (edl.sig_bailleur && edl.sig_locataire) {
    doc.font('Helvetica').fontSize(9).fillColor(TAUPE).text('DOCUMENT SIGNÉ PAR LES DEUX PARTIES', { align: 'center', characterSpacing: 1.5 });
  }
  doc.font('Helvetica').fontSize(11).fillColor(GRIS).text(`Établi le ${dateFr(edl.date)}`, { align: 'center' });
  doc.fillColor('black');

  // Parties
  titre('Les parties');
  const y0 = doc.y;
  const col = largeur / 2 - 10;
  const bloc = (x, label, p) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TAUPE).text(label, x, y0, { width: col });
    doc.font('Helvetica').fillColor('black').text(nomComplet(p), x, doc.y, { width: col });
    for (const v of [p.adresse, p.telephone, p.email]) if (v) doc.text(v, x, doc.y, { width: col });
    return doc.y;
  };
  const yA = bloc(40, 'Bailleur / Propriétaire', edl.proprietaire);
  const yB = bloc(40 + col + 20, 'Locataire', edl.locataire);
  doc.x = 40; doc.y = Math.max(yA, yB);

  // Bien
  titre('Le logement');
  const b = edl.bien;
  champ('Désignation', b.nom);
  champ('Adresse', [b.adresse, [b.code_postal, b.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '));
  champ('Type', b.type);
  champ('Surface', b.surface ? `${b.surface} m²` : null);
  champ('Étage', b.etage);
  champ('Location', b.meuble ? 'Meublée' : 'Vide');
  champ('Pièces / espaces', edl.pieces.map((p) => p.nom).join(', '));

  if (edl.compteurs || edl.cles) {
    titre('Compteurs et clés');
    champ('Relevés de compteurs', edl.compteurs);
    champ('Clés remises', edl.cles);
  }

  // Pièces
  for (const piece of edl.pieces) {
    doc.addPage();
    doc.font('Times-Bold').fontSize(17).fillColor(TAUPE).text(piece.nom);
    if (piece.type !== piece.nom) doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(piece.type);
    doc.fillColor('black').moveDown(0.4);
    champ('État général', piece.etat_general || 'Non renseigné');
    if (piece.resume_ia) doc.moveDown(0.3).text(piece.resume_ia, { align: 'justify' });
    if (piece.observations) { doc.moveDown(0.3); champ('Observations', piece.observations); }

    tableau(doc, piece.elements, largeur, ensureSpace);
    photos(doc, piece.photos, largeur, ensureSpace);
  }

  // Observations et signatures
  doc.addPage();
  titre('Observations générales');
  doc.text(edl.observations || 'Néant.');
  titre('Signatures');
  doc.text(`Fait en deux exemplaires, le ${dateFr(edl.date)}.`).moveDown(0.5);
  const ys = doc.y;
  const signataires = [
    ['Le bailleur', edl.sig_bailleur, edl.sig_bailleur_nom, edl.sig_bailleur_le],
    ['Le locataire', edl.sig_locataire, edl.sig_locataire_nom, edl.sig_locataire_le],
  ];
  for (const [i, [label, image, nom, le]] of signataires.entries()) {
    const x = 40 + i * (col + 20);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text(label, x, ys, { width: col });
    doc.font('Helvetica').fontSize(8).fillColor(GRIS).text('« Lu et approuvé », signature', x, doc.y, { width: col });
    const yb = doc.y + 4;
    doc.rect(x, yb, col, 80).strokeColor(LIGNE).stroke();
    if (image) {
      doc.image(Buffer.from(image.split(',')[1], 'base64'), x + 6, yb + 4, { fit: [col - 12, 72], align: 'center', valign: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor(GRIS)
        .text(`Lu et approuvé — signé électroniquement par ${nom}, le ${dateHeure(le)}`, x, yb + 86, { width: col });
    }
  }
  doc.fontSize(10).fillColor('black');

  // Pagination
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // sinon écrire dans la marge basse ajoute une page
    doc.font('Helvetica').fontSize(8).fillColor(GRIS)
      .text(`État des lieux n°${edl.id} — ${b.nom} — page ${i + 1}/${range.count}`, 40, doc.page.height - 30,
        { width: largeur, align: 'center', lineBreak: false });
  }
  doc.end();
}

function tableau(doc, elements, largeur, ensureSpace) {
  doc.moveDown(0.6);
  if (!elements.length) { doc.font('Helvetica-Oblique').text('Aucun élément inventorié.').font('Helvetica'); return; }
  const cols = [
    { k: 'categorie', t: 'Catégorie', w: 75 },
    { k: 'nom', t: 'Élément', w: 120 },
    { k: 'quantite', t: 'Qté', w: 30 },
    { k: 'etat', t: 'État', w: 75 },
  ];
  cols.push({ k: 'commentaire', t: 'Commentaire', w: largeur - cols.reduce((s, c) => s + c.w, 0) });

  const ligne = (vals, entete) => {
    doc.font(entete ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    const h = Math.max(...cols.map((c) => doc.heightOfString(String(vals[c.k] ?? ''), { width: c.w - 6 }))) + 6;
    ensureSpace(h);
    const y = doc.y;
    if (entete) doc.rect(40, y, largeur, h).fill(SABLE);
    let x = 40;
    doc.fillColor('black');
    for (const c of cols) {
      doc.text(String(vals[c.k] ?? ''), x + 3, y + 3, { width: c.w - 6 });
      x += c.w;
    }
    doc.moveTo(40, y + h).lineTo(40 + largeur, y + h).strokeColor(LIGNE).lineWidth(0.5).stroke();
    doc.x = 40; doc.y = y + h;
  };
  ligne(Object.fromEntries(cols.map((c) => [c.k, c.t])), true);
  for (const e of elements) ligne({ ...e, categorie: CATEGORIE_LIBELLE[e.categorie] || e.categorie }, false);
  doc.fontSize(10);
}

function photos(doc, liste, largeur, ensureSpace) {
  if (!liste.length) return;
  doc.moveDown(0.8);
  ensureSpace(150);
  doc.font('Helvetica-Bold').fontSize(10).text('Photos').moveDown(0.3).font('Helvetica');
  const par = 3, gap = 8, w = (largeur - gap * (par - 1)) / par, h = w * 0.75;
  let i = 0;
  for (const p of liste) {
    const fichier = path.join(PHOTOS_DIR, p.fichier);
    if (!fs.existsSync(fichier)) continue;
    if (i % par === 0) { ensureSpace(h + gap); }
    const y = doc.y;
    const x = 40 + (i % par) * (w + gap);
    doc.image(fichier, x, y, { fit: [w, h], align: 'center', valign: 'center' });
    doc.rect(x, y, w, h).strokeColor(LIGNE).stroke();
    i++;
    doc.y = i % par === 0 ? y + h + gap : y;
  }
  if (i % par !== 0) doc.y += h + gap;
  doc.x = 40;
}
