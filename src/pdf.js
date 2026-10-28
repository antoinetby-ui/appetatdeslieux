import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHOTOS_DIR } from './db.js';

// Charte : la même que l'application (ivoire, sable, taupe, bronze).
const C = {
  encre: '#2f2a24', taupe: '#5b5044', gris: '#8a8073', grisClair: '#b3a999',
  bronze: '#a68a64', sable: '#efe8dd', sableClair: '#f8f4ee', ligne: '#e6dccd',
};
const ETAT_COULEUR = {
  'Neuf': '#4f6f4f', 'Très bon état': '#5f7a5a', 'Bon état': '#7d8a52',
  "État d'usage": '#a68a64', 'Mauvais état': '#b0703c', 'Hors service': '#9c4a3c',
};
const CATEGORIES = [
  ['revetement', 'Revêtements'], ['menuiserie', 'Menuiseries'], ['electricite', 'Électricité'],
  ['plomberie', 'Plomberie'], ['equipement', 'Équipements'], ['mobilier', 'Mobilier'], ['autre', 'Autres'],
];

// Polices de l'application (paquets @fontsource), Helvetica/Times en secours.
const FONTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/@fontsource');
const POLICES = {
  titre: ['cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff', 'Times-Bold'],
  titreItalique: ['cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff', 'Times-Italic'],
  texte: ['inter/files/inter-latin-400-normal.woff', 'Helvetica'],
  texteMoyen: ['inter/files/inter-latin-500-normal.woff', 'Helvetica'],
  texteGras: ['inter/files/inter-latin-600-normal.woff', 'Helvetica-Bold'],
};

