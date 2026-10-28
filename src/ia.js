import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { PHOTOS_DIR } from './db.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

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
On te transmet les photos d'une pièce d'un logement. Établis l'inventaire de ce qui est visible :

- Revêtements (catégorie "revetement") : sol, murs, plafond — matériau, couleur et état.
- Menuiseries : portes, fenêtres, volets, placards.
- Électricité : interrupteurs, prises, luminaires, radiateurs électriques (compte-les).
- Plomberie / sanitaires : évier, lavabo, robinetterie, WC, douche, baignoire.
- Équipements : électroménager, chaudière, VMC, détecteur de fumée…
- Mobilier : canapés, lits, chaises, tables, lampes, armoires… avec les quantités exactes.

Règles :
- Ne liste que ce que tu vois réellement sur les photos ; n'invente rien.
- Regroupe les objets identiques en une seule ligne avec la quantité (ex. 4 chaises).
- Une même chose visible sur plusieurs photos ne doit être comptée qu'une fois.
- Évalue l'état avec l'échelle imposée et décris précisément les défauts visibles
  (rayures, taches, fissures, trous, traces d'humidité, éclats, jaunissement…).
- Si un état est difficile à juger sur photo, choisis l'état le plus probable et précise-le dans le commentaire.
- Rédige en français, de façon factuelle et concise, comme dans un état des lieux officiel.`;

function photoBlock(fichier) {
  const data = fs.readFileSync(path.join(PHOTOS_DIR, fichier)).toString('base64');
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
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: contexte },
        ...photos.map((p) => photoBlock(p.fichier)),
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
