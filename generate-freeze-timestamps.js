// Script pour générer les timestamps de freeze à partir des matchs Firebase
const admin = require('firebase-admin');

// Configuration Firebase
const serviceAccount = {
  "type": "service_account",
  "project_id": "pronosticos-copa-del-mundo",
  "private_key_id": "YOUR_PRIVATE_KEY_ID",
  "private_key": "YOUR_PRIVATE_KEY",
  "client_email": "YOUR_CLIENT_EMAIL",
  "client_id": "YOUR_CLIENT_ID",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"
};

// Alternative: utiliser l'API REST sans authentification admin
async function getMatchesFromFirebase() {
  const databaseURL = 'https://pronosticos-copa-del-mundo-default-rtdb.firebaseio.com';
  const response = await fetch(`${databaseURL}/matches.json`);
  const matches = await response.json();
  return matches;
}

async function generateTimestamps() {
  console.log('🔄 Récupération des matchs depuis Firebase...\n');
  
  const matches = await getMatchesFromFirebase();
  
  if (!matches) {
    console.error('❌ Aucun match trouvé');
    return;
  }

  // Grouper par journée
  const matchesByDay = {};
  Object.values(matches).forEach(match => {
    const day = match.day;
    if (!matchesByDay[day]) {
      matchesByDay[day] = [];
    }
    matchesByDay[day].push(match);
  });

  console.log('📊 PREMIERS MATCHS ET TIMESTAMPS DE FREEZE\n');
  console.log('='.repeat(80) + '\n');

  const timestamps = {};

  Object.keys(matchesByDay).sort((a, b) => a - b).forEach(day => {
    const dayMatches = matchesByDay[day];
    
    // Trouver le premier match
    const firstMatch = dayMatches.reduce((earliest, match) => {
      const matchDate = new Date(match.date);
      const earliestDate = new Date(earliest.date);
      return matchDate < earliestDate ? match : earliest;
    });

    // Parser la date en heure française (UTC+2)
    const matchDateStr = firstMatch.date;
    const matchDate = new Date(matchDateStr + '+02:00'); // Forcer UTC+2
    
    // Calculer le freeze 24h avant
    const freezeTimestamp = matchDate.getTime() - (24 * 60 * 60 * 1000);
    const freezeDate = new Date(freezeTimestamp);

    timestamps[`day${day}`] = freezeTimestamp;

    console.log(`Journée ${day}:`);
    console.log(`  Premier match: ${firstMatch.home} vs ${firstMatch.away}`);
    console.log(`  Date match: ${matchDateStr}`);
    console.log(`  Freeze: ${freezeDate.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} (France)`);
    console.log(`  Freeze: ${freezeDate.toLocaleString('es-CO', { timeZone: 'America/Bogota' })} (Colombie)`);
    console.log(`  Timestamp: ${freezeTimestamp}`);
    console.log('');
  });

  console.log('='.repeat(80));
  console.log('\n📝 CODE À COPIER DANS participant.js ET consulta.js:\n');
  console.log('const FREEZE_TIMESTAMPS = {');
  Object.entries(timestamps).forEach(([day, ts]) => {
    const date = new Date(ts);
    const dateStr = date.toLocaleString('fr-FR', { 
      timeZone: 'Europe/Paris',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    console.log(`  ${day}: ${ts},   // ${dateStr}`);
  });
  console.log('};');
}

generateTimestamps().catch(console.error);

// Made with Bob
