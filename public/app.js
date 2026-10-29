// Application monopage : routage par hash, rendu DOM sans framework.
const $app = document.getElementById('app');
let catalogue = { typesPieces: [], etats: [], categories: [] };

// Ordre d'affichage de l'inventaire (identique au PDF)
const CATEGORIES = {
  revetement: 'Revêtement', menuiserie: 'Menuiserie', electricite: 'Électricité', plomberie: 'Plomberie',
  equipement: 'Équipement', mobilier: 'Mobilier', autre: 'Autre',
};
const CATEGORIES_PLURIEL = {
  revetement: 'Revêtements', menuiserie: 'Menuiseries', electricite: 'Électricité', plomberie: 'Plomberie',
  equipement: 'Équipements', mobilier: 'Mobilier', autre: 'Autres',
};
const COULEURS_ETAT = {
  'Neuf': '#4f6f4f', 'Très bon état': '#5f7a5a', 'Bon état': '#7d8a52',
  "État d'usage": '#a68a64', 'Mauvais état': '#b0703c', 'Hors service': '#9c4a3c',
};
const pastilleEtat = (etat) => h('span', { class: 'etat' },
  h('span', { class: 'point', style: `background:${COULEURS_ETAT[etat] ?? '#c9bfb0'}` }), etat || 'État non renseigné');

// --- Icônes (trait fin, couleur héritée) --------------------------------------
const ICONES = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  maison: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  nouveau: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/>',
  edl: '<path d="M9 4h6v3H9z"/><path d="M15 5.5h2a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4.5"/>',
  biens: '<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9.5 21v-5h5v5"/><path d="M9.5 10.5h5"/>',
  proprietaires: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  locataires: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  sortie: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  signature: '<path d="M3 17c3-1 4.5-6 6.5-6S10 17 12 17s2.5-3 4-3 2 2 5 2"/><path d="M3 21h18"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  photo: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.5"/>',
  galerie: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  telecharger: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 19h16"/>',
};
function icone(nom) {
  const span = document.createElement('span');
  span.className = 'icone';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICONES[nom]}</svg>`;
  return span;
}

// --- Utilitaires -------------------------------------------------------------
function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat(Infinity)) if (e != null && e !== false) el.append(e.nodeType ? e : String(e));
  return el;
}

async function api(url, { method = 'GET', body } = {}) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(`/api${url}`, opts);
  if (r.status === 401 && url !== '/login') {
    vueConnexion();
    throw Object.assign(new Error('Session expirée, reconnectez-vous.'), { deconnecte: true });
  }
  if (r.status === 204) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
  return data;
}

let toastTimer;
function toast(msg, erreur = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast${erreur ? ' erreur' : ''}`; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), erreur ? 6000 : 2500);
}

const nomPersonne = (p) => [p.prenom, p.nom].filter(Boolean).join(' ') + (p.societe ? ` — ${p.societe}` : '');
const dateFr = (d) => new Date(d).toLocaleDateString('fr-FR');
// Horodatages SQLite en UTC (« AAAA-MM-JJ HH:MM:SS ») affichés à l'heure locale.
const dateHeure = (d) => new Date(`${d.replace(' ', 'T')}Z`).toLocaleString('fr-FR',
  { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const debounce = (fn, ms = 500) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function champ(label, input) { return h('div', {}, h('label', {}, label), input); }

// `feuille` : sur téléphone, la fenêtre monte du bas de l'écran
function modale(contenu, { feuille = false } = {}) {
  const voile = h('div', { class: `voile${feuille ? ' feuille' : ''}`, onclick: (e) => e.target === voile && voile.remove() },
    h('div', { class: 'modale' }, contenu));
  document.body.append(voile);
  return () => voile.remove();
}

// Zone de signature au doigt / à la souris, nette sur écrans haute densité.
function padSignature() {
  const canvas = h('canvas', { class: 'pad' });
  const ctx = canvas.getContext('2d');
  let traits = 0, dernier = null, milieuPrec = null;
  const point = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); dernier = point(e); traits++; ctx.beginPath(); ctx.arc(...dernier, 1.1, 0, 7); ctx.fill(); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dernier) return;
    const p = point(e);
    const milieu = [(dernier[0] + p[0]) / 2, (dernier[1] + p[1]) / 2];
    ctx.beginPath(); ctx.moveTo(...(milieuPrec ?? dernier)); ctx.quadraticCurveTo(...dernier, ...milieu); ctx.stroke();
    milieuPrec = milieu; dernier = p;
  });
  const fin = () => { dernier = null; milieuPrec = null; };
  canvas.addEventListener('pointerup', fin);
  canvas.addEventListener('pointercancel', fin);
  const preparer = () => {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.scale(dpr, dpr);
    Object.assign(ctx, { lineWidth: 2.2, lineCap: 'round', lineJoin: 'round', strokeStyle: '#2f2a24', fillStyle: '#2f2a24' });
    traits = 0;
  };
  return {
    element: h('div', { class: 'pad-cadre' }, canvas, h('span', { class: 'pad-ligne' }, 'Signez ici')),
    dimensionner: () => requestAnimationFrame(preparer),
    effacer: preparer,
    vide: () => traits === 0,
    image: () => canvas.toDataURL('image/png'),
  };
}

// Convertit une photo en JPEG de 1600 px maximum, orientation corrigée.
// En cas d'échec (navigateur ancien), le fichier d'origine est envoyé tel quel.
async function preparerPhoto(fichier, max = 1600) {
  try {
    let image;
    try {
      image = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    } catch {
      const url = URL.createObjectURL(fichier);
      image = await new Promise((ok, ko) => { const img = new Image(); img.onload = () => ok(img); img.onerror = ko; img.src = url; })
        .finally(() => URL.revokeObjectURL(url));
    }
    const l = image.width, ha = image.height, r = Math.min(1, max / Math.max(l, ha));
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(l * r), height: Math.round(ha * r) });
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob) return fichier;
    return new File([blob], (fichier.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return fichier;
  }
}

