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

## Sauvegardes

Utiliser le bouton **Sauvegarder les données** depuis l'interface et conserver le fichier JSON dans un emplacement sûr. La restauration ajoute les données du fichier aux données existantes ; elle ne remplace pas la base.

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
- Les rappels sont internes à l'application : aucune notification du téléphone n'est envoyée.

## Version HTML installable Android (PWA)

Le dossier `frontend` inclut maintenant un manifeste PWA, une icône et un service worker pour permettre l'installation depuis Chrome Android après déploiement sur un domaine HTTPS (ou `localhost`). Le premier lancement demande la création d'un PIN local à 4 chiffres. Le PIN est un verrou d'accès local simple : il ne chiffre pas la base de données et ne remplace pas une authentification serveur.

### Installation sur Android

1. Déployer l'application sur un serveur HTTPS avec Docker Compose (voir les étapes ci-dessus).
2. Ouvrir l'adresse HTTPS dans Google Chrome sur le téléphone.
3. Ouvrir le menu ⋮ puis choisir **Installer l'application** ou **Ajouter à l'écran d'accueil**.
4. Ouvrir l'icône Gestion Budget DT et créer le PIN à 4 chiffres.

### Sauvegarde et synchronisation : état actuel

- La sauvegarde JSON manuelle et la restauration sont disponibles via l'API.
- Une copie locale de consultation est conservée dans le navigateur ; le mode hors connexion reste en lecture seule.
- **La synchronisation automatique Google Drive + serveur sécurisé n'est pas encore activée.** Elle nécessite de déployer le backend sur un serveur HTTPS, de mettre en place une authentification utilisateur et de configurer OAuth Google Drive (identifiant client et autorisation du compte). Ne pas saisir de données financières réelles sur une instance exposée publiquement avant ces étapes.
- Le service worker met en cache l'interface pour faciliter sa réouverture, mais les opérations financières nécessitent la connexion au serveur.
