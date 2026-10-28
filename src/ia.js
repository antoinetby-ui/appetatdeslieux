import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import path from 'node:path';
import { PHOTOS_DIR } from './db.js';

// Réglages de coût (modifiables dans les variables d'environnement, sans toucher au code) :
// - CLAUDE_MODEL : modèle utilisé ; par défaut le moins cher (Haiku). claude-sonnet-5-5 ou
//   claude-opus-5-5 sont plus précis mais coûtent ~20 à 40× plus.
// - CLAUDE_EFFORT : profondeur de réflexion (low | medium | high) ; low réduit la réponse facturée.
// - IA_IMAGE_MAX : taille des photos envoyées à l'IA, en pixels ; le PDF garde les photos d'origine.
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
const EFFORT = process.env.CLAUDE_EFFORT || 'low';
const IMAGE_MAX = Number(process.env.IA_IMAGE_MAX) || 1024;
// Repli automatique en cas de refus du modèle : pris en charge par Opus 5.x, Sonnet 5.5 et Fable.
const FALLBACK = /^claude-(opus-5|sonnet-5-5|fable-5)/.test(MODEL);

export const ETATS = ['Neuf', 'Très bon état', 'Bon état', 'État d\'usage', 'Mauvais état', 'Hors service'];
export const CATEGORIES = ['revetement', 'mobilier', 'equipement', 'electricite', 'plomberie', 'menuiserie', 'autre'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['etat_general', 'resume', 'elements'],
  properties: {
    etat_general: { type: 'string', enum: ETATS },
    resume: { type: 'string', description: 'Description synthétique de la pièce et de son état, 2 à 4 phrases.' },
    elements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['categorie', 'nom', 'quantite', 'etat', 'commentaire'],
        properties: {
          categorie: { type: 'string', enum: CATEGORIES },
          nom: { type: 'string' },
          quantite: { type: 'integer' },
          etat: { type: 'string', enum: ETATS },
          commentaire: { type: 'string', description: 'Défauts visibles, matériau, couleur. Chaîne vide si rien à signaler.' },
        },
      },
    },
  },
};

const SYSTEM = `Tu es un expert en états des lieux immobiliers en France (location, loi ALUR).
On te transmet plusieurs photos (souvent 5 à 10) d'une même pièce, prises sous différents angles.
Établis l'inventaire de la pièce tel qu'il figurerait dans un état des lieux professionnel.

Ce qu'il faut relever :
- Revêtements (catégorie "revetement") : une ligne pour le sol, une pour les murs, une pour le plafond,
  avec matériau, couleur et état.
- Menuiseries : portes, fenêtres, volets, placards intégrés.
- Électricité : prises, interrupteurs, luminaires fixes, radiateurs — avec le nombre.
- Plomberie : évier, lavabo, robinetterie, WC, douche, baignoire.
- Équipements : électroménager, chaudière, VMC, détecteur de fumée.
- Mobilier : chaque meuble (canapé, fauteuil, table, chaises, lit, matelas, armoire, commode,
  étagère, meuble TV, lampe, miroir, rideaux…) avec la quantité, le matériau ou la couleur,
  et la taille quand elle est utile (ex. « Canapé 3 places tissu gris », « Lit 140 × 190 »).

Ce qu'il ne faut PAS relever :
- Les objets personnels et la décoration sans valeur d'inventaire : livres, bibelots, plantes,
  coussins, vêtements, vaisselle posée, appareils électroniques personnels, produits ménagers.
- Les détails sans intérêt pour un état des lieux (vis, câbles, plinthes sauf si abîmées).

Règles :
- Ne liste que ce que tu vois réellement ; n'invente rien.
- Les photos montrent la MÊME pièce : un objet visible sur plusieurs photos ne compte qu'une fois.
  Croise les angles pour compter juste (ex. 4 chaises autour d'une table, pas 8).
- Regroupe les objets identiques en une seule ligne avec la quantité.
- Vise en général 10 à 25 lignes par pièce : précis sur le mobilier, sans énumérer l'accessoire.
- Commentaire : 15 mots maximum — matériau/couleur puis défauts visibles (rayure, tache, fissure,
  trou, éclat, trace d'humidité, jaunissement…). Chaîne vide si rien à signaler.
- Évalue l'état avec l'échelle imposée ; si c'est difficile à juger sur photo, choisis l'état le
  plus probable et indique « à vérifier » dans le commentaire.
- Rédige en français, de façon factuelle et concise.`;

async function photoBlock(fichier) {
  const data = (await sharp(path.join(PHOTOS_DIR, fichier))
    .resize(IMAGE_MAX, IMAGE_MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 }).toBuffer()).toString('base64');
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } };
}

let client;

export async function analyserPiece({ piece, photos, bien, manuels = [] }) {
  if (!photos.length) throw new Error('Ajoutez au moins une photo avant de lancer l\'analyse.');
  const cle = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!cle) throw new Error('Clé API Anthropic absente : renseignez ANTHROPIC_API_KEY.');
  if (!/^[\x21-\x7e]+$/.test(cle)) {
    throw new Error('Clé API mal copiée (elle contient « … », un espace ou un accent) : '
      + 'créez une nouvelle clé sur console.anthropic.com et copiez-la avec le bouton « Copy ».');
  }
  client ??= new Anthropic({ apiKey: cle });

  const contexte = [
    `Pièce : ${piece.nom} (type : ${piece.type}).`,
    bien ? `Bien : ${bien.type || 'logement'}${bien.meuble ? ' meublé' : ' non meublé'}.` : '',
    manuels.length
      ? `Éléments déjà saisis à la main (ne les répète pas dans ta liste) : ${manuels.map((e) => `${e.quantite} × ${e.nom}`).join(', ')}.`
      : '',
    `${photos.length} photo(s) de cette pièce suivent.`,
  ].filter(Boolean).join('\n');

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    ...(FALLBACK && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
    output_config: {
      effort: EFFORT,
      format: { type: 'json_schema', schema: SCHEMA },
    },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: contexte },
        ...(await Promise.all(photos.map((p) => photoBlock(p.fichier)))),
        { type: 'text', text: 'Établis l\'inventaire et l\'état de cette pièce.' },
      ],
    }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('L\'analyse a été refusée par le modèle pour ces photos.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Réponse de l\'IA tronquée : essayez avec moins de photos.');
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const result = JSON.parse(text);
  result.elements = result.elements.map((e) => ({ ...e, quantite: Math.max(1, e.quantite | 0) }));
  return result;
}
