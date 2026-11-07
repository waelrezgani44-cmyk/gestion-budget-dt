# Gestion Budget DT — cadrage technique version 3

**Statut :** spécification de réalisation — les fonctions décrites ici ne sont pas encore activées dans l'application.

## 1. Objectif

Faire évoluer la version web actuelle (React + FastAPI + PostgreSQL) vers une solution multi-utilisateurs avec application Android, fonctionnement hors connexion en lecture et en saisie, puis synchronisation différée.

Principes non négociables :
- préserver les données et le comportement de la version 2 ;
- isoler les données par espace de gestion ;
- appliquer les permissions côté API, jamais uniquement dans l'interface ;
- ne jamais écraser silencieusement une modification concurrente ;
- garder un historique attribuable à l'utilisateur ;
- ne pas exposer PostgreSQL directement à Internet.

## 2. Profils et permissions proposées

| Action | Administrateur | Responsable | Utilisateur |
|---|---:|---:|---:|
| Voir le tableau de bord de l'espace | Oui | Oui | Selon autorisation |
| Consulter les mouvements | Oui | Oui | Oui, périmètre autorisé |
| Créer un mouvement | Oui | Oui | Oui |
| Modifier ses propres mouvements | Oui | Oui | Oui |
| Modifier les mouvements d'autres utilisateurs | Oui | Selon délégation | Non |
| Supprimer un mouvement | Oui | Demande/validation | Non |
| Gérer les utilisateurs et rôles | Oui | Non | Non |
| Exporter/restaurer les données | Oui | Export autorisé | Non |
| Consulter le journal d'audit | Oui | Oui | Ses propres actions |

Les rôles sont attribués dans un espace de gestion (workspace). Un utilisateur peut appartenir à plusieurs espaces, avec un rôle différent dans chacun.

## 3. Modèle de données cible

Ajouter progressivement les tables suivantes via migrations Alembic :

- `users`: id UUID, email normalisé unique, nom affiché, hash du mot de passe, statut actif, dates de création et de modification.
- `workspaces`: id UUID, nom, devise (DT par défaut), dates de création.
- `workspace_members`: workspace_id, user_id, rôle (`admin`, `manager`, `user`), statut, contrainte unique workspace/user.
- `refresh_tokens`: identifiant, user_id, hash du jeton, expiration, révocation et date de création. Ne jamais stocker le jeton en clair.
- `audit_logs`: workspace_id, actor_user_id, action, type et identifiant de ressource, horodatage, métadonnées minimales.
- `sync_changes`: workspace_id, identifiant client unique, type de ressource, identifiant serveur, version, opération, horodatage serveur, auteur.

Pour les tables métier `movements`, `credit_purchases`, `credit_items` et `credit_payments`, ajouter `workspace_id`, `created_by`, `updated_by`, `created_at`, `updated_at` et `version`. Les clés étrangères doivent empêcher qu'un élément d'un espace référence une ressource d'un autre espace.

### Migration des données existantes

1. Effectuer une sauvegarde PostgreSQL vérifiée.
2. Créer un espace initial « Espace principal ».
3. Créer le premier administrateur par une commande d'initialisation locale, sans identifiant/mot de passe par défaut.
4. Affecter toutes les données existantes à cet espace.
5. Vérifier les totaux avant/après migration (revenus, dépenses, paiements, reste dû).
6. N'activer les contraintes NOT NULL qu'après vérification.
7. Garder un retour arrière documenté et tester la restauration sur une copie.

Ne pas exécuter cette migration automatiquement sur la base réelle sans sauvegarde et validation.

## 4. Authentification et sécurité API

- Mot de passe haché avec Argon2id (bibliothèque maintenue), jamais chiffré réversiblement.
- Accès court via JWT signé (clé secrète forte fournie par variable d'environnement).
- Jeton de renouvellement opaque, stocké uniquement sous forme hachée, rotation et révocation.
- Limitation des tentatives de connexion et messages d'erreur non révélateurs.
- Validation stricte du rôle et de l'appartenance à l'espace à chaque requête.
- HTTPS obligatoire hors réseau local de développement.
- CORS limité aux domaines réellement utilisés.
- Journaliser les opérations sensibles sans enregistrer mots de passe, jetons ou données personnelles superflues.
- Prévoir une procédure de désactivation de compte et de révocation des sessions.

## 5. API cible

Préfixe `/api/v1` :

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- `GET/POST /workspaces`, `GET/PATCH /workspaces/{id}`
- `GET/POST /workspaces/{id}/members`, `PATCH /workspaces/{id}/members/{user_id}`
- `GET/POST /workspaces/{id}/movements`, `PATCH/DELETE /workspaces/{id}/movements/{movement_id}`
- `GET/POST /workspaces/{id}/credits`, `POST /workspaces/{id}/credits/{credit_id}/payments`
- `GET /workspaces/{id}/audit-logs`
- `POST /sync/push`, `GET /sync/pull?workspace_id=...&cursor=...`

Toutes les routes métier doivent déduire l'utilisateur de la session et vérifier son appartenance à l'espace. Un `workspace_id` fourni par le client ne constitue jamais une preuve d'autorisation.

## 6. Synchronisation hors connexion Android

### Stockage local

Utiliser Kotlin + Jetpack Compose, Room (base locale), WorkManager (travail différé), DataStore (préférences non sensibles). Les jetons doivent être protégés par Android Keystore. Ne pas stocker les mots de passe.

Chaque action créée hors ligne reçoit un UUID `client_operation_id`, une date locale, le type de ressource, le contenu validé et l'état `pending`.

### Protocole

1. L'application lit les données synchronisées depuis Room même sans réseau.
2. Les nouvelles opérations sont enregistrées localement avec état `pending`.
3. WorkManager tente le push quand le réseau revient.
4. L'API déduplique avec `client_operation_id` : renvoyer le résultat existant si l'opération a déjà été reçue.
5. L'application récupère les changements serveur depuis un curseur opaque et persistant.
6. Les changements confirmés passent à `synced`; les erreurs métier restent visibles et peuvent être corrigées.

### Conflits

- Création : idempotence par UUID client.
- Modification : contrôle optimiste via `version` (ETag ou champ version).
- Si la version serveur a changé, répondre `409 Conflict` avec les versions concernées ; ne pas appliquer « le dernier gagne » automatiquement.
- Suppression : tombstone (suppression logique) synchronisée, avec journal d'audit.
- Les paiements de crédit sont traités comme opérations financières append-only ; une correction passe par une opération compensatrice ou un flux d'annulation autorisé, jamais par une fusion silencieuse.

L'interface doit distinguer clairement `En attente`, `Synchronisé`, `Conflit` et `Échec` et offrir une action de résolution compréhensible.

## 7. Application Android

Écrans initiaux : connexion, choix d'espace, tableau de bord, mouvements, formulaire de mouvement, achats à crédit, détail et paiements, état de synchronisation, profil et paramètres.

Langues : français et arabe. Prévoir la mise en page RTL pour l'arabe (direction, icônes directionnelles, formats de date et nombres). La devise reste configurable, DT par défaut.

Accessibilité : tailles de texte adaptables, contrastes suffisants, libellés accessibles, zones tactiles adaptées.

## 8. Ordre de réalisation et critères d'acceptation

### Phase A — sécurisation et migrations
- Alembic installé et migrations versionnées.
- Authentification testée, aucun endpoint métier anonyme.
- Tests d'isolation : un membre ne peut lire/modifier les données d'un autre espace.
- Totaux financiers identiques avant et après migration.

### Phase B — rôles et audit
- Tests de chaque permission du tableau ci-dessus.
- Journal des créations, modifications, suppressions, validations et connexions sensibles.

### Phase C — synchronisation
- Test mode avion : consultation et création locale.
- Test retour réseau : push/pull sans doublon.
- Test requête répétée : pas de doublon financier.
- Test conflit : aucune donnée écrasée silencieusement.
- Test redémarrage téléphone : file locale conservée.

### Phase D — Android et localisation
- APK de test signé pour distribution interne.
- Parcours français et arabe, RTL vérifié.
- Tests sur plusieurs tailles d'écran et versions Android prises en charge.

### Phase E — déploiement
- HTTPS, sauvegardes automatisées et exercice de restauration.
- Secrets hors du dépôt Git.
- Surveillance de santé, journaux et procédure de mise à jour/retour arrière.

## 9. Décisions restant à valider avant développement

- Un espace de gestion unique ou plusieurs espaces indépendants.
- Création des comptes par invitation administrateur (recommandé) ou inscription ouverte.
- Validation obligatoire par responsable pour certaines catégories de mouvements.
- Durée de conservation des journaux d'audit.
- Versions Android minimales et mode de distribution (APK privé ou Play Store).

## 10. État réel de cette livraison

Cette livraison ajoute le présent cadrage au projet existant. Elle ne prétend pas que l'authentification, les rôles, les migrations, le protocole de synchronisation ou l'application Android sont déjà codés. La version 2 reste l'application exécutable de référence jusqu'à la réalisation et aux tests de chaque phase.
