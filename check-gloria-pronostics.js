// Script pour vérifier les pronostics de Gloria dans Firebase
const firebase = require('firebase/app');
require('firebase/database');

const firebaseConfig = {
  apiKey: "AIzaSyC8GDye6ADmlKxtlF9UdNegLC7pMgSg3OU",
  authDomain: "pronostico-copa-del-mundo-2026.firebaseapp.com",
  databaseURL: "https://pronostico-copa-del-mundo-2026-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "pronostico-copa-del-mundo-2026",
  storageBucket: "pronostico-copa-del-mundo-2026.firebasestorage.app",
  messagingSenderId: "380632905205",
  appId: "1:380632905205:web:ecbe47471dca7ddb16dcbc"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

console.log("🔍 Recherche des pronostics de Gloria...\n");

database.ref('participants').once('value')
  .then(snapshot => {
    const participants = snapshot.val();
    
    if (!participants) {
      console.log("❌ Aucun participant trouvé");
      process.exit(0);
      return;
    }

    let gloriaFound = false;
    
    Object.keys(participants).forEach(participantId => {
      const participant = participants[participantId];
      const name = participant.name || '';
      
      if (name.toLowerCase().includes('gloria')) {
        gloriaFound = true;
        
        console.log("✅ PARTICIPANT TROUVÉ !");
        console.log("━".repeat(50));
        console.log(`📝 ID: ${participantId}`);
        console.log(`👤 Nom: ${participant.name}`);
        console.log(`📧 Email: ${participant.email || 'Non renseigné'}`);
        console.log("━".repeat(50));
        
        if (participant.predictions && Object.keys(participant.predictions).length > 0) {
          console.log("\n🎯 PRONOSTICS TROUVÉS :");
          console.log("━".repeat(50));
          
          let totalPronostics = 0;
          Object.keys(participant.predictions).forEach(matchId => {
            const prediction = participant.predictions[matchId];
            totalPronostics++;
            
            console.log(`\nMatch ${matchId}:`);
            console.log(`  🏠 Domicile: ${prediction.home || 'N/A'}`);
            console.log(`  ✈️  Extérieur: ${prediction.away || 'N/A'}`);
            if (prediction.firstGoal) {
              console.log(`  ⚽ Premier but: ${prediction.firstGoal}`);
            }
          });
          
          console.log("\n━".repeat(50));
          console.log(`📊 Total: ${totalPronostics} pronostic(s)`);
          
        } else {
          console.log("\n⚠️  Aucun pronostic enregistré");
        }
        
        console.log("\n" + "━".repeat(50));
      }
    });
    
    if (!gloriaFound) {
      console.log("❌ Aucun participant nommé 'Gloria' trouvé");
      console.log("\n📋 Participants disponibles :");
      
      Object.keys(participants).forEach(participantId => {
        const participant = participants[participantId];
        console.log(`  • ${participant.name || 'Sans nom'} (ID: ${participantId})`);
      });
    }
    
    process.exit(0);
  })
  .catch(error => {
    console.error("❌ Erreur:", error);
    process.exit(1);
  });

// Made with Bob