const M = 48; // marge latérale
const nomComplet = (p) => [p.civilite, p.prenom, p.nom].filter(Boolean).join(' ');
// Les horodatages SQLite sont en UTC (« AAAA-MM-JJ HH:MM:SS »).
const dateHeure = (d) => new Date(`${d.replace(' ', 'T')}Z`).toLocaleString('fr-FR',
  { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const reference = (edl) => `EDL-${String(edl.id).padStart(5, '0')}`;

/** Génère le PDF de l'état des lieux et l'écrit dans le flux `out`. */
export function genererPdf(edl, out) {
  const doc = new PDFDocument({
    size: 'A4', bufferPages: true, margins: { top: 70, bottom: 64, left: M, right: M },
    info: { Title: `État des lieux — ${edl.bien.nom}`, Author: 'Bremakeys' },
  });
  doc.pipe(out);
  for (const [nom, [fichier, secours]] of Object.entries(POLICES)) {
    try { doc.registerFont(nom, path.join(FONTS_DIR, fichier)); } catch { doc.registerFont(nom, secours); }
  }

  const L = doc.page.width - 2 * M; // largeur utile
  const bas = () => doc.page.height - doc.page.margins.bottom;
  const place = (h) => { if (doc.y + h > bas()) doc.addPage(); };
  const signe = Boolean(edl.sig_bailleur && edl.sig_locataire);
  const typeLong = edl.type === 'sortie' ? 'de sortie' : "d'entrée";

  // Petit libellé en capitales espacées, couleur bronze
  const surtitre = (t, x = M, y = doc.y, opts = {}) => {
    doc.font('texteGras').fontSize(7).fillColor(C.bronze).text(t.toUpperCase(), x, y, { characterSpacing: 1.8, ...opts });
  };
  // `besoin` : hauteur à garder avec le titre pour ne pas le laisser seul en bas de page
  const section = (t, besoin = 70) => {
    place(besoin);
    doc.y += 14;
    surtitre(t);
    doc.moveTo(M, doc.y + 4).lineTo(M + L, doc.y + 4).lineWidth(0.6).strokeColor(C.ligne).stroke();
    doc.y += 14;
  };
  const carte = (x, y, w, h) => doc.roundedRect(x, y, w, h, 6).lineWidth(0.6).fillAndStroke(C.sableClair, C.ligne);

  // ---------------------------------------------------------------- Couverture
  doc.y = 70;
  surtitre(`État des lieux ${typeLong}`);
  doc.font('titre').fontSize(34).fillColor(C.encre).text(edl.bien.nom, M, doc.y + 6, { width: L - (signe ? 110 : 0) });
  const adresse = [edl.bien.adresse, [edl.bien.code_postal, edl.bien.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (adresse) doc.font('titreItalique').fontSize(14).fillColor(C.taupe).text(adresse, { width: L - (signe ? 110 : 0) });
  doc.font('texte').fontSize(9).fillColor(C.gris).text(`Établi le ${dateFr(edl.date)}  ·  Référence ${reference(edl)}`, M, doc.y + 6);
  if (signe) { const y = doc.y; sceau(doc, M + L - 46, 112); doc.x = M; doc.y = y; }
  doc.y += 10;

  // Parties
  section('Les parties');
  const yP = doc.y, col = (L - 14) / 2;
  const hauteurPartie = (p) => 48 + [p.adresse, p.telephone, p.email].filter(Boolean).length * 13;
  const hP = Math.max(hauteurPartie(edl.proprietaire), hauteurPartie(edl.locataire));
  for (const [i, [label, p]] of [['Bailleur', edl.proprietaire], ['Locataire', edl.locataire]].entries()) {
    const x = M + i * (col + 14);
    carte(x, yP, col, hP);
    surtitre(label, x + 16, yP + 14);
    doc.font('titre').fontSize(15).fillColor(C.encre).text(nomComplet(p) + (p.societe ? ` — ${p.societe}` : ''), x + 16, yP + 26, { width: col - 32 });
    doc.font('texte').fontSize(8.5).fillColor(C.gris);
    for (const v of [p.adresse, p.telephone, p.email]) if (v) doc.text(v, x + 16, doc.y + 2, { width: col - 32 });
  }
  doc.x = M; doc.y = yP + hP;

  // Logement : chiffres clés
  section('Le logement');
  const faits = [
    ['Type', edl.bien.type || '—'], ['Surface', edl.bien.surface ? `${edl.bien.surface} m²` : '—'],
    ['Étage', edl.bien.etage || '—'], ['Location', edl.bien.meuble ? 'Meublée' : 'Vide'], ['Pièces', String(edl.pieces.length)],
  ];
  const yL = doc.y, wF = L / faits.length;
  carte(M, yL, L, 54);
  faits.forEach(([label, val], i) => {
    const x = M + i * wF;
    if (i) doc.moveTo(x, yL + 12).lineTo(x, yL + 42).lineWidth(0.5).strokeColor(C.ligne).stroke();
    doc.font('texte').fontSize(7).fillColor(C.gris).text(label.toUpperCase(), x, yL + 13, { width: wF, align: 'center', characterSpacing: 1.2 });
    doc.font('titre').fontSize(15).fillColor(C.encre).text(val, x + 6, yL + 25, { width: wF - 12, align: 'center', lineBreak: false, ellipsis: true });
  });
  doc.x = M; doc.y = yL + 54;

  if (edl.compteurs || edl.cles) {
    section('Compteurs et clés');
    const yC = doc.y;
    const blocs = [['Relevés de compteurs', edl.compteurs], ['Clés remises', edl.cles]].filter(([, v]) => v);
    const wC = (L - 14 * (blocs.length - 1)) / blocs.length;
    doc.font('texte').fontSize(9);
    const hC = 36 + Math.max(...blocs.map(([, v]) => doc.heightOfString(v, { width: wC - 32 })));
    blocs.forEach(([label, v], i) => {
      const x = M + i * (wC + 14);
      carte(x, yC, wC, hC);
      surtitre(label, x + 16, yC + 14);
      doc.font('texte').fontSize(9).fillColor(C.encre).text(v, x + 16, yC + 26, { width: wC - 32 });
    });
    doc.x = M; doc.y = yC + hC;
  }

  // Synthèse des pièces
  section('Synthèse des pièces');
  const colsS = [['Pièce', L - 250, 'left', 10], ['État général', 130, 'left', 8], ['Éléments', 60, 'center'], ['Photos', 60, 'center']];
  enteteTableau(doc, colsS);
  edl.pieces.forEach((p, i) => {
    place(24);
    const y = doc.y;
    if (i % 2) doc.rect(M, y, L, 24).fill(C.sableClair);
    let x = M;
    doc.font('texteMoyen').fontSize(9.5).fillColor(C.encre).text(p.nom, x + 10, y + 7, { width: colsS[0][1] - 20, lineBreak: false, ellipsis: true });
    x += colsS[0][1];
    etat(doc, p.etat_general, x + 8, y + 7);
    x += colsS[1][1];
    doc.font('texte').fontSize(9).fillColor(C.taupe).text(String(p.elements.length), x, y + 7, { width: 60, align: 'center' });
    doc.text(String(p.photos.length), x + 60, y + 7, { width: 60, align: 'center' });
    doc.moveTo(M, y + 24).lineTo(M + L, y + 24).lineWidth(0.4).strokeColor(C.ligne).stroke();
    doc.x = M; doc.y = y + 24;
  });

  // -------------------------------------------------------------------- Pièces
  edl.pieces.forEach((piece, n) => {
    doc.addPage();
    surtitre(`Pièce ${n + 1} sur ${edl.pieces.length}${piece.type !== piece.nom ? `  ·  ${piece.type}` : ''}`, M, 70);
    const yT = doc.y + 4;
    doc.font('titre').fontSize(26).fillColor(C.encre).text(piece.nom, M, yT, { width: L - 150 });
    const yApres = doc.y;
    if (piece.etat_general) {
      doc.font('texte').fontSize(7).fillColor(C.gris).text('ÉTAT GÉNÉRAL', M + L - 140, yT + 2, { width: 140, align: 'right', characterSpacing: 1.2 });
      etat(doc, piece.etat_general, M + L - 140, yT + 15, { droite: true, taille: 10 });
    }
    doc.y = Math.max(yApres, yT + 34) + 8;

    if (piece.resume_ia) {
      doc.font('titreItalique').fontSize(12.5);
      const h = doc.heightOfString(piece.resume_ia, { width: L - 22, lineGap: 2 });
      place(h + 10);
      const y = doc.y;
      doc.rect(M, y, 2, h + 4).fill(C.bronze);
      doc.fillColor(C.taupe).text(piece.resume_ia, M + 16, y + 1, { width: L - 22, lineGap: 2 });
      doc.y += 6;
    }
    if (piece.observations) {
      surtitre('Observations', M, doc.y + 6);
      doc.font('texte').fontSize(9.5).fillColor(C.encre).text(piece.observations, M, doc.y + 4, { width: L });
    }

    section('Inventaire');
    inventaire(doc, piece.elements, L, place);

    if (piece.photos.length) {
      section('Photos', (L - 20) / 3 * 0.72 + 60);
      galerie(doc, piece.photos, L, place);
    }
  });

  // ------------------------------------------------- Observations et signatures
  doc.addPage();
  doc.y = 70;
  section('Observations générales');
  doc.font('texte').fontSize(10).fillColor(edl.observations ? C.encre : C.gris).text(edl.observations || 'Néant.', M, doc.y, { width: L });

  section('Signatures');
  doc.font('texte').fontSize(9).fillColor(C.gris)
    .text(`Fait en deux exemplaires, le ${dateFr(edl.date)}. Chaque partie a relu le présent état des lieux et l'accepte en apposant sa signature précédée de la mention « Lu et approuvé ».`,
      M, doc.y, { width: L, lineGap: 1.5 });
  doc.y += 12;
  place(170);
  const yS = doc.y, hS = 150;
  const signataires = [
    ['Le bailleur', edl.proprietaire, edl.sig_bailleur, edl.sig_bailleur_nom, edl.sig_bailleur_le],
    ['Le locataire', edl.locataire, edl.sig_locataire, edl.sig_locataire_nom, edl.sig_locataire_le],
  ];
  signataires.forEach(([label, personne, image, nom, le], i) => {
    const x = M + i * (col + 14);
    carte(x, yS, col, hS);
    surtitre(label, x + 16, yS + 14);
    doc.font('titre').fontSize(13).fillColor(C.encre).text(nom || nomComplet(personne), x + 16, yS + 26, { width: col - 32 });
    doc.roundedRect(x + 12, yS + 48, col - 24, 76, 4).fill('#ffffff');
    if (image) {
      doc.image(Buffer.from(image.split(',')[1], 'base64'), x + 18, yS + 52, { fit: [col - 36, 68], align: 'center', valign: 'center' });
      doc.font('texte').fontSize(7).fillColor(C.gris)
        .text(`Lu et approuvé — signé électroniquement le ${dateHeure(le)}`, x + 16, yS + 132, { width: col - 32 });
    } else {
      doc.font('texte').fontSize(7).fillColor(C.grisClair).text('« Lu et approuvé » et signature', x + 16, yS + 132, { width: col - 32 });
    }
  });
  doc.x = M; doc.y = yS + hS + 18;
  doc.font('texte').fontSize(7.5).fillColor(C.gris).text(
    "État des lieux établi contradictoirement entre les parties lors de la remise des clés, conformément à l'article 3-2 "
    + 'de la loi n° 89-462 du 6 juillet 1989. Un exemplaire est remis à chacune des parties.', M, doc.y, { width: L, lineGap: 1.5 });

  // ------------------------------------------------ En-têtes et pieds de page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // écrire dans la marge basse ne doit pas créer de page
    cle(doc, M, 30, 0.2);
    doc.font('titre').fontSize(11).fillColor(C.encre).text('BREMAKEYS', M + 50, 26, { characterSpacing: 3, lineBreak: false });
    doc.font('texte').fontSize(7.5).fillColor(C.gris)
      .text(`État des lieux ${typeLong}  ·  ${edl.bien.nom}`, M, 29, { width: L, align: 'right', lineBreak: false });
    doc.moveTo(M, 46).lineTo(M + L, 46).lineWidth(0.5).strokeColor(C.ligne).stroke();
    const yF = doc.page.height - 38;
    doc.moveTo(M, yF - 8).lineTo(M + L, yF - 8).lineWidth(0.5).strokeColor(C.ligne).stroke();
    doc.font('texte').fontSize(7.5).fillColor(C.gris)
      .text(`${reference(edl)}${signe ? '  ·  Document signé par les deux parties' : ''}`, M, yF, { lineBreak: false })
      .text(`${i + 1} / ${range.count}`, M, yF, { width: L, align: 'right', lineBreak: false });
  }
  doc.end();
}

// Clé stylisée (anneau, tige, panneton) en bronze
function cle(doc, x, y, s) {
  doc.save().translate(x, y).scale(s);
  doc.circle(28, 30, 22).lineWidth(10).strokeColor(C.bronze).stroke();
  doc.roundedRect(52, 26, 160, 8, 4).fill(C.bronze);
  doc.path('M176 33h30v5.5h-4.5v7h-6v-4h-5v6.5h-6v-5h-8.5z').fill(C.bronze);
  doc.restore();
}

// Sceau « signé » en bronze, façon tampon
function sceau(doc, cx, cy) {
  doc.save();
  doc.circle(cx, cy, 40).lineWidth(1).strokeColor(C.bronze).stroke();
  doc.circle(cx, cy, 35).lineWidth(0.5).strokeColor(C.bronze).stroke();
  doc.font('texteGras').fontSize(6).fillColor(C.bronze).text('DOCUMENT', cx - 40, cy - 17, { width: 80, align: 'center', characterSpacing: 1.5 });
  doc.font('titre').fontSize(17).fillColor(C.bronze).text('Signé', cx - 40, cy - 9, { width: 80, align: 'center' });
  doc.font('texteGras').fontSize(5.5).fillColor(C.bronze).text('PAR LES PARTIES', cx - 40, cy + 11, { width: 80, align: 'center', characterSpacing: 1 });
  doc.restore();
}

// État : pastille de couleur + libellé
function etat(doc, valeur, x, y, { droite = false, taille = 9 } = {}) {
  const texte = valeur || 'Non renseigné';
  const couleur = ETAT_COULEUR[valeur] || C.grisClair;
  doc.font('texteMoyen').fontSize(taille);
  const w = doc.widthOfString(texte) + 12;
  const x0 = droite ? x + 140 - w : x;
  doc.circle(x0 + 3.5, y + taille * 0.55, 3.2).fill(couleur);
  doc.fillColor(valeur ? C.encre : C.gris).text(texte, x0 + 12, y, { lineBreak: false });
}

function enteteTableau(doc, cols) {
  const y = doc.y;
  let x = M;
  doc.font('texte').fontSize(7).fillColor(C.gris);
  for (const [t, w, align, retrait = 0] of cols) {
    doc.text(t.toUpperCase(), x + retrait, y, { width: w - retrait, align, characterSpacing: 1.2 });
    x += w;
  }
  doc.moveTo(M, y + 14).lineTo(M + cols.reduce((s, [, w]) => s + w, 0), y + 14).lineWidth(0.8).strokeColor(C.taupe).stroke();
  doc.x = M; doc.y = y + 15;
}

// Inventaire groupé par catégorie : élément (et commentaire dessous), quantité, état
function inventaire(doc, elements, L, place) {
  if (!elements.length) {
    doc.font('titreItalique').fontSize(12).fillColor(C.gris).text('Aucun élément inventorié.', M, doc.y);
    return;
  }
  const cols = [['Élément', L - 190, 'left', 10], ['Qté', 50, 'center'], ['État', 140, 'left', 6]];
  enteteTableau(doc, cols);
  for (const [cat, libelle] of CATEGORIES) {
    const lignes = elements.filter((e) => (e.categorie || 'autre') === cat
      || (cat === 'autre' && !CATEGORIES.some(([c]) => c === e.categorie)));
    if (!lignes.length) continue;
    place(46);
    const yc = doc.y;
    doc.rect(M, yc, L, 18).fill(C.sable);
    doc.font('texteGras').fontSize(7).fillColor(C.taupe).text(libelle.toUpperCase(), M + 10, yc + 6, { characterSpacing: 1.5 });
    doc.x = M; doc.y = yc + 18;
    for (const e of lignes) {
      doc.font('texteMoyen').fontSize(9.5);
      const hNom = doc.heightOfString(e.nom, { width: cols[0][1] - 20 });
      doc.font('texte').fontSize(8);
      const hCom = e.commentaire ? doc.heightOfString(e.commentaire, { width: cols[0][1] - 20 }) + 2 : 0;
      const h = Math.max(26, hNom + hCom + 14);
      place(h);
      const y = doc.y;
      doc.font('texteMoyen').fontSize(9.5).fillColor(C.encre).text(e.nom, M + 10, y + 7, { width: cols[0][1] - 20 });
      if (e.commentaire) doc.font('texte').fontSize(8).fillColor(C.gris).text(e.commentaire, M + 10, doc.y + 2, { width: cols[0][1] - 20 });
      doc.font('texteMoyen').fontSize(9.5).fillColor(C.encre).text(String(e.quantite), M + cols[0][1], y + 7, { width: cols[1][1], align: 'center' });
      etat(doc, e.etat, M + cols[0][1] + cols[1][1] + 6, y + 7);
      doc.moveTo(M, y + h).lineTo(M + L, y + h).lineWidth(0.4).strokeColor(C.ligne).stroke();
      doc.x = M; doc.y = y + h;
    }
  }
}

// Photos en grille, coins arrondis, recadrées pour remplir la vignette
function galerie(doc, liste, L, place) {
  const par = 3, gap = 10, w = (L - gap * (par - 1)) / par, h = w * 0.72;
  const fichiers = liste.map((p) => path.join(PHOTOS_DIR, p.fichier)).filter((f) => fs.existsSync(f));
  fichiers.forEach((f, i) => {
    if (i % par === 0) { if (i) doc.y += h + 22; place(h + 22); }
    const x = M + (i % par) * (w + gap), y = doc.y;
    doc.save().roundedRect(x, y, w, h, 5).clip();
    doc.image(f, x, y, { cover: [w, h], align: 'center', valign: 'center' });
    doc.restore();
    doc.font('texte').fontSize(7).fillColor(C.gris).text(`Photo ${i + 1}`, x, y + h + 5, { width: w, lineBreak: false });
    doc.y = y;
  });
  if (fichiers.length) doc.y += h + 22;
  doc.x = M;
}