function visionneuse(src) {
  const v = h('div', { class: 'voile visionneuse', onclick: () => v.remove() }, h('img', { src }));
  document.body.append(v);
}

async function action(btn, fn, libelle) {
  const ancien = [...btn.childNodes];
  btn.disabled = true;
  btn.replaceChildren(h('span', { class: 'spinner' }), libelle ?? '');
  try { await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.replaceChildren(...ancien); }
}

// --- Personnes (propriétaires / locataires) ---------------------------------
const PERSONNES = {
  proprietaires: { titre: 'Propriétaires', un: 'propriétaire', champs: ['civilite', 'prenom', 'nom', 'societe', 'adresse', 'telephone', 'email'] },
  locataires: { titre: 'Locataires', un: 'locataire', champs: ['civilite', 'prenom', 'nom', 'adresse', 'telephone', 'email'] },
};
const LIBELLES = { civilite: 'Civilité', prenom: 'Prénom', nom: 'Nom *', societe: 'Société / SCI', adresse: 'Adresse', telephone: 'Téléphone', email: 'E-mail' };

function formPersonne(table, existant = {}, apres) {
  const conf = PERSONNES[table];
  const inputs = {};
  for (const c of conf.champs) {
    inputs[c] = c === 'civilite'
      ? h('select', {}, ['', 'M.', 'Mme', 'M. et Mme'].map((v) => h('option', { value: v, selected: existant[c] === v }, v || '—')))
      : h('input', { value: existant[c] ?? '', type: c === 'email' ? 'email' : c === 'telephone' ? 'tel' : 'text' });
  }
  const fermer = modale(h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim() || null]));
      try {
        const r = await api(`/${table}${existant.id ? `/${existant.id}` : ''}`, { method: existant.id ? 'PUT' : 'POST', body });
        fermer(); toast('Enregistré'); apres?.(r);
      } catch (err) { toast(err.message, true); }
    },
  },
  h('h2', {}, existant.id ? `Modifier le ${conf.un}` : `Nouveau ${conf.un}`),
  h('div', { class: 'grille' }, conf.champs.map((c) => champ(LIBELLES[c], inputs[c]))),
  h('div', { class: 'actions' }, h('button', { class: 'primaire', type: 'submit' }, 'Enregistrer'), h('button', { type: 'button', onclick: () => fermer() }, 'Annuler'))));
  inputs.nom.focus();
}

async function vuePersonnes(table) {
  const conf = PERSONNES[table];
  const liste = await api(`/${table}`);
  $app.replaceChildren(
    h('div', { class: 'entete' }, h('h1', {}, conf.titre),
      h('button', { class: 'primaire', onclick: () => formPersonne(table, {}, () => router()) }, `+ Nouveau ${conf.un}`)),
    liste.length ? h('div', { class: 'liste' }, liste.map((p) => h('div', { class: 'ligne' },
      h('div', {}, h('div', { class: 'titre' }, [p.civilite, nomPersonne(p)].filter(Boolean).join(' ')),
        h('div', { class: 'sous' }, [p.adresse, p.telephone, p.email].filter(Boolean).join(' · '))),
      h('div', { class: 'actions' },
        h('button', { class: 'petit', onclick: () => formPersonne(table, p, () => router()) }, 'Modifier'),
        h('button', { class: 'petit danger', onclick: async () => {
          if (!confirm(`Supprimer ${nomPersonne(p)} ?`)) return;
          try { await api(`/${table}/${p.id}`, { method: 'DELETE' }); router(); } catch (e) { toast(e.message, true); }
        } }, 'Supprimer')))))
      : h('div', { class: 'vide' }, `Aucun ${conf.un} enregistré.`));
}

// --- Biens -------------------------------------------------------------------
async function vueBiens() {
  const biens = await api('/biens');
  $app.replaceChildren(
    h('div', { class: 'entete' }, h('h1', {}, 'Biens'), h('a', { class: 'btn primaire', href: '#/biens/nouveau' }, '+ Nouveau bien')),
    biens.length ? h('div', { class: 'liste' }, biens.map((b) => h('div', { class: 'ligne' },
      h('div', {}, h('div', { class: 'titre' }, b.nom),
        h('div', { class: 'sous' }, [b.type, [b.adresse, b.ville].filter(Boolean).join(', '), `${b.nb_pieces} pièce(s)/espace(s)`].filter(Boolean).join(' · '))),
      h('div', { class: 'actions' },
        h('a', { class: 'btn petit', href: `#/biens/${b.id}` }, 'Modifier'),
        h('button', { class: 'petit danger', onclick: async () => {
          if (!confirm(`Supprimer le bien « ${b.nom} » ?`)) return;
          try { await api(`/biens/${b.id}`, { method: 'DELETE' }); router(); } catch (e) { toast(e.message, true); }
        } }, 'Supprimer')))))
      : h('div', { class: 'vide' }, 'Aucun bien enregistré.'));
}

async function vueBien(id) {
  const bien = id === 'nouveau' ? { pieces: [], meuble: 0 } : await api(`/biens/${id}`);
  const pieces = bien.pieces.map((p) => ({ ...p }));
  const f = {
    nom: h('input', { value: bien.nom ?? '', placeholder: 'ex. Appartement Rue Victor Hugo' }),
    type: h('select', {}, ['', 'Appartement', 'Maison', 'Studio', 'Loft', 'Local commercial', 'Autre'].map((v) => h('option', { value: v, selected: bien.type === v }, v || '—'))),
    adresse: h('input', { value: bien.adresse ?? '' }),
    code_postal: h('input', { value: bien.code_postal ?? '', inputMode: 'numeric' }),
    ville: h('input', { value: bien.ville ?? '' }),
    surface: h('input', { value: bien.surface ?? '', type: 'number', step: '0.01', min: 0 }),
    etage: h('input', { value: bien.etage ?? '' }),
    notes: h('textarea', { value: bien.notes ?? '' }),
  };
  const meuble = h('input', { type: 'checkbox', checked: !!bien.meuble });
  const $liste = h('div', { class: 'pieces-bien' });
  const $titrePieces = h('h2', {});

  const ajouter = (type) => {
    const n = pieces.filter((p) => p.type === type).length;
    pieces.push({ type, nom: n ? `${type} ${n + 1}` : type });
    // Numérote la première si on en ajoute une deuxième du même type (Chambre → Chambre 1)
    if (n === 1) { const premiere = pieces.find((p) => p.type === type); if (premiere.nom === type) premiere.nom = `${type} 1`; }
    dessiner();
  };
  const deplacer = (i, d) => { const j = i + d; if (j < 0 || j >= pieces.length) return; [pieces[i], pieces[j]] = [pieces[j], pieces[i]]; dessiner(); };
  function dessiner() {
    $titrePieces.textContent = `Pièces et espaces (${pieces.length})`;
    $liste.replaceChildren(...(pieces.length ? pieces.map((p, i) => h('div', { class: 'item' },
      h('span', { class: 'type' }, p.type),
      h('input', { value: p.nom, oninput: (e) => (p.nom = e.target.value) }),
      h('button', { class: 'petit', type: 'button', title: 'Monter', onclick: () => deplacer(i, -1) }, '↑'),
      h('button', { class: 'petit', type: 'button', title: 'Descendre', onclick: () => deplacer(i, 1) }, '↓'),
      h('button', { class: 'petit danger', type: 'button', title: 'Retirer', onclick: () => { pieces.splice(i, 1); dessiner(); } }, '✕')))
      : [h('div', { class: 'sous' }, 'Cliquez sur les pièces ci-dessus pour les ajouter.')]));
  }
  dessiner();

  const autre = h('input', { placeholder: 'Autre (ex. Local vélo, Chaufferie…)' });
  const ajouterAutre = () => { if (autre.value.trim()) { ajouter(autre.value.trim()); autre.value = ''; } };

  $app.replaceChildren(
    h('div', { class: 'entete' }, h('h1', {}, id === 'nouveau' ? 'Nouveau bien' : bien.nom), h('a', { class: 'btn', href: '#/biens' }, '← Retour')),
    h('form', { onsubmit: async (e) => {
      e.preventDefault();
      const body = { ...Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value.trim()])), meuble: meuble.checked, pieces };
      try {
        const r = await api(`/biens${bien.id ? `/${bien.id}` : ''}`, { method: bien.id ? 'PUT' : 'POST', body });
        toast('Bien enregistré');
        const retour = sessionStorage.getItem('retourApresBien');
        if (retour) { sessionStorage.removeItem('retourApresBien'); location.hash = `${retour}?bien=${r.id}`; } else location.hash = '#/biens';
      } catch (err) { toast(err.message, true); }
    } },
    h('div', { class: 'carte' }, h('h2', {}, 'Informations'),
      h('div', { class: 'grille' }, champ('Nom du bien *', f.nom), champ('Type', f.type), champ('Surface (m²)', f.surface), champ('Étage', f.etage)),
      h('div', { class: 'grille' }, champ('Adresse', f.adresse), champ('Code postal', f.code_postal), champ('Ville', f.ville)),
      h('label', { class: 'case' }, meuble, 'Location meublée'),
      champ('Notes', f.notes)),
    h('div', { class: 'carte' }, $titrePieces,
      h('div', { class: 'puces' }, catalogue.typesPieces.map((t) => h('button', { type: 'button', class: 'puce', onclick: () => ajouter(t) }, `+ ${t}`))),
      h('div', { class: 'actions', style: 'margin-bottom:12px' }, autre, h('button', { type: 'button', onclick: ajouterAutre }, 'Ajouter')),
      $liste),
    h('button', { class: 'primaire', type: 'submit' }, 'Enregistrer le bien')),
    bien.id && h('div', { class: 'carte rappel-photos' },
      icone('photo'),
      h('div', {}, h('strong', {}, 'Les photos se prennent dans l\'état des lieux'),
        h('p', { class: 'sous' }, 'La fiche du bien décrit les pièces. Les photos et l\'analyse IA se font pièce par pièce, dans un état des lieux.')),
      h('a', { class: 'btn primaire', href: `#/edl/nouveau?bien=${bien.id}` }, 'Créer un état des lieux')));
  autre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterAutre(); } });
}

// --- États des lieux ---------------------------------------------------------
const STATUTS = { brouillon: ['Brouillon', ''], termine: ['Terminé', 'ok'], signe: ['Signé', 'ok'] };
const badgeStatut = (statut) => { const [t, c] = STATUTS[statut] ?? STATUTS.brouillon; return h('span', { class: `badge ${c}` }, t); };

const ligneEdl = (e) => h('a', { class: 'ligne lien', href: `#/edl/${e.id}` },
  h('div', {}, h('div', { class: 'titre' }, `${e.type === 'sortie' ? 'Sortie' : 'Entrée'} — ${e.bien}`),
    h('div', { class: 'sous' }, `${dateFr(e.date)} · ${e.proprietaire} → ${e.locataire}`)),
  badgeStatut(e.statut));

async function vueAccueil() {
  const [edls, biens, proprietaires, locataires] = await Promise.all(
    ['/edl', '/biens', '/proprietaires', '/locataires'].map((u) => api(u)));
  const enCours = edls.filter((e) => e.statut !== 'signe').length;
  const tuile = (href, nom, titre, detail) => h('a', { class: 'tuile', href }, icone(nom), h('span', { class: 'tuile-titre' }, titre),
    detail && h('span', { class: 'tuile-detail' }, detail));
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  $app.replaceChildren(h('div', { class: 'accueil' },
    h('p', { class: 'surtitre' }, new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })),
    h('h1', {}, 'Bienvenue'),
    h('div', { class: 'tuiles' },
      h('a', { class: 'tuile vedette', href: '#/edl/nouveau' }, icone('nouveau'),
        h('span', { class: 'tuile-titre' }, 'Nouvel état des lieux'), h('span', { class: 'tuile-detail' }, 'Entrée ou sortie')),
      tuile('#/edl', 'edl', 'États des lieux', enCours ? `${enCours} en cours` : pluriel(edls.length, 'document')),
      tuile('#/biens', 'biens', 'Biens', pluriel(biens.length, 'bien')),
      tuile('#/proprietaires', 'proprietaires', 'Propriétaires', pluriel(proprietaires.length, 'fiche')),
      tuile('#/locataires', 'locataires', 'Locataires', pluriel(locataires.length, 'fiche'))),
    edls.length > 0 && h('section', { class: 'recents' },
      h('div', { class: 'entete' }, h('h2', {}, 'Récemment'), h('a', { class: 'lien-discret', href: '#/edl' }, 'Tout voir')),
      h('div', { class: 'liste' }, edls.slice(0, 3).map(ligneEdl)))));
}

async function vueListeEdl() {
  const edls = await api('/edl');
  $app.replaceChildren(
    h('div', { class: 'entete' }, h('h1', {}, 'États des lieux'), h('a', { class: 'btn primaire', href: '#/edl/nouveau' }, '+ Nouvel état des lieux')),
    edls.length ? h('div', { class: 'liste' }, edls.map(ligneEdl))
      : h('div', { class: 'vide' }, 'Aucun état des lieux. Commencez par créer un propriétaire, un locataire et un bien, puis un état des lieux.'));
}

async function vueNouvelEdl(params) {
  const [proprietaires, locataires, biens] = await Promise.all([api('/proprietaires'), api('/locataires'), api('/biens')]);
  const select = (liste, libelle, choisi) => h('select', {}, h('option', { value: '' }, '— Choisir —'),
    liste.map((x) => h('option', { value: x.id, selected: String(x.id) === choisi }, libelle(x))));
  const sP = select(proprietaires, nomPersonne, params.get('proprietaire'));
  const sL = select(locataires, nomPersonne, params.get('locataire'));
  const sB = select(biens, (b) => `${b.nom}${b.ville ? ` (${b.ville})` : ''} — ${b.nb_pieces} pièce(s)`, params.get('bien'));
  const type = h('select', {}, h('option', { value: 'entree' }, "État des lieux d'entrée"), h('option', { value: 'sortie' }, 'État des lieux de sortie'));
  const date = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });

  const etat = () => `?proprietaire=${sP.value}&locataire=${sL.value}&bien=${sB.value}`;
  const nouveau = (table, sel) => h('button', { type: 'button', class: 'petit', onclick: () => formPersonne(table, {}, (r) => {
    sel.append(h('option', { value: r.id }, nomPersonne(r))); sel.value = r.id;
  }) }, '+ Nouveau');

  $app.replaceChildren(
    h('div', { class: 'entete' }, h('h1', {}, 'Nouvel état des lieux'), h('a', { class: 'btn', href: '#/' }, '← Retour')),
    h('form', { class: 'carte', onsubmit: async (e) => {
      e.preventDefault();
      try {
        const r = await api('/edl', { method: 'POST', body: { proprietaire_id: sP.value, locataire_id: sL.value, bien_id: sB.value, type: type.value, date: date.value } });
        location.hash = `#/edl/${r.id}`;
      } catch (err) { toast(err.message, true); }
    } },
    h('div', { class: 'grille' }, champ('Type', type), champ('Date', date)),
    h('div', { class: 'grille' },
      champ('Propriétaire', h('div', { class: 'actions' }, sP, nouveau('proprietaires', sP))),
      champ('Locataire', h('div', { class: 'actions' }, sL, nouveau('locataires', sL)))),
    h('div', { class: 'grille' }, champ('Bien', h('div', { class: 'actions' }, sB,
      h('button', { type: 'button', class: 'petit', onclick: () => {
        sessionStorage.setItem('retourApresBien', '#/edl/nouveau');
        history.replaceState(null, '', `#/edl/nouveau${etat()}`);
        location.hash = '#/biens/nouveau';
      } }, '+ Nouveau')))),
    h('p', { class: 'sous' }, 'Les pièces du bien seront copiées dans l\'état des lieux ; vous pourrez en ajouter ou en retirer ensuite.'),
    h('button', { class: 'primaire', type: 'submit' }, 'Créer l\'état des lieux')));
}

async function vueEdl(id) {
  let edl = await api(`/edl/${id}`);
  const ouvertes = new Set();
  // Pour guider : la première pièce sans photo est ouverte d'office
  const aPhotographier = !edl.sig_bailleur && !edl.sig_locataire && edl.pieces.find((p) => !p.photos.length);
  if (aPhotographier) ouvertes.add(aPhotographier.id);

  const sauverEdl = debounce(async (champs) => { try { await api(`/edl/${id}`, { method: 'PUT', body: champs }); } catch (e) { toast(e.message, true); } });

  function rendre() {
    const defilement = window.scrollY; // le contenu est redessiné : on garde la position à l'écran
    const signe = Boolean(edl.sig_bailleur || edl.sig_locataire);
    const complet = Boolean(edl.sig_bailleur && edl.sig_locataire);
    const typeAjout = h('select', {}, catalogue.typesPieces.map((t) => h('option', { value: t }, t)), h('option', { value: '__autre' }, 'Autre…'));
    const analysees = edl.pieces.filter((p) => p.analyse_at).length;
    $app.replaceChildren(
      h('div', { class: 'entete' },
        h('div', {}, h('h1', {}, `État des lieux ${edl.type === 'sortie' ? 'de sortie' : "d'entrée"} — ${edl.bien.nom}`),
          h('div', { class: 'sous' }, `${dateFr(edl.date)} · ${nomPersonne(edl.proprietaire)} (propriétaire) · ${nomPersonne(edl.locataire)} (locataire)`)),
        h('div', { class: 'actions' },
          complet
            ? h('a', { class: 'btn primaire', href: `/api/edl/${id}/pdf?telecharger` }, icone('telecharger'), 'PDF signé')
            : h('a', { class: 'btn', href: `/api/edl/${id}/pdf`, target: '_blank' }, 'Aperçu PDF'),
          h('a', { class: 'btn', href: '#/edl' }, '← Retour'))),

      signe && h('div', { class: 'bandeau' },
        h('span', {}, complet ? 'Signé par les deux parties — le document est verrouillé.' : 'Signature en cours — le document est verrouillé.'),
        h('button', { class: 'petit', onclick: async () => {
          if (!confirm('Annuler les signatures pour modifier l\'état des lieux ? Il faudra signer à nouveau.')) return;
          try { edl = await api(`/edl/${id}/signatures`, { method: 'DELETE' }); rendre(); } catch (e) { toast(e.message, true); }
        } }, 'Annuler les signatures')),

      h('fieldset', { class: 'zone', disabled: signe },

      h('div', { class: 'carte' },
        h('div', { class: 'grille' },
          champ('Type', h('select', { onchange: (e) => { edl.type = e.target.value; sauverEdl({ type: e.target.value }); } },
            h('option', { value: 'entree', selected: edl.type === 'entree' }, 'Entrée'), h('option', { value: 'sortie', selected: edl.type === 'sortie' }, 'Sortie'))),
          champ('Date', h('input', { type: 'date', value: edl.date, onchange: (e) => sauverEdl({ date: e.target.value }) })),
          champ('Statut', h('select', { onchange: (e) => sauverEdl({ statut: e.target.value }) },
            h('option', { value: 'brouillon', selected: edl.statut === 'brouillon' }, 'Brouillon'), h('option', { value: 'termine', selected: edl.statut === 'termine' }, 'Terminé'),
            edl.statut === 'signe' && h('option', { value: 'signe', selected: true }, 'Signé')))),
        h('div', { class: 'grille' },
          champ('Relevés de compteurs (eau, électricité, gaz)', h('textarea', { value: edl.compteurs ?? '', placeholder: 'ex. Électricité : 012345 kWh — Eau froide : 456 m³', oninput: (e) => sauverEdl({ compteurs: e.target.value }) })),
          champ('Clés remises', h('textarea', { value: edl.cles ?? '', placeholder: 'ex. 2 clés porte d\'entrée, 1 badge, 1 clé boîte aux lettres', oninput: (e) => sauverEdl({ cles: e.target.value }) })))),

      h('div', { class: 'entete' }, h('h2', {}, `Pièces (${analysees}/${edl.pieces.length} analysées)`)),
      ...edl.pieces.map(rendrePiece),

      h('div', { class: 'carte' }, h('h2', {}, 'Ajouter une pièce à cet état des lieux'),
        h('div', { class: 'actions' }, typeAjout, h('button', { onclick: async () => {
          let type = typeAjout.value;
          if (type === '__autre') { type = prompt('Nom de la pièce / de l\'espace :')?.trim(); if (!type) return; }
          const n = edl.pieces.filter((p) => p.type === type).length;
          try { edl = await api(`/edl/${id}/pieces`, { method: 'POST', body: { type, nom: n ? `${type} ${n + 1}` : type } }); ouvertes.add(edl.pieces.at(-1).id); rendre(); } catch (e) { toast(e.message, true); }
        } }, '+ Ajouter'))),

      h('div', { class: 'carte' }, h('h2', {}, 'Observations générales'),
        h('textarea', { value: edl.observations ?? '', oninput: (e) => sauverEdl({ observations: e.target.value }) }))),

      carteSignatures(complet),
    );
    window.scrollTo(0, defilement);
  }

  function carteSignatures(complet) {
    const bloc = (role, titre, personne) => {
      const image = edl[`sig_${role}`];
      return h('div', { class: 'signataire' },
        h('div', { class: 'sous' }, titre),
        image
          ? [h('img', { src: image, alt: `Signature ${titre}` }),
            h('div', { class: 'sous' }, `${edl[`sig_${role}_nom`]} — ${dateHeure(edl[`sig_${role}_le`])}`)]
          : h('button', { class: 'zone-signer', onclick: () => signer(role, titre, nomPersonne(personne)) }, icone('signature'), 'Signer ici'));
    };
    return h('div', { class: 'carte' }, h('h2', {}, 'Signatures'),
      h('p', { class: 'sous' }, 'Chaque partie relit le document puis signe au doigt sur l\'écran. Une fois signé, l\'état des lieux est verrouillé.'),
      h('div', { class: 'signataires' },
        bloc('bailleur', 'Le bailleur', edl.proprietaire),
        bloc('locataire', 'Le locataire', edl.locataire)),
      complet && h('div', { class: 'actions', style: 'margin-top:16px' },
        h('a', { class: 'btn primaire', href: `/api/edl/${id}/pdf?telecharger` }, icone('telecharger'), 'Télécharger le PDF signé'),
        h('button', { onclick: envoyerMail }, icone('mail'), 'Envoyer par e-mail'),
        edl.envoye_le && h('span', { class: 'sous' }, `Dernier envoi : ${dateHeure(edl.envoye_le)}`)));
  }

  function signer(role, titre, nomDefaut) {
    const nom = h('input', { value: nomDefaut, autocomplete: 'name' });
    const lu = h('input', { type: 'checkbox' });
    const pad = padSignature();
    const fermer = modale(h('div', { class: 'signature-modale' },
      h('h2', {}, `Signature — ${titre.toLowerCase()}`),
      champ('Nom et prénom', nom),
      h('label', { class: 'case' }, lu, 'Lu et approuvé : j\'ai relu l\'état des lieux et j\'en accepte le contenu.'),
      pad.element,
      h('div', { class: 'actions' },
        h('button', { class: 'primaire', onclick: async (e) => {
          if (!nom.value.trim()) return toast('Indiquez le nom du signataire.', true);
          if (!lu.checked) return toast('Cochez « Lu et approuvé ».', true);
          if (pad.vide()) return toast('Signez dans le cadre.', true);
          await action(e.currentTarget, async () => {
            edl = await api(`/edl/${id}/signatures`, { method: 'POST', body: { role, nom: nom.value.trim(), image: pad.image() } });
            fermer(); toast('Signature enregistrée'); rendre();
          });
        } }, 'Valider la signature'),
        h('button', { onclick: pad.effacer }, 'Effacer'),
        h('button', { onclick: () => fermer() }, 'Annuler'))));
    pad.dimensionner();
  }

  function envoyerMail() {
    const dest = h('textarea', { rows: 3, value: [edl.proprietaire.email, edl.locataire.email].filter(Boolean).join('\n') });
    const fermer = modale(h('div', {},
      h('h2', {}, 'Envoyer le PDF signé'),
      champ('Destinataires (une adresse par ligne)', dest),
      h('div', { class: 'actions' },
        h('button', { class: 'primaire', onclick: (e) => action(e.currentTarget, async () => {
          const destinataires = dest.value.split(/[\s,;]+/).filter(Boolean);
          if (!destinataires.length) throw new Error('Ajoutez au moins une adresse.');
          edl = await api(`/edl/${id}/envoyer`, { method: 'POST', body: { destinataires } });
          fermer(); toast('E-mail envoyé'); rendre();
        }, 'Envoi…') }, icone('mail'), 'Envoyer'),
        h('button', { onclick: () => fermer() }, 'Annuler'))));
    dest.focus();
  }

  function rendrePiece(piece) {
    const verrouille = Boolean(edl.sig_bailleur || edl.sig_locataire);
    const sauverPiece = debounce((champs) => api(`/edl-pieces/${piece.id}`, { method: 'PUT', body: champs }).catch((e) => toast(e.message, true)));
    // Envoi une par une, après conversion sur le téléphone (JPEG 1600 px) : rapide en 4G et
    // compatible avec les photos HEIC de l'iPhone, que le serveur ne sait pas lire.
    const envoyer = async (liste) => {
      const photos = [...liste];
      if (!photos.length) return;
      const erreurs = [];
      for (const [i, f] of photos.entries()) {
        toast(photos.length > 1 ? `Envoi des photos… ${i + 1}/${photos.length}` : 'Envoi de la photo…');
        try {
          const fd = new FormData();
          fd.append('photos', await preparerPhoto(f));
          const r = await api(`/edl-pieces/${piece.id}/photos`, { method: 'POST', body: fd });
          piece.photos = r.photos;
          erreurs.push(...r.erreurs);
        } catch (err) {
          if (err.deconnecte) return;
          // La raison est affichée pour pouvoir diagnostiquer un échec sur téléphone
          const raison = err instanceof TypeError ? 'connexion interrompue' : err.message;
          erreurs.push(`${f.name || `photo ${i + 1}`} (${raison})`);
        }
      }
      if (erreurs.length) toast(`Photo(s) non envoyée(s) : ${erreurs.join(', ')}`, true);
      else toast(photos.length > 1 ? `${photos.length} photos ajoutées` : 'Photo ajoutée');
      ouvertes.add(piece.id); rendre();
    };
    const fichiers = h('input', { type: 'file', accept: 'image/*', multiple: true, onchange: (e) => envoyer(e.target.files) });
    const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', onchange: (e) => envoyer(e.target.files) });

    const btnIa = h('button', { class: 'ia', disabled: !piece.photos.length, onclick: (e) => action(e.currentTarget, async () => {
      if (piece.analyse_at && !confirm('Relancer l\'analyse ? Les éléments détectés par l\'IA seront remplacés (vos ajouts et corrections manuels sont conservés).')) return;
      edl = await api(`/edl-pieces/${piece.id}/analyser`, { method: 'POST' });
      toast('Analyse terminée'); rendre();
    }, 'Analyse en cours…') }, piece.analyse_at ? '✦ Relancer l\'analyse IA' : '✦ Analyser avec l\'IA');

    const details = h('details', { class: 'piece', open: ouvertes.has(piece.id), ontoggle: (e) => (e.target.open ? ouvertes.add(piece.id) : ouvertes.delete(piece.id)) },
      h('summary', {},
        h('span', { class: 'nom-bloc' },
          h('span', { class: 'nom' }, piece.nom),
          h('span', { class: 'indice' }, piece.photos.length
            ? `${piece.photos.length} photo${piece.photos.length > 1 ? 's' : ''} · ${piece.elements.length} élément${piece.elements.length > 1 ? 's' : ''}`
            : 'Touchez pour ajouter des photos')),
        h('span', { class: 'actions' },
          !piece.photos.length && !verrouille && h('span', { class: 'badge invite' }, icone('photo'), 'Photos'),
          piece.etat_general && h('span', { class: `badge ${piece.analyse_at ? 'ia' : 'ok'}` }, piece.etat_general),
          h('span', { class: 'chevron' }, icone('chevron')))),
      h('div', { class: 'corps' },
        verrouille
          ? h('p', { class: 'sous note-verrou' }, 'Document signé : touchez « Annuler les signatures » en haut de la page pour ajouter ou retirer des photos.')
          : h('div', { class: 'boutons-photo' },
            h('label', { class: 'btn primaire ajout-photo' }, camera, icone('photo'), 'Prendre une photo'),
            h('label', { class: 'btn ajout-photo' }, fichiers, icone('galerie'), 'Importer de la galerie')),
        piece.photos.length > 0 && h('div', { class: 'photos' },
          piece.photos.map((p) => h('div', { class: 'photo' },
            h('img', { src: `/photos/${p.fichier}`, loading: 'lazy', onclick: () => visionneuse(`/photos/${p.fichier}`) }),
            h('button', { title: 'Supprimer', onclick: async () => {
              if (!confirm('Supprimer cette photo ?')) return;
              await api(`/photos/${p.id}`, { method: 'DELETE' }); piece.photos = piece.photos.filter((x) => x.id !== p.id); rendre();
            } }, '✕')))),
        h('div', { class: 'actions' }, btnIa,
          h('button', { class: 'petit danger', onclick: async () => {
            if (!confirm(`Retirer « ${piece.nom} » de cet état des lieux ?`)) return;
            await api(`/edl-pieces/${piece.id}`, { method: 'DELETE' }); edl.pieces = edl.pieces.filter((p) => p.id !== piece.id); rendre();
          } }, 'Retirer la pièce')),
        piece.resume_ia && h('div', { class: 'resume' }, h('label', {}, 'Description (IA, modifiable)'),
          h('textarea', { value: piece.resume_ia, oninput: (e) => { piece.resume_ia = e.target.value; sauverPiece({ resume_ia: e.target.value }); } })),
        h('div', { class: 'grille', style: 'margin-top:12px' },
          champ('Nom de la pièce', h('input', { value: piece.nom, onchange: (e) => { piece.nom = e.target.value; sauverPiece({ nom: e.target.value }); rendre(); } })),
          champ('État général', h('select', { onchange: (e) => { piece.etat_general = e.target.value; sauverPiece({ etat_general: e.target.value }); } },
            h('option', { value: '' }, '—'), catalogue.etats.map((x) => h('option', { selected: piece.etat_general === x }, x))))),
        champ('Observations', h('textarea', { value: piece.observations ?? '', placeholder: 'Remarques particulières sur cette pièce…', oninput: (e) => { piece.observations = e.target.value; sauverPiece({ observations: e.target.value }); } })),
        tableauElements(piece)));
    return details;
  }

  // Inventaire : liste compacte groupée par catégorie ; toucher une ligne ouvre sa fiche
  function tableauElements(piece) {
    const groupes = Object.keys(CATEGORIES).map((cat) => [cat, piece.elements.filter((e) => (CATEGORIES[e.categorie] ? e.categorie : 'autre') === cat)])
      .filter(([, liste]) => liste.length);
    const ligne = (el) => h('button', { type: 'button', class: 'element', onclick: () => ficheElement(piece, el) },
      h('span', { class: 'element-haut' },
        h('span', { class: 'element-nom' }, el.nom),
        el.quantite > 1 && h('span', { class: 'element-qte' }, `× ${el.quantite}`)),
      h('span', { class: 'element-bas' }, pastilleEtat(el.etat),
        el.source === 'ia' && h('span', { class: 'badge ia', title: 'Détecté par l\'IA' }, 'IA')),
      el.commentaire && h('span', { class: 'element-com' }, el.commentaire));
    return h('div', { class: 'inventaire' },
      h('div', { class: 'entete' }, h('h2', {}, 'Inventaire'),
        h('span', { class: 'sous' }, `${piece.elements.length} élément${piece.elements.length > 1 ? 's' : ''}`)),
      groupes.map(([cat, liste]) => h('div', { class: 'groupe' },
        h('div', { class: 'groupe-titre' }, CATEGORIES_PLURIEL[cat]), liste.map(ligne))),
      h('button', { type: 'button', class: 'ajout-element', onclick: () => ficheElement(piece) }, '+ Ajouter un élément'));
  }

  // Fiche d'un élément (création ou modification), en feuille qui monte du bas sur téléphone
  function ficheElement(piece, el) {
    const v = { categorie: el?.categorie ?? 'mobilier', quantite: el?.quantite ?? 1, etat: el?.etat ?? '' };
    const nom = h('input', { value: el?.nom ?? '', placeholder: 'ex. Canapé 3 places tissu gris', enterKeyHint: 'done' });
    const commentaire = h('textarea', { value: el?.commentaire ?? '', rows: 2, placeholder: 'Matériau, couleur, défauts visibles…' });
    const choix = (options, cle, libelle) => {
      const conteneur = h('div', { class: 'choix' });
      const dessiner = () => conteneur.replaceChildren(...options.map((o) => h('button', {
        type: 'button', class: `puce${v[cle] === o ? ' choisie' : ''}`, onclick: () => { v[cle] = v[cle] === o && cle === 'etat' ? '' : o; dessiner(); },
      }, libelle(o))));
      dessiner();
      return conteneur;
    };
    const qte = h('span', { class: 'qte-valeur' }, String(v.quantite));
    const changerQte = (d) => { v.quantite = Math.max(1, v.quantite + d); qte.textContent = v.quantite; };
    const enregistrer = async (e) => {
      if (!nom.value.trim()) { nom.focus(); return toast('Indiquez le nom de l\'élément.', true); }
      const body = { categorie: v.categorie, nom: nom.value.trim(), quantite: v.quantite, etat: v.etat || null, commentaire: commentaire.value.trim() || null };
      await action(e.currentTarget, async () => {
        if (el) Object.assign(el, await api(`/elements/${el.id}`, { method: 'PUT', body }));
        else piece.elements.push(await api(`/edl-pieces/${piece.id}/elements`, { method: 'POST', body }));
        fermer(); rendre();
      });
    };
    const fermer = modale(h('div', { class: 'fiche' },
      h('h2', {}, el ? 'Modifier l\'élément' : 'Ajouter un élément'),
      champ('Élément', nom),
      h('div', {}, h('label', {}, 'Catégorie'), choix(Object.keys(CATEGORIES), 'categorie', (c) => CATEGORIES[c])),
      h('div', { class: 'qte-ligne' }, h('label', {}, 'Quantité'),
        h('div', { class: 'stepper' },
          h('button', { type: 'button', 'aria-label': 'Moins', onclick: () => changerQte(-1) }, '−'), qte,
          h('button', { type: 'button', 'aria-label': 'Plus', onclick: () => changerQte(1) }, '+'))),
      h('div', {}, h('label', {}, 'État'), choix(catalogue.etats, 'etat', (x) => pastilleEtat(x))),
      champ('Commentaire', commentaire),
      h('div', { class: 'fiche-actions' },
        h('button', { class: 'primaire', onclick: enregistrer }, 'Enregistrer'),
        el && h('button', { class: 'danger', onclick: async () => {
          if (!confirm(`Supprimer « ${el.nom} » ?`)) return;
          try {
            await api(`/elements/${el.id}`, { method: 'DELETE' });
            piece.elements = piece.elements.filter((x) => x.id !== el.id); fermer(); rendre();
          } catch (err) { toast(err.message, true); }
        } }, 'Supprimer'),
        h('button', { onclick: () => fermer() }, 'Annuler'))), { feuille: true });
    if (!el) nom.focus();
  }

  rendre();
}

// --- Connexion ---------------------------------------------------------------
function vueConnexion() {
  document.body.dataset.vue = 'connexion';
  const mdp = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  $app.replaceChildren(h('form', { class: 'carte connexion', onsubmit: async (e) => {
    e.preventDefault();
    try {
      await api('/login', { method: 'POST', body: { password: mdp.value } });
      await demarrer();
    } catch (err) { toast(err.message, true); mdp.select(); }
  } }, h('h1', {}, 'Bremakeys'), h('p', { class: 'sous', style: 'text-align:center;margin:-8px 0 8px' }, 'Espace privé'), champ('Mot de passe', mdp), h('button', { class: 'primaire', type: 'submit' }, 'Se connecter')));
  mdp.focus();
}

// --- Routage -----------------------------------------------------------------
// --- Navigation : accueil à tuiles, puis ☰ + 🏠 dans les sous-pages ----------
const LIENS = [
  ['#/', 'maison', 'Accueil'], ['#/edl/nouveau', 'nouveau', 'Nouvel état des lieux'], ['#/edl', 'edl', 'États des lieux'],
  ['#/biens', 'biens', 'Biens'], ['#/proprietaires', 'proprietaires', 'Propriétaires'], ['#/locataires', 'locataires', 'Locataires'],
];
let authActive = false;
const $tiroir = document.getElementById('tiroir');

function ouvrirTiroir() {
  // Lien actif : le plus spécifique qui correspond à la page courante.
  const actuel = location.hash || '#/';
  const actif = LIENS.map(([l]) => l)
    .filter((l) => (l === '#/' ? actuel === '#/' : actuel === l || /^[/?]/.test(actuel.slice(l.length)) && actuel.startsWith(l)))
    .sort((a, b) => b.length - a.length)[0];
  $tiroir.querySelector('nav').replaceChildren(
    ...LIENS.map(([href, ic, texte]) => h('a', { href, class: href === actif ? 'actif' : '', onclick: fermerTiroir }, icone(ic), texte)),
    ...(authActive ? [h('a', { href: '#', class: 'deconnexion', onclick: async (e) => {
      e.preventDefault(); fermerTiroir(); await api('/logout', { method: 'POST' }); vueConnexion();
    } }, icone('sortie'), 'Déconnexion')] : []));
  $tiroir.hidden = false;
  requestAnimationFrame(() => $tiroir.classList.add('ouvert'));
}
function fermerTiroir() {
  $tiroir.classList.remove('ouvert');
  setTimeout(() => { if (!$tiroir.classList.contains('ouvert')) $tiroir.hidden = true; }, 300);
}
// La barre du haut se retire quand on descend et revient dès qu'on remonte.
const $topbar = document.querySelector('.topbar');
let dernierScroll = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (Math.abs(y - dernierScroll) < 6) return; // ignore les micro-mouvements
  $topbar.classList.toggle('cachee', y > dernierScroll && y > 80);
  $topbar.classList.toggle('flottante', y > 10);
  dernierScroll = y;
}, { passive: true });

document.querySelector('.menu-btn').addEventListener('click', ouvrirTiroir);
$tiroir.querySelector('.tiroir-voile').addEventListener('click', fermerTiroir);
document.addEventListener('keydown', (e) => e.key === 'Escape' && fermerTiroir());

async function router() {
  const [chemin, qs] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(qs);
  const seg = chemin.split('/').filter(Boolean);
  document.body.dataset.vue = seg.length ? 'page' : 'accueil';
  try {
    if (!seg.length) await vueAccueil();
    else if (seg[0] === 'proprietaires' || seg[0] === 'locataires') await vuePersonnes(seg[0]);
    else if (seg[0] === 'biens' && seg[1]) await vueBien(seg[1]);
    else if (seg[0] === 'biens') await vueBiens();
    else if (seg[0] === 'edl' && seg[1] === 'nouveau') await vueNouvelEdl(params);
    else if (seg[0] === 'edl' && seg[1]) await vueEdl(seg[1]);
    else if (seg[0] === 'edl') await vueListeEdl();
    else location.hash = '#/';
  } catch (e) {
    if (!e.deconnecte) $app.replaceChildren(h('div', { class: 'vide' }, `Erreur : ${e.message}`));
  }
  window.scrollTo(0, 0);
}

async function demarrer() {
  const session = await api('/session');
  authActive = session.authActive;
  if (!session.connecte) return vueConnexion();
  catalogue = await api('/catalogue');
  router();
}

// Animation d'ouverture, jouée une fois par session (un clic la passe).
function intro() {
  const el = document.getElementById('intro');
  let dejaVue = false;
  try { dejaVue = !!sessionStorage.getItem('introVue'); sessionStorage.setItem('introVue', '1'); } catch {}
  if (dejaVue) return el.remove();
  const ouvrir = () => {
    if (el.classList.contains('ouvre')) return;
    el.classList.add('ouvre');
    setTimeout(() => el.remove(), 1000);
  };
  const t = setTimeout(ouvrir, matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 3100);
  el.addEventListener('click', () => { clearTimeout(t); ouvrir(); });
}

intro();
window.addEventListener('hashchange', router);
demarrer();
