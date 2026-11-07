# Gestion Budget DT — version améliorée 2.0

Application web de suivi budgétaire en dinars tunisiens (DT), basée sur React, FastAPI et PostgreSQL.

## Fonctionnalités

- Tableau de bord : solde, revenus, dépenses et dettes restantes.
- Synthèse du mois en cours et comparaison des revenus/dépenses sur six mois.
- Répartition des dépenses par catégorie.
- Ajout, modification, recherche, filtrage et suppression des mouvements.
- Achats à crédit avec plusieurs produits et paiements partiels.
- Validation renforcée des montants, catégories et dates côté API.
- Contrôle des paiements pour empêcher le dépassement du solde dû.
- Sauvegarde JSON et restauration transactionnelle avec vérification des données.
- Copie locale automatique pour consultation en lecture seule hors connexion.
- Interface responsive pour ordinateur, tablette et téléphone.
- Vérification de l'état de la base de données via `/api/health`.

## Démarrage sous Windows avec Docker Desktop / WSL2

1. Décompresser le dossier.
2. Copier `.env.example` vers `.env`.
3. Modifier `POSTGRES_PASSWORD` avec un mot de passe long et unique.
4. Ouvrir un terminal dans le dossier du projet.
5. Exécuter :

```bash
docker compose up --build -d
```

6. Ouvrir <http://localhost:8080>.

Pour consulter les journaux :

```bash
docker compose logs -f
```

Pour arrêter les conteneurs sans supprimer les données :

```bash
docker compose down
```

Les données PostgreSQL sont conservées dans le volume Docker `postgres_data`.

## Installation Android (PWA)

1. Déployer l'application sur un hébergement HTTPS (ou la lancer en local avec Docker pour les tests).
2. Ouvrir l'adresse du site dans Chrome sur Android.
3. Appuyer sur **Installer** dans l'application, ou ouvrir le menu Chrome `⋮` puis **Installer l'application** / **Ajouter à l'écran d'accueil**.
4. L'application peut ouvrir son interface mise en cache hors connexion. Les données métier hors connexion restent en lecture seule jusqu'à reconnexion.

Le service worker met en cache l'interface et les ressources publiques ; il ne met jamais en cache les réponses API financières.

## Sauvegardes

- Une copie locale de consultation est actualisée dans le stockage du navigateur après chaque chargement réussi.
- Le serveur crée automatiquement une sauvegarde JSON quotidienne dans `./backups` et conserve les 30 dernières sauvegardes. Ce dossier doit être inclus dans les sauvegardes de l'hébergeur.
- Le bouton **Sauvegarder les données** exporte manuellement un fichier JSON ; la restauration ajoute les données du fichier aux données existantes et ne remplace pas la base.
- La synchronisation Google Drive n'est pas encore connectée : elle nécessite de créer/configurer un client OAuth Google et d'autoriser le compte dans l'application. Ne pas saisir le mot de passe Google dans l'application.

## Points de sécurité et limites

- L'API n'est plus publiée directement sur un port hôte dans la configuration Docker ; le navigateur y accède via le proxy Nginx.
- Le mot de passe PostgreSQL est externalisé dans `.env`.
- Ne pas exposer le service directement sur Internet sans authentification, HTTPS, politique de sauvegarde testée et durcissement du serveur.
- Cette version reste mono-utilisateur : les comptes, rôles, permissions, journal d'audit nominatif et synchronisation des saisies hors connexion ne sont pas encore implémentés.
- Le cache hors connexion est en lecture seule. Les saisies hors ligne avec synchronisation différée nécessitent une étape de développement dédiée.

## Compatibilité des données

Les tables existantes ne changent pas de structure. La version 2.0 conserve le format de sauvegarde JSON version 1 et peut donc reprendre les données de la version précédente.


## Version 3 — échéances et rendez-vous médicaux
- Un achat à crédit peut contenir plusieurs échéances (date et montant).
- Chaque échéance non payée apparaît dans « Mes rappels » à partir de 5 jours avant sa date, tant que l'application est consultée.
- Une échéance peut être marquée comme payée.
- Nouvelle section « Rendez-vous médicaux » avec médecin, date, coût de consultation, note et statut terminé.
- Les rendez-vous non terminés apparaissent dans « Mes rappels » à partir de 5 jours avant.
- Nouvelle section « Récapitulatif mensuel » présentant les dépenses enregistrées, échéances planifiées et consultations par mois.
- Les rappels sont affichés dans l’application ; l’autorisation de notifications du navigateur peut être demandée, mais les notifications fiables en arrière-plan nécessitent une intégration push et un service HTTPS.
