# État des lieux IA

Application web pour réaliser des états des lieux (entrée / sortie) avec l'aide de Claude :
on photographie chaque pièce, l'IA dresse l'inventaire (meubles, équipements, revêtements…) et
évalue l'état, puis on complète ou corrige à la main et on génère le PDF.

## Fonctionnement

1. **Propriétaires** et **locataires** : fiches enregistrées en base, réutilisables.
2. **Biens** : adresse, surface, meublé ou non, et liste des pièces/espaces. On clique sur les
   pièces proposées (Chambre, Salle de bain, Salon, Cave, Grenier, Place de parking, Jardin,
   Piscine…) pour les ajouter, ou on saisit un espace libre (« Local vélo »…). Ajouter deux fois
   « Chambre » donne « Chambre 1 », « Chambre 2 ». Les pièces se renomment et se réordonnent.
3. **Nouvel état des lieux** : choix du propriétaire, du locataire et du bien. Les pièces du bien
   sont copiées dans l'état des lieux (on peut en ajouter/retirer sans modifier le bien).
4. **Par pièce** : prendre des photos (appareil photo du téléphone) ou les importer, puis
   **✨ Analyser avec l'IA**. Claude renvoie un état général, une description et l'inventaire
   détaillé (catégorie, élément, quantité, état, commentaire sur les défauts visibles).
5. On **corrige ou ajoute** des éléments à la main. Les éléments manuels (et ceux de l'IA que
   vous avez modifiés) sont conservés si l'on relance l'analyse.
6. Compteurs, clés, observations, puis **📄 Générer le PDF** (parties, logement, une page par
   pièce avec tableau d'inventaire et photos, cadres de signature).

## Installation

Prérequis : Node.js 22.13 ou plus récent et une clé API Anthropic
(<https://console.anthropic.com>).

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

Puis ouvrir <http://localhost:3000>. Pour l'utiliser depuis un téléphone sur le même réseau
Wi-Fi : `http://<ip-de-l-ordinateur>:3000`.

## Mise en ligne (Render)

Le fichier `render.yaml` décrit tout le déploiement :

1. Créez un compte sur <https://render.com> et connectez votre compte GitHub.
2. **New +** → **Blueprint** → choisissez le dépôt `appetatdeslieux` (et la branche contenant ce code).
3. Render demande deux valeurs :
   - `APP_PASSWORD` : le mot de passe pour accéder à l'application (choisissez-en un long) ;
   - `ANTHROPIC_API_KEY` : votre clé API Anthropic.
4. Validez. Après quelques minutes l'application est disponible sur `https://etat-des-lieux-xxxx.onrender.com`.

La base et les photos sont stockées sur un disque persistant (`/var/data`), qui nécessite l'offre
payante « Starter » de Render (environ 7 $/mois + 0,25 $/Go de disque). Sans ce disque, toutes les
données seraient effacées à chaque redémarrage. Chaque nouveau commit sur la branche redéploie l'application.

Variables d'environnement optionnelles :

| Variable | Défaut | Rôle |
|---|---|---|
| `APP_PASSWORD` | — | Mot de passe d'accès (sans lui, aucune protection) |
| `PORT` | `3000` | Port HTTP |
| `DATA_DIR` | `./data` | Base SQLite et photos |
| `CLAUDE_MODEL` | `claude-haiku-5-5` | Modèle d'analyse : le moins cher par défaut ; `claude-sonnet-5-5` ou `claude-opus-5-5` plus précis mais ~20 à 40× plus chers |
| `CLAUDE_EFFORT` | `low` | Profondeur de réflexion : `low` est moins cher, `high` plus précis |
| `IA_IMAGE_MAX` | `1024` | Taille max (px) des photos envoyées à l'IA ; le PDF garde les photos complètes |

## Technique

- Serveur Express (`server.js`), base SQLite intégrée à Node (`node:sqlite`, fichier `data/etatsdeslieux.db`).
- Photos redimensionnées (1600 px max) et converties en JPEG avec `sharp`, stockées dans `data/photos/`.
- Analyse IA (`src/ia.js`) : un appel à l'API Claude par pièce avec toutes ses photos,
  réponse en JSON structuré (schéma imposé).
- PDF (`src/pdf.js`) généré avec `pdfkit`.
- Interface (`public/`) : HTML/CSS/JS sans framework, adaptée au mobile.

> ⚠️ Définissez toujours `APP_PASSWORD` dès que l'application est accessible depuis Internet.
