// Système de vérification automatique de version
// Force le rechargement si une nouvelle version est disponible

(function() {
  const CURRENT_VERSION = '20260610-timestamp-fix';
  const VERSION_KEY = 'app_version';
  
  // Récupérer la version stockée
  const storedVersion = localStorage.getItem(VERSION_KEY);
  
  // Si la version est différente, forcer le rechargement
  if (storedVersion !== CURRENT_VERSION) {
    console.log(`🔄 Nouvelle version détectée: ${CURRENT_VERSION} (ancienne: ${storedVersion})`);
    
    // Sauvegarder la nouvelle version
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
    
    // Vider le cache et recharger
    if ('caches' in window) {
      caches.keys().then(function(names) {
        for (let name of names) {
          caches.delete(name);
        }
      });
    }
    
    // Recharger la page en forçant le rechargement depuis le serveur
    window.location.reload(true);
  } else {
    console.log(`✅ Version à jour: ${CURRENT_VERSION}`);
  }
})();

// Made with Bob
