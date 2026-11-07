# Notes de version — 2.0

## Changements livrés

- Refonte visuelle responsive de l'interface.
- Indicateurs mensuels et graphiques sur six mois.
- Répartition mensuelle des dépenses par catégorie.
- Recherche et filtre de l'historique.
- Modification des revenus et dépenses existants.
- Validation renforcée des champs côté API.
- Contrôle des paiements partiels et refus des paiements supérieurs au reste dû.
- Restauration JSON validée avant insertion et exécutée dans une transaction.
- Contrôle de connexion à PostgreSQL.
- Secrets Docker déplacés dans un fichier `.env` local non versionné.
- API non publiée directement sur le port de l'hôte dans Docker Compose.

## Vérifications effectuées

- Compilation syntaxique Python du backend : réussie.
- Tests API avec SQLite temporaire : santé, création, modification, calcul du solde, achat à crédit, paiement partiel, rejet du dépassement, sauvegarde et rejet d'une sauvegarde incohérente : réussis.
- La compilation Vite du frontend n'a pas pu être exécutée dans l'environnement de préparation, car l'installation des paquets npm n'a pas abouti dans le délai disponible. Le build devra être confirmé sur votre PC avec `docker compose up --build`.

## Avant usage réel

Cette version reste mono-utilisateur et ne doit pas être publiée sur Internet telle quelle. Authentification, rôles, HTTPS, sauvegardes automatiques externes et saisie hors connexion synchronisable constituent une phase suivante.
