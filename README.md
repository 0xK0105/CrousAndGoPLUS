# Crous & Go+

Extension Chrome **non officielle** qui remplace l'interface du site de click & collect [Crous & Go](https://crousngo.crous-aix-marseille.fr/luminy/) par une vue simple et lisible.

> Ce projet n'a aucun lien avec le Crous d'Aix-Marseille-Avignon. Il se contente d'afficher autrement les données du site, avec ta propre session.

## Fonctionnalités

- **Menus par jour** : un onglet par jour (Lundi 2, Mardi 3…), avec un ✓ sur les jours déjà commandés.
- **Midi / Soir** : bascule en un clic ; passe automatiquement sur Soir après 14h.
- **Cartes claires** : type de formule (végé, viande, pâtes, poisson, œuf), nom et description du plat, mention « réchauffable sur place ».
- **Choix en un clic** : entrée, dessert, zone, jour et heure de récupération. Les options uniques sont pré-remplies.
- **Créneaux à jour** : les créneaux dont l'heure limite de commande est dépassée ne sont pas proposés (mêmes règles que le site).
- **Panier toujours visible** à droite (tiroir sur petit écran) : formules groupées par jour, créneau de récupération, retrait d'un article, total et bouton « Valider la commande ».
- **Retour au site d'origine** à tout moment via « Site original » ; le bouton « Mode simple » le réactive. Le choix est mémorisé.
- Thème clair / sombre automatique.

## Installation

L'extension n'est pas (encore) sur le Chrome Web Store : on l'installe en « mode développeur ». Ça prend une minute.

1. **Télécharger** le fichier `crousngo-plus.zip` et le **dézipper**. Tu obtiens un dossier `crousngo-plus` contenant `manifest.json`, `content.js` et ce `README.md`.
   Range ce dossier à un endroit où il restera (ex. `Documents/extensions/`) : Chrome le charge depuis là, s'il est supprimé l'extension disparaît.
2. Ouvrir Chrome et aller sur **`chrome://extensions`** (à taper dans la barre d'adresse).
3. Activer le **Mode développeur** (interrupteur en haut à droite).
4. Cliquer sur **« Charger l'extension non empaquetée »** et sélectionner le dossier `crousngo-plus` (celui qui contient `manifest.json`).
5. L'extension « Crous & Go+ » apparaît dans la liste. Optionnel : l'épingler via l'icône puzzle de la barre d'outils.
6. Aller sur [crousngo.crous-aix-marseille.fr/luminy](https://crousngo.crous-aix-marseille.fr/luminy/), **se connecter** à son compte, puis ouvrir la boutique ou la catégorie Plats : la nouvelle interface s'affiche.

Fonctionne aussi sur les navigateurs basés sur Chromium (Edge, Brave, Opera, Vivaldi) avec la même procédure (`edge://extensions`, `brave://extensions`…).

### Mettre à jour

1. Remplacer le contenu du dossier `crousngo-plus` par la nouvelle version (mêmes noms de fichiers).
2. Sur `chrome://extensions`, cliquer sur la **flèche de rechargement** de la carte « Crous & Go+ ».
3. Recharger la page du site.

### Désinstaller

Sur `chrome://extensions`, cliquer sur **Supprimer** sur la carte de l'extension.

## Utilisation

1. Choisir le **jour** puis **Midi** ou **Soir**.
2. Sur la formule voulue, choisir l'**entrée**, le **dessert**, puis la **zone**, le **jour** et l'**heure** de récupération.
3. Cliquer sur **Ajouter** : la formule apparaît dans le panier à droite.
4. Quand tout est prêt, cliquer sur **Valider la commande** : tu bascules sur la page panier officielle pour finaliser et payer.

## Dépannage

| Problème | Solution |
|---|---|
| L'interface ne s'affiche pas | Vérifier que tu es sur une page boutique / catégorie (pas panier ni compte). Si le bouton rouge « Mode simple » est en bas à droite, cliquer dessus. |
| « Impossible de charger les menus » | Vérifier que tu es connecté au site, puis recharger la page. |
| « Plus de créneau de récupération disponible » | L'heure limite de commande pour ce jour est passée. |
| Un ajout échoue | Le message d'erreur du site est affiché. Réessayer via « Site original » pour vérifier ; si le site a changé, l'extension doit sans doute être mise à jour. |
| Erreur au chargement de l'extension | Vérifier que le dossier sélectionné contient directement `manifest.json` (et pas un sous-dossier). |

## Confidentialité

- L'extension ne s'exécute que sur `crousngo.crous-aix-marseille.fr`.
- Elle utilise uniquement l'API publique WooCommerce du site et ta session déjà ouverte.
- **Aucune donnée n'est collectée ni envoyée ailleurs.** Seule une préférence (interface activée ou non) est stockée localement dans le navigateur.

## Fonctionnement technique

- `manifest.json` : extension Manifest V3, un seul *content script*, aucune permission spéciale.
- `content.js` :
  - lit les produits et le panier via l'API Store de WooCommerce (`/wp-json/wc/store/v1/products`, `/cart`) ;
  - extrait jour, service (midi/soir) et type depuis le nom des formules, et les descriptions depuis le HTML des fiches ;
  - récupère sur chaque fiche produit les zones et horaires de retrait du plugin de récupération (`horaires`, `disposProduit`) et l'identifiant de variante ;
  - ajoute au panier en postant le formulaire classique de la fiche (nécessaire pour que zone / jour / heure soient enregistrés) ;
  - affiche l'interface dans un Shadow DOM pour ne pas interférer avec le CSS du site.

Si le Crous modifie son site ou son plugin de récupération, l'extension peut cesser de fonctionner : le bouton « Site original » permet toujours de commander normalement.
