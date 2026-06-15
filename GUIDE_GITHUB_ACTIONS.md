# Guide de Configuration de la Mise à Jour Automatique des Résultats

## 📋 Ce que fait le script automatique

Le workflow GitHub Actions (`update-results.yml`) effectue automatiquement les tâches suivantes **4 fois par jour** :

### Horaires d'exécution (heure de Paris) :
- **21h00** : Après les matchs du soir
- **00h00** : Minuit, pour les matchs tardifs
- **04h00** : Tôt le matin, pour les matchs de nuit
- **08h00** : Le matin, pour finaliser les résultats

### Actions effectuées :
1. **Connexion à Firebase** : Le script se connecte à votre base de données Firebase
2. **Récupération des matchs** : Il récupère tous les matchs stockés
3. **Filtrage intelligent** :
   - Ignore les matchs manuels
   - Ignore les matchs qui ont déjà des résultats
   - Ignore les matchs qui ne sont pas encore terminés (moins de 2h30 après le coup d'envoi)
4. **Appel à l'API Football** : Pour chaque match éligible, interroge l'API pour obtenir le score final
5. **Mise à jour Firebase** : Enregistre les nouveaux résultats dans la base de données
6. **Rapport** : Affiche un résumé des mises à jour effectuées

### Avantages :
- ✅ **Automatique** : Aucune intervention manuelle nécessaire
- ✅ **Économique** : Seulement 4 exécutions par jour (respecte les limites de l'API gratuite)
- ✅ **Intelligent** : Ne met à jour que les matchs terminés sans résultats
- ✅ **Gratuit** : Utilise GitHub Actions (2000 minutes gratuites par mois)
- ✅ **Fiable** : S'exécute même si votre ordinateur est éteint

---

## 🔧 Configuration Requise

Pour activer ce système automatique, vous devez configurer des **secrets** dans votre repository GitHub. Ces secrets contiennent les informations d'authentification Firebase.

### Étape 1 : Créer un compte de service Firebase

1. Allez sur la [Console Firebase](https://console.firebase.google.com/)
2. Sélectionnez votre projet "pronostico-copa-del-mundo-2026"
3. Cliquez sur l'icône ⚙️ (Paramètres) → **Paramètres du projet**
4. Allez dans l'onglet **Comptes de service**
5. Cliquez sur **Générer une nouvelle clé privée**
6. Un fichier JSON sera téléchargé (gardez-le en sécurité !)

### Étape 2 : Ajouter les secrets dans GitHub

1. Allez sur votre repository GitHub : https://github.com/lusalvarez/pronosticos-copa-del-mundo-2026
2. Cliquez sur **Settings** (Paramètres)
3. Dans le menu de gauche, cliquez sur **Secrets and variables** → **Actions**
4. Cliquez sur **New repository secret**
5. Ajoutez les secrets suivants (en utilisant les valeurs du fichier JSON téléchargé) :

#### Secret 1 : FIREBASE_PRIVATE_KEY_ID
- **Name** : `FIREBASE_PRIVATE_KEY_ID`
- **Value** : La valeur de `private_key_id` dans le fichier JSON

#### Secret 2 : FIREBASE_PRIVATE_KEY
- **Name** : `FIREBASE_PRIVATE_KEY`
- **Value** : La valeur de `private_key` dans le fichier JSON (incluant les `-----BEGIN PRIVATE KEY-----` et `-----END PRIVATE KEY-----`)

#### Secret 3 : FIREBASE_CLIENT_EMAIL
- **Name** : `FIREBASE_CLIENT_EMAIL`
- **Value** : La valeur de `client_email` dans le fichier JSON

#### Secret 4 : FIREBASE_CLIENT_ID
- **Name** : `FIREBASE_CLIENT_ID`
- **Value** : La valeur de `client_id` dans le fichier JSON

#### Secret 5 : FIREBASE_CERT_URL
- **Name** : `FIREBASE_CERT_URL`
- **Value** : La valeur de `client_x509_cert_url` dans le fichier JSON

---

## 🚀 Activation

Une fois les secrets configurés :

1. Commitez et pushez le fichier `.github/workflows/update-results.yml`
2. Le workflow s'activera automatiquement aux horaires programmés
3. Vous pouvez aussi l'exécuter manuellement :
   - Allez dans l'onglet **Actions** de votre repository
   - Sélectionnez "Update Match Results Automatically"
   - Cliquez sur **Run workflow**

---

## 📊 Surveillance

Pour voir les logs d'exécution :

1. Allez dans l'onglet **Actions** de votre repository
2. Cliquez sur une exécution du workflow
3. Consultez les logs pour voir :
   - Combien de matchs ont été mis à jour
   - Les erreurs éventuelles
   - Les statistiques d'exécution

---

## ⚠️ Limites de l'API

L'API Football gratuite a une limite de **100 requêtes par jour**. Avec 4 exécutions par jour et environ 72 matchs de phase de groupes, le script est optimisé pour :
- Ne traiter que les matchs sans résultats
- Ignorer les matchs pas encore terminés
- Espacer les requêtes d'1 seconde

Cela devrait rester largement dans les limites gratuites.

---

## 🔄 Désactivation

Pour désactiver temporairement le système automatique :

1. Allez dans `.github/workflows/update-results.yml`
2. Commentez les lignes `schedule:` en ajoutant `#` devant
3. Ou supprimez complètement le fichier

---

## 📝 Notes

- Le script utilise la même logique que l'outil manuel `actualizar-resultados.html`
- Les résultats sont mis à jour uniquement pour les matchs terminés (2h30 après le coup d'envoi)
- Les matchs manuels ne sont jamais touchés par le script automatique
- Vous pouvez toujours utiliser l'outil manuel en parallèle si nécessaire