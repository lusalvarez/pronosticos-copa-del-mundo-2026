# 💾 Guide de Sauvegarde et Restauration Firebase

## 📋 Vue d'ensemble

Ce guide explique comment utiliser les outils de sauvegarde et restauration de la base de données Firebase pour l'application de pronostics de la Coupe du Monde.

## 🎯 Objectif

Les scripts permettent de :
- **Sauvegarder** toutes les données Firebase dans un fichier JSON
- **Restaurer** la base de données à partir d'une sauvegarde
- **Protéger** vos données en cas de problème

---

## 📥 Sauvegarde de la Base de Données

### Accès au Script

Ouvrez le fichier `backup-firebase.html` dans votre navigateur :
```
pronostics-coupe-du-monde/backup-firebase.html
```

### Étapes de Sauvegarde

1. **Ouvrir la page de sauvegarde**
   - Double-cliquez sur `backup-firebase.html`
   - Ou ouvrez-le via votre navigateur

2. **Créer la sauvegarde**
   - Cliquez sur le bouton "📥 Créer une Sauvegarde"
   - Attendez que le processus se termine (quelques secondes)

3. **Téléchargement automatique**
   - Un fichier JSON sera automatiquement téléchargé
   - Nom du fichier : `backup-firebase-[date].json`
   - Exemple : `backup-firebase-2026-06-02T20-15-30.json`

4. **Vérification**
   - La page affiche les statistiques :
     - Nombre de participants
     - Nombre de matchs
     - Nombre de pronostics
   - Un aperçu du contenu est affiché

### Contenu de la Sauvegarde

Le fichier JSON contient :
```json
{
  "metadata": {
    "backupDate": "2026-06-02T20:15:30.123Z",
    "backupDateFormatted": "02/06/2026 22:15:30",
    "version": "1.0",
    "application": "Pronósticos Copa del Mundo 2026"
  },
  "data": {
    "participants": { ... },
    "matches": { ... }
  }
}
```

### Bonnes Pratiques

✅ **Fréquence recommandée**
- Avant toute modification importante
- Une fois par semaine minimum
- Avant chaque déploiement

✅ **Stockage**
- Conservez plusieurs versions (au moins 3)
- Stockez dans un endroit sûr (cloud, disque externe)
- Nommez clairement vos sauvegardes

✅ **Organisation**
```
sauvegardes/
├── backup-firebase-2026-06-01.json
├── backup-firebase-2026-06-02.json
└── backup-firebase-2026-06-03.json
```

---

## 🔄 Restauration de la Base de Données

### ⚠️ ATTENTION - À LIRE AVANT DE CONTINUER

**CETTE OPÉRATION EST IRRÉVERSIBLE !**

La restauration va :
- ❌ **SUPPRIMER** toutes les données actuelles
- ✅ **REMPLACER** par les données de la sauvegarde
- ⚠️ **ÉCRASER** tous les pronostics, participants et matchs

**Créez TOUJOURS une sauvegarde avant de restaurer !**

### Accès au Script

Ouvrez le fichier `restore-firebase.html` dans votre navigateur :
```
pronostics-coupe-du-monde/restore-firebase.html
```

### Étapes de Restauration

1. **Ouvrir la page de restauration**
   - Double-cliquez sur `restore-firebase.html`
   - Lisez attentivement les avertissements

2. **Sélectionner le fichier de sauvegarde**
   - Cliquez sur la zone de téléchargement
   - OU glissez-déposez le fichier JSON
   - Seuls les fichiers `.json` sont acceptés

3. **Vérifier les informations**
   - Date de la sauvegarde
   - Nombre de participants
   - Nombre de matchs
   - Nombre de pronostics

4. **Confirmer la restauration**
   - Cliquez sur "🔄 Restaurer la Base de Données"
   - Une fenêtre de confirmation apparaît
   - Lisez attentivement et confirmez

5. **Attendre la fin du processus**
   - Une barre de progression s'affiche
   - Ne fermez pas la page pendant le processus
   - La page se rechargera automatiquement

6. **Vérification**
   - Retournez sur `index.html`
   - Vérifiez que les données sont correctes

### Cas d'Utilisation

#### 🔧 Correction d'une Erreur
```
1. Erreur détectée dans les données
2. Ouvrir restore-firebase.html
3. Charger la dernière sauvegarde valide
4. Restaurer
```

#### 🔄 Retour en Arrière
```
1. Modification non souhaitée
2. Identifier la sauvegarde avant modification
3. Restaurer cette sauvegarde
```

#### 🧪 Test et Développement
```
1. Créer une sauvegarde de production
2. Tester des modifications
3. Restaurer si nécessaire
```

---

## 🛡️ Stratégie de Sauvegarde Recommandée

### Sauvegarde Quotidienne
```bash
# Chaque jour avant utilisation
1. Ouvrir backup-firebase.html
2. Créer une sauvegarde
3. Renommer : backup-YYYY-MM-DD.json
```

### Sauvegarde Avant Modification
```bash
# Avant toute modification importante
1. Créer une sauvegarde
2. Renommer : backup-avant-[description].json
3. Effectuer les modifications
4. Créer une sauvegarde après : backup-apres-[description].json
```

### Rotation des Sauvegardes
```
Conserver :
- Les 7 derniers jours (quotidiennes)
- Les 4 dernières semaines (hebdomadaires)
- Les 3 derniers mois (mensuelles)
```

---

## 🚨 Procédure d'Urgence

### En cas de Perte de Données

1. **NE PANIQUEZ PAS** 🧘
2. **N'effectuez AUCUNE modification**
3. **Identifiez la dernière sauvegarde valide**
4. **Suivez la procédure de restauration**
5. **Vérifiez les données restaurées**

### En cas d'Échec de Restauration

1. **Vérifiez le fichier de sauvegarde**
   - Est-il corrompu ?
   - Est-ce le bon fichier ?

2. **Essayez une sauvegarde plus ancienne**

3. **Vérifiez la console du navigateur**
   - Appuyez sur F12
   - Onglet "Console"
   - Notez les erreurs

4. **Contactez le support technique**

---

## 📊 Vérification de l'Intégrité

### Après une Sauvegarde

✅ Vérifiez que :
- Le fichier a été téléchargé
- La taille du fichier est cohérente
- Les statistiques affichées sont correctes

### Après une Restauration

✅ Vérifiez que :
- Tous les participants sont présents
- Tous les matchs sont présents
- Les pronostics sont corrects
- Les résultats sont préservés

---

## 🔍 Dépannage

### Problème : Le fichier ne se télécharge pas

**Solutions :**
- Vérifiez les paramètres de téléchargement du navigateur
- Désactivez les bloqueurs de pop-up
- Essayez un autre navigateur

### Problème : Erreur lors de la restauration

**Solutions :**
- Vérifiez que le fichier JSON est valide
- Assurez-vous d'avoir une connexion Internet
- Vérifiez la console pour les erreurs détaillées

### Problème : Données manquantes après restauration

**Solutions :**
- Vérifiez que la sauvegarde contenait bien ces données
- Essayez une autre sauvegarde
- Vérifiez les permissions Firebase

---

## 📝 Format du Fichier de Sauvegarde

### Structure JSON

```json
{
  "metadata": {
    "backupDate": "ISO 8601 date",
    "backupDateFormatted": "Date lisible",
    "version": "Version du format",
    "application": "Nom de l'application"
  },
  "data": {
    "participants": {
      "participant-id-1": {
        "id": "participant-id-1",
        "name": "Nom du participant"
      }
    },
    "matches": {
      "match-id-1": {
        "id": "match-id-1",
        "homeTeam": "Équipe locale",
        "awayTeam": "Équipe visitante",
        "date": "Date du match",
        "actualScore": {
          "home": 2,
          "away": 1,
          "firstGoal": "home"
        },
        "predictions": {
          "participant-id-1": {
            "home": 2,
            "away": 1,
            "firstGoal": "home"
          }
        }
      }
    }
  }
}
```

---

## 🔐 Sécurité

### Bonnes Pratiques

✅ **Stockage sécurisé**
- Ne partagez pas vos sauvegardes publiquement
- Utilisez un stockage cloud sécurisé
- Chiffrez les sauvegardes sensibles

✅ **Accès contrôlé**
- Limitez l'accès aux scripts de restauration
- Documentez qui a accès
- Gardez un journal des restaurations

✅ **Validation**
- Vérifiez toujours le contenu avant restauration
- Testez sur un environnement de test si possible
- Conservez plusieurs versions

---

## 📞 Support

### En cas de problème

1. **Consultez ce guide**
2. **Vérifiez la console du navigateur** (F12)
3. **Consultez les autres guides** :
   - `GUIDE-UTILISATION.md`
   - `README.md`

### Informations à fournir

- Message d'erreur exact
- Capture d'écran de la console
- Fichier de sauvegarde (si possible)
- Étapes pour reproduire le problème

---

## 🎓 Résumé

### Commandes Rapides

**Créer une sauvegarde :**
```
1. Ouvrir backup-firebase.html
2. Cliquer sur "Créer une Sauvegarde"
3. Sauvegarder le fichier téléchargé
```

**Restaurer une sauvegarde :**
```
1. Ouvrir restore-firebase.html
2. Glisser-déposer le fichier JSON
3. Vérifier les informations
4. Confirmer la restauration
```

### Points Clés à Retenir

- ✅ Sauvegardez régulièrement
- ✅ Conservez plusieurs versions
- ⚠️ La restauration est irréversible
- ⚠️ Créez toujours une sauvegarde avant de restaurer
- 🔒 Stockez vos sauvegardes en lieu sûr

---

**Date de création** : 02 juin 2026  
**Version** : 1.0  
**Auteur** : Bob - Assistant IA

---

## 📚 Guides Connexes

- [GUIDE-UTILISATION.md](GUIDE-UTILISATION.md) - Guide d'utilisation général
- [README.md](README.md) - Documentation principale
- [GUIDE-REMONTEE-AUTOMATIQUE.md](GUIDE-REMONTEE-AUTOMATIQUE.md) - Remontée automatique des résultats

---

*Made with ❤️ by Bob*