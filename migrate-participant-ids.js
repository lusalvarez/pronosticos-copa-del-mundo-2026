// Script de migration pour mettre à jour les IDs des participants
// À exécuter une seule fois dans la console du navigateur sur la page index.html

// Fonction pour normaliser le nom du participant en ID cohérent
function normalizeParticipantId(name) {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

function migrateParticipantIds() {
  console.log("🔄 Début de la migration des IDs des participants...");
  
  // Charger l'état depuis localStorage
  const stateJson = localStorage.getItem("worldcup-state");
  if (!stateJson) {
    console.log("❌ Aucune donnée trouvée dans localStorage");
    return;
  }
  
  const state = JSON.parse(stateJson);
  console.log(`📊 État chargé: ${state.participants.length} participants, ${state.matches.length} matchs`);
  
  // Créer un mapping des anciens IDs vers les nouveaux IDs
  const idMapping = {};
  
  // Mettre à jour les IDs des participants
  state.participants.forEach(participant => {
    const oldId = participant.id;
    const newId = normalizeParticipantId(participant.name);
    
    if (oldId !== newId) {
      idMapping[oldId] = newId;
      participant.id = newId;
      console.log(`✅ Participant "${participant.name}": ${oldId} → ${newId}`);
    }
  });
  
  // Mettre à jour les prédictions dans les matchs
  state.matches.forEach(match => {
    const newPredictions = {};
    
    Object.entries(match.predictions).forEach(([oldId, prediction]) => {
      const newId = idMapping[oldId] || oldId;
      newPredictions[newId] = prediction;
    });
    
    match.predictions = newPredictions;
  });
  
  // Sauvegarder l'état mis à jour
  localStorage.setItem("worldcup-state", JSON.stringify(state));
  console.log("✅ Migration terminée! Les IDs ont été mis à jour dans localStorage.");
  console.log(`📝 ${Object.keys(idMapping).length} participants ont été migrés.`);
  console.log("🔄 Veuillez rafraîchir la page pour voir les changements.");
  
  return {
    migratedCount: Object.keys(idMapping).length,
    totalParticipants: state.participants.length,
    mapping: idMapping
  };
}

// Exécuter la migration
console.log("⚠️ MIGRATION DES IDs DES PARTICIPANTS");
console.log("Ce script va mettre à jour les IDs des participants pour utiliser un format cohérent.");
console.log("Tapez: migrateParticipantIds() pour lancer la migration");

// Made with Bob
