# 🧪 Guide de Test - Correction Bug Affichage des 0

## 📋 Objectif

Vérifier que les pronostics avec un score de **0** s'affichent correctement dans tous les écrans de l'application après la correction du bug.

## 🚀 Préparation

### 1. Ouvrir l'Application

Ouvrez les fichiers suivants dans votre navigateur :
- `index.html` (page administrateur)
- `consulta.html` (page de consultation publique)
- `participant.html` (page participant)

### 2. Vider le Cache (Recommandé)

Pour être sûr de charger les nouvelles versions des fichiers JavaScript :

**Chrome/Edge :**
- Appuyez sur `Ctrl + Shift + Delete` (Windows) ou `Cmd + Shift + Delete` (Mac)
- Sélectionnez "Images et fichiers en cache"
- Cliquez sur "Effacer les données"

**Ou simplement :**
- Appuyez sur `Ctrl + F5` (Windows) ou `Cmd + Shift + R` (Mac) pour forcer le rechargement

## ✅ Tests à Effectuer

### Test 1 : Saisie de Pronostic avec 0 (Page Participant)

1. **Ouvrir** `participant.html`
2. **Se connecter** avec un nom de participant
3. **Charger** la liste des matchs
4. **Saisir un pronostic** avec un score de `0-0`
5. **Saisir un autre pronostic** avec `0-1`
6. **Saisir un autre pronostic** avec `2-0`
7. **Vérifier** que les valeurs `0` apparaissent bien dans les champs de saisie
8. **Exporter** les pronostics et vérifier le fichier JSON

**✅ Résultat attendu :**
```json
{
  "predictions": [
    {
      "prediction": { "home": 0, "away": 0 }
    },
    {
      "prediction": { "home": 0, "away": 1 }
    },
    {
      "prediction": { "home": 2, "away": 0 }
    }
  ]
}
```

### Test 2 : Import et Affichage Admin (Page Administrateur)

1. **Ouvrir** `index.html`
2. **Importer** le fichier de pronostics créé au Test 1
3. **Aller** dans l'onglet "Vista Pública"
4. **Vérifier** que les pronostics avec `0` s'affichent correctement :
   - `0 - 0` doit apparaître comme "0 - 0"
   - `0 - 1` doit apparaître comme "0 - 1"
   - `2 - 0` doit apparaître comme "2 - 0"

**❌ Avant la correction :**
```
Alice : - - 0  (le premier 0 n'apparaissait pas)
Bob   : - - 1  (le premier 0 n'apparaissait pas)
```

**✅ Après la correction :**
```
Alice : 0 - 0  (les deux 0 s'affichent)
Bob   : 0 - 1  (le 0 s'affiche)
```

### Test 3 : Affichage Avant Freeze (Cadenas)

1. **Dans l'admin**, vérifier qu'une journée n'est PAS encore freezée
2. **Aller** dans "Vista Pública"
3. **Vérifier** que les pronostics avec `0` affichent le cadenas 🔒 :
   - Si le pronostic est `0 - 1`, on doit voir `🔒 - 🔒` (pas `- - 🔒`)

**✅ Résultat attendu :**
```
Avant le freeze :
Alice : 🔒 - 🔒  (les deux cadenas s'affichent)
Bob   : 🔒 - 🔒  (les deux cadenas s'affichent)
```

### Test 4 : Affichage Après Freeze

1. **Attendre** que la journée soit freezée (ou modifier manuellement l'heure de freeze pour tester)
2. **Recharger** la page de consultation
3. **Vérifier** que les pronostics avec `0` s'affichent en clair :
   - `0 - 0` doit apparaître comme "0 - 0"
   - `0 - 1` doit apparaître comme "0 - 1"

**✅ Résultat attendu :**
```
Après le freeze :
Alice : 0 - 0  (les valeurs s'affichent)
Bob   : 0 - 1  (les valeurs s'affichent)
```

### Test 5 : Calcul des Points avec 0

1. **Dans l'admin**, saisir un résultat réel de `0 - 0`
2. **Vérifier** que les points sont calculés correctement :
   - Pronostic `0 - 0` → Résultat `0 - 0` = **3 points** (score exact)
   - Pronostic `0 - 1` → Résultat `0 - 0` = **0 point** (mauvais résultat)
   - Pronostic `1 - 1` → Résultat `0 - 0` = **1 point** (bon résultat : nul)

**✅ Résultat attendu :**
```
Match : France 0 - 0 Brésil

Alice (0-0) : 3 points ✅
Bob (0-1)   : 0 point  ❌
Charlie (1-1) : 1 point ✅ (bon résultat)
```

### Test 6 : Page de Consultation Publique

1. **Ouvrir** `consulta.html`
2. **Vérifier** que les pronostics avec `0` s'affichent correctement
3. **Vérifier** le classement général

**✅ Résultat attendu :**
- Les scores avec `0` sont visibles
- Le classement est correct
- Les statistiques (scores exacts, etc.) sont correctes

### Test 7 : Envoi Firebase (Si Configuré)

1. **Dans participant.html**, saisir des pronostics avec `0`
2. **Envoyer** à Firebase
3. **Vérifier** dans l'admin que les pronostics sont bien reçus avec les valeurs `0`

**✅ Résultat attendu :**
- Les pronostics avec `0` sont correctement envoyés
- L'admin reçoit les valeurs `0` intactes
- Le badge "✓ Enviado" s'affiche correctement

## 🐛 Problèmes Potentiels

### Si les 0 ne s'affichent toujours pas :

1. **Vider le cache du navigateur** (Ctrl + F5)
2. **Vérifier** que les fichiers JavaScript ont bien été modifiés
3. **Ouvrir la console** (F12) et chercher des erreurs JavaScript
4. **Vérifier** que vous utilisez bien les bons fichiers (pas des anciennes versions)

### Si les cadenas ne s'affichent pas correctement :

1. **Vérifier** l'heure de freeze de la journée
2. **Recharger** la page
3. **Vérifier** dans la console que Firebase est bien connecté

## 📊 Checklist de Validation

Cochez chaque test réussi :

- [ ] Test 1 : Saisie de pronostics avec 0
- [ ] Test 2 : Import et affichage admin
- [ ] Test 3 : Affichage avant freeze (cadenas)
- [ ] Test 4 : Affichage après freeze
- [ ] Test 5 : Calcul des points avec 0
- [ ] Test 6 : Page de consultation publique
- [ ] Test 7 : Envoi Firebase (si applicable)

## ✅ Validation Finale

Si tous les tests sont réussis, le bug est corrigé ! 🎉

Les pronostics avec un score de `0` doivent maintenant :
- ✅ S'afficher correctement dans tous les écrans
- ✅ Être sauvegardés correctement
- ✅ Être exportés/importés correctement
- ✅ Être pris en compte dans le calcul des points
- ✅ Afficher le cadenas 🔒 avant le freeze
- ✅ S'afficher en clair après le freeze

## 📝 Rapport de Bug (Si Problème)

Si vous rencontrez encore des problèmes, notez :
1. **Quel test échoue ?**
2. **Quel navigateur utilisez-vous ?**
3. **Quel est le comportement observé ?**
4. **Y a-t-il des erreurs dans la console (F12) ?**
5. **Capture d'écran du problème**

---

**Date de création** : 2026-06-16  
**Version** : 1.0  
**Fichiers concernés** : `consulta.js`, `app.js`, `consulta-v2.js`