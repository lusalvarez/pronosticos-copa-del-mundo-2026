# Guide d'utilisation - Mise à jour automatique des résultats

## 📋 Vue d'ensemble

L'agent automatique de mise à jour des résultats permet de récupérer automatiquement les scores des matchs depuis l'API-Football et de mettre à jour la base de données Firebase.

## 🔑 Configuration de l'API

### Clé API actuelle
- **Service**: API-Football (api-football.com)
- **Clé API**: `96eea8d47bdd7070e11bdffe7159f5d3`
- **Plan**: Gratuit (100 requêtes/jour)
- **Limite**: Suffisant pour la Coupe du Monde 2026

### Renouvellement de la clé API

Si vous devez obtenir une nouvelle clé API :

1. Visitez [api-football.com](https://www.api-football.com/)
2. Créez un compte ou connectez-vous
3. Accédez à votre tableau de bord
4. Copiez votre clé API
5. Modifiez le fichier `auto-update-results.js` :
   ```javascript
   const API_KEY = 'VOTRE_NOUVELLE_CLE_API';
   ```

## 🚀 Utilisation

### Depuis l'écran d'administration

1. Ouvrez l'application dans votre navigateur
2. Assurez-vous d'être sur l'onglet **"Pantalla administrador"**
3. Cliquez sur le bouton vert **"🔄 Actualizar Resultados Automáticamente"**
4. Confirmez l'action dans la boîte de dialogue
5. Attendez que la mise à jour se termine

### Processus automatique

L'agent effectue les actions suivantes :

1. **Récupération des matchs** depuis Firebase
2. **Appel à l'API-Football** pour obtenir les résultats
3. **Correspondance des matchs** entre Firebase et l'API
4. **Mise à jour des scores** pour les matchs terminés
5. **Recalcul automatique des points** de tous les participants
6. **Affichage du résultat** avec le nombre de matchs mis à jour

## 📊 Informations affichées

### Pendant la mise à jour
- Message de chargement avec animation
- Indication de l'étape en cours

### Après la mise à jour
- Nombre de matchs mis à jour
- Confirmation du recalcul des points
- Message si aucune mise à jour n'était nécessaire

## ⚠️ Points importants

### Limitations
- **100 requêtes/jour** avec le plan gratuit
- L'API ne retourne que les matchs **terminés** (statut "FT")
- Les matchs en cours ou à venir ne sont pas mis à jour

### Correspondance des matchs
L'agent utilise les noms d'équipes pour faire correspondre les matchs :
- Normalisation automatique (minuscules, sans accents)
- Comparaison exacte des noms d'équipes
- Si un match n'est pas trouvé, il est ignoré

### Calcul des points
Après chaque mise à jour, les points sont automatiquement recalculés pour tous les participants selon les règles :
- **Score exact** : 3 points
- **Bon résultat** (victoire/nul/défaite) : 1 point
- **Mauvais pronostic** : 0 point

## 🔧 Dépannage

### Erreur "Impossible de récupérer les résultats"
**Causes possibles** :
- Clé API invalide ou expirée
- Limite de requêtes dépassée (100/jour)
- Problème de connexion internet
- API-Football temporairement indisponible

**Solutions** :
1. Vérifiez votre connexion internet
2. Vérifiez que la clé API est valide
3. Attendez quelques minutes et réessayez
4. Consultez la console du navigateur (F12) pour plus de détails

### Aucun match mis à jour
**Causes possibles** :
- Les matchs ne sont pas encore terminés
- Les résultats sont déjà à jour dans Firebase
- Les noms d'équipes ne correspondent pas exactement

**Solutions** :
1. Vérifiez que les matchs sont bien terminés
2. Vérifiez les noms d'équipes dans Firebase et l'API
3. Utilisez l'interface manuelle si nécessaire

### Erreur de calcul des points
**Causes possibles** :
- Problème de connexion à Firebase
- Structure de données incorrecte

**Solutions** :
1. Vérifiez la connexion à Firebase
2. Consultez la console du navigateur pour les erreurs
3. Utilisez le bouton de recalcul manuel si disponible

## 📝 Notes techniques

### Structure de l'API-Football

L'API retourne les matchs avec cette structure :
```json
{
  "fixture": {
    "id": 12345,
    "status": {
      "short": "FT"  // Match terminé
    }
  },
  "teams": {
    "home": { "name": "France" },
    "away": { "name": "Argentina" }
  },
  "goals": {
    "home": 2,
    "away": 1
  }
}
```

### Normalisation des noms d'équipes

Pour faire correspondre les matchs, les noms sont normalisés :
- Conversion en minuscules
- Suppression des accents
- Suppression des caractères spéciaux
- Exemple : "Côte d'Ivoire" → "cotedivoire"

## 🔄 Mise à jour manuelle

Si l'agent automatique ne fonctionne pas, vous pouvez toujours utiliser l'interface manuelle :

1. Ouvrez `update-results.html` dans votre navigateur
2. Entrez les scores manuellement
3. Cliquez sur "Calcular Puntos de Todos los Participantes"

Consultez le fichier `GUIDE-UPDATE-RESULTS.md` pour plus de détails.

## 📞 Support

En cas de problème persistant :
1. Consultez la console du navigateur (F12)
2. Vérifiez les logs dans la console
3. Contactez l'administrateur système

## 🔐 Sécurité

- La clé API est stockée dans le code JavaScript
- Pour une meilleure sécurité en production, utilisez un backend
- Ne partagez jamais votre clé API publiquement

## 📅 Maintenance

### Avant la Coupe du Monde 2026
- Vérifiez que la clé API est toujours valide
- Testez l'agent avec des matchs de test
- Vérifiez l'ID de la compétition dans l'API

### Pendant la Coupe du Monde
- Utilisez l'agent après chaque journée de matchs
- Surveillez la limite de 100 requêtes/jour
- Gardez une sauvegarde régulière de Firebase

### Après la Coupe du Monde
- Conservez les données pour référence
- Archivez les résultats finaux
- Préparez pour la prochaine édition

---

**Version**: 1.0  
**Date**: 10 juin 2026  
**Auteur**: Bob - Assistant IA