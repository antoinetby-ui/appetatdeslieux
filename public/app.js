// Application monopage : routage par hash, rendu DOM sans framework.
const $app = document.getElementById('app');
let catalogue = { typesPieces: [], etats: [], categories: [] };

const CATEGORIES = {
  revetement: 'Revêtement', mobilier: 'Mobilier', equipement: 'Équipement', electricite: 'Électricité',
  plomberie: 'Plomberie', menuiserie: 'Menuiserie', autre: 'Autre',
};

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
const debounce = (fn, ms = 500) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function champ(label, input) { return h('div', {}, h('label', {}, label), input); }

function modale(contenu) {
  const voile = h('div', { class: 'voile', onclick: (e) => e.target === voile && voile.remove() }, h('div', { class: 'modale' }, contenu));
  document.body.append(voile);
  return () => voile.remove();
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
    h('button', { class: 'primaire', type: 'submit' }, 'Enregistrer le bien')));
  autre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterAutre(); } });
}

// --- États des lieux ---------------------------------------------------------
async function vueAccueil() {
  const edls = await api('/edl');
  $app.replaceChildren(
    h('div', { class: 'entete' }, h('h1', {}, 'États des lieux'), h('a', { class: 'btn primaire', href: '#/edl/nouveau' }, '+ Nouvel état des lieux')),
    edls.length ? h('div', { class: 'liste' }, edls.map((e) => h('div', { class: 'ligne' },
      h('div', {}, h('div', { class: 'titre' }, `${e.type === 'sortie' ? 'Sortie' : 'Entrée'} — ${e.bien}`),
        h('div', { class: 'sous' }, `${dateFr(e.date)} · Propriétaire : ${e.proprietaire} · Locataire : ${e.locataire}`)),
      h('div', { class: 'actions' },
        h('span', { class: `badge ${e.statut === 'termine' ? 'ok' : ''}` }, e.statut === 'termine' ? 'Terminé' : 'Brouillon'),
        h('a', { class: 'btn petit', href: `#/edl/${e.id}` }, 'Ouvrir'),
        h('a', { class: 'btn petit', href: `/api/edl/${e.id}/pdf`, target: '_blank' }, 'PDF')))))
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

  const sauverEdl = debounce(async (champs) => { try { await api(`/edl/${id}`, { method: 'PUT', body: champs }); } catch (e) { toast(e.message, true); } });

  function rendre() {
    const typeAjout = h('select', {}, catalogue.typesPieces.map((t) => h('option', { value: t }, t)), h('option', { value: '__autre' }, 'Autre…'));
    const analysees = edl.pieces.filter((p) => p.analyse_at).length;
    $app.replaceChildren(
      h('div', { class: 'entete' },
        h('div', {}, h('h1', {}, `État des lieux ${edl.type === 'sortie' ? 'de sortie' : "d'entrée"} — ${edl.bien.nom}`),
          h('div', { class: 'sous' }, `${dateFr(edl.date)} · ${nomPersonne(edl.proprietaire)} (propriétaire) · ${nomPersonne(edl.locataire)} (locataire)`)),
        h('div', { class: 'actions' },
          h('a', { class: 'btn primaire', href: `/api/edl/${id}/pdf`, target: '_blank' }, '📄 Générer le PDF'),
          h('a', { class: 'btn', href: '#/' }, '← Retour'))),

      h('div', { class: 'carte' },
        h('div', { class: 'grille' },
          champ('Type', h('select', { onchange: (e) => { edl.type = e.target.value; sauverEdl({ type: e.target.value }); } },
            h('option', { value: 'entree', selected: edl.type === 'entree' }, 'Entrée'), h('option', { value: 'sortie', selected: edl.type === 'sortie' }, 'Sortie'))),
          champ('Date', h('input', { type: 'date', value: edl.date, onchange: (e) => sauverEdl({ date: e.target.value }) })),
          champ('Statut', h('select', { onchange: (e) => sauverEdl({ statut: e.target.value }) },
            h('option', { value: 'brouillon', selected: edl.statut === 'brouillon' }, 'Brouillon'), h('option', { value: 'termine', selected: edl.statut === 'termine' }, 'Terminé')))),
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
        h('textarea', { value: edl.observations ?? '', oninput: (e) => sauverEdl({ observations: e.target.value }) })),
    );
  }

  function rendrePiece(piece) {
    const sauverPiece = debounce((champs) => api(`/edl-pieces/${piece.id}`, { method: 'PUT', body: champs }).catch((e) => toast(e.message, true)));
    const envoyer = async (liste) => {
      const fd = new FormData();
      for (const f of liste) fd.append('photos', f);
      if (!fd.has('photos')) return;
      toast('Envoi des photos…');
      try {
        const r = await api(`/edl-pieces/${piece.id}/photos`, { method: 'POST', body: fd });
        piece.photos = r.photos;
        if (r.erreurs.length) toast(`Format non reconnu : ${r.erreurs.join(', ')}`, true); else toast('Photos ajoutées');
        ouvertes.add(piece.id); rendre();
      } catch (err) { toast(err.message, true); }
    };
    const fichiers = h('input', { type: 'file', accept: 'image/*', multiple: true, onchange: (e) => envoyer(e.target.files) });
    const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', onchange: (e) => envoyer(e.target.files) });

    const btnIa = h('button', { class: 'ia', disabled: !piece.photos.length, onclick: (e) => action(e.currentTarget, async () => {
      if (piece.analyse_at && !confirm('Relancer l\'analyse ? Les éléments détectés par l\'IA seront remplacés (vos ajouts et corrections manuels sont conservés).')) return;
      edl = await api(`/edl-pieces/${piece.id}/analyser`, { method: 'POST' });
      toast('Analyse terminée'); rendre();
    }, 'Analyse en cours…') }, piece.analyse_at ? '✨ Relancer l\'analyse IA' : '✨ Analyser avec l\'IA');

    const details = h('details', { class: 'piece', open: ouvertes.has(piece.id), ontoggle: (e) => (e.target.open ? ouvertes.add(piece.id) : ouvertes.delete(piece.id)) },
      h('summary', {},
        h('span', { class: 'nom' }, piece.nom),
        h('span', { class: 'actions' },
          h('span', { class: 'badge' }, `📷 ${piece.photos.length}`),
          h('span', { class: 'badge' }, `${piece.elements.length} élément(s)`),
          piece.etat_general && h('span', { class: `badge ${piece.analyse_at ? 'ia' : 'ok'}` }, piece.etat_general))),
      h('div', { class: 'corps' },
        h('div', { class: 'photos' },
          piece.photos.map((p) => h('div', { class: 'photo' },
            h('img', { src: `/photos/${p.fichier}`, loading: 'lazy', onclick: () => visionneuse(`/photos/${p.fichier}`) }),
            h('button', { title: 'Supprimer', onclick: async () => {
              if (!confirm('Supprimer cette photo ?')) return;
              await api(`/photos/${p.id}`, { method: 'DELETE' }); piece.photos = piece.photos.filter((x) => x.id !== p.id); rendre();
            } }, '✕'))),
          h('label', { class: 'ajout-photo' }, camera, '📸', 'Prendre une photo'),
          h('label', { class: 'ajout-photo' }, fichiers, '🖼️', 'Importer des photos')),
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

  function tableauElements(piece) {
    const ligne = (el) => {
      const maj = debounce(async (champs) => {
        try { Object.assign(el, await api(`/elements/${el.id}`, { method: 'PUT', body: champs })); } catch (e) { toast(e.message, true); }
      });
      return h('tr', {},
        h('td', {}, h('select', { onchange: (e) => maj({ categorie: e.target.value }) },
          catalogue.categories.map((c) => h('option', { value: c, selected: el.categorie === c }, CATEGORIES[c] ?? c)))),
        h('td', { class: 'large' }, h('input', { value: el.nom, oninput: (e) => maj({ nom: e.target.value }) })),
        h('td', {}, h('input', { class: 'qte', type: 'number', min: 1, value: el.quantite, oninput: (e) => maj({ quantite: Math.max(1, +e.target.value || 1) }) })),
        h('td', {}, h('select', { onchange: (e) => maj({ etat: e.target.value }) },
          h('option', { value: '' }, '—'), catalogue.etats.map((x) => h('option', { selected: el.etat === x }, x)))),
        h('td', { class: 'large' }, h('input', { value: el.commentaire ?? '', placeholder: 'Commentaire', oninput: (e) => maj({ commentaire: e.target.value }) })),
        h('td', {}, el.source === 'ia' ? h('span', { class: 'badge ia', title: 'Détecté par l\'IA' }, 'IA') : '',
          h('button', { class: 'petit danger', title: 'Supprimer', onclick: async () => {
            await api(`/elements/${el.id}`, { method: 'DELETE' }); piece.elements = piece.elements.filter((x) => x.id !== el.id); rendre();
          } }, '✕')));
    };

    const n = { categorie: h('select', {}, catalogue.categories.map((c) => h('option', { value: c, selected: c === 'mobilier' }, CATEGORIES[c] ?? c))),
      nom: h('input', { placeholder: 'ex. Canapé 3 places' }), quantite: h('input', { class: 'qte', type: 'number', min: 1, value: 1 }),
      etat: h('select', {}, h('option', { value: '' }, '—'), catalogue.etats.map((x) => h('option', {}, x))),
      commentaire: h('input', { placeholder: 'Commentaire' }) };
    const ajouter = async () => {
      if (!n.nom.value.trim()) { n.nom.focus(); return; }
      try {
        const el = await api(`/edl-pieces/${piece.id}/elements`, { method: 'POST', body: {
          categorie: n.categorie.value, nom: n.nom.value.trim(), quantite: Math.max(1, +n.quantite.value || 1), etat: n.etat.value || null, commentaire: n.commentaire.value.trim() || null } });
        piece.elements.push(el); rendre();
        document.querySelector(`[data-ajout="${piece.id}"]`)?.focus();
      } catch (e) { toast(e.message, true); }
    };
    n.nom.dataset.ajout = piece.id;
    for (const i of [n.nom, n.commentaire, n.quantite]) i.addEventListener('keydown', (e) => e.key === 'Enter' && ajouter());

    return h('div', { class: 'defile' }, h('h2', { style: 'margin-top:16px' }, 'Inventaire'),
      h('table', { class: 'tableau' },
        h('thead', {}, h('tr', {}, ['Catégorie', 'Élément', 'Qté', 'État', 'Commentaire', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, piece.elements.map(ligne),
          h('tr', {}, h('td', {}, n.categorie), h('td', { class: 'large' }, n.nom), h('td', {}, n.quantite), h('td', {}, n.etat),
            h('td', { class: 'large' }, n.commentaire), h('td', {}, h('button', { class: 'petit primaire', onclick: ajouter }, '+'))))));
  }

  rendre();
}

// --- Routage -----------------------------------------------------------------
async function router() {
  const [chemin, qs] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(qs);
  const seg = chemin.split('/').filter(Boolean);
  document.querySelectorAll('.topbar nav a').forEach((a) => {
    const cible = a.getAttribute('href').slice(2);
    a.classList.toggle('actif', cible ? seg[0] === cible : !seg[0] || seg[0] === 'edl');
  });
  try {
    if (!seg.length) await vueAccueil();
    else if (seg[0] === 'proprietaires' || seg[0] === 'locataires') await vuePersonnes(seg[0]);
    else if (seg[0] === 'biens' && seg[1]) await vueBien(seg[1]);
    else if (seg[0] === 'biens') await vueBiens();
    else if (seg[0] === 'edl' && seg[1] === 'nouveau') await vueNouvelEdl(params);
    else if (seg[0] === 'edl') await vueEdl(seg[1]);
    else location.hash = '#/';
  } catch (e) {
    $app.replaceChildren(h('div', { class: 'vide' }, `Erreur : ${e.message}`));
  }
  window.scrollTo(0, 0);
}

catalogue = await api('/catalogue');
window.addEventListener('hashchange', router);
router();
