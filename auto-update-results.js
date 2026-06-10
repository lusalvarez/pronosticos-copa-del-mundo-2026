// Agent automatique de mise à jour des résultats depuis API-Football
// Utilise la clé API configurée dans api-football-config.js

const API_KEY = '96eea8d47bdd7070e11bdffe7159f5d3';
const API_BASE_URL = 'https://v3.football.api-sports.io';

// Fonction principale pour mettre à jour automatiquement les résultats
async function autoUpdateResults() {
  console.log('🔄 Début de la mise à jour automatique des résultats...');
  
  // Afficher un message de chargement
  showLoadingMessage('Récupération des résultats depuis API-Football...');
  
  try {
    // 1. Récupérer les matchs depuis Firebase
    const matchesSnapshot = await database.ref('matches').once('value');
    if (!matchesSnapshot.exists()) {
      throw new Error('Aucun match trouvé dans Firebase');
    }
    
    const localMatches = matchesSnapshot.val();
    console.log(`📊 ${localMatches.length} matchs trouvés dans Firebase`);
    
    // 2. Récupérer les résultats depuis l'API
    const apiResults = await fetchResultsFromAPI();
    console.log(`📡 ${apiResults.length} résultats récupérés depuis l'API`);
    
    // 3. Matcher et mettre à jour les résultats
    let updatedCount = 0;
    let errors = [];
    
    for (let i = 0; i < localMatches.length; i++) {
      const localMatch = localMatches[i];
      
      // Chercher le match correspondant dans les résultats de l'API
      const apiMatch = findMatchingApiResult(localMatch, apiResults);
      
      if (apiMatch && apiMatch.fixture.status.short === 'FT') {
        // Match terminé, mettre à jour les scores
        const homeScore = apiMatch.goals.home;
        const awayScore = apiMatch.goals.away;
        
        // Vérifier si le score a changé
        if (localMatch.homeScore !== homeScore || localMatch.awayScore !== awayScore) {
          try {
            await database.ref(`matches/${i}`).update({
              homeScore: homeScore,
              awayScore: awayScore
            });
            
            console.log(`✅ Match ${i + 1} mis à jour: ${localMatch.home} ${homeScore}-${awayScore} ${localMatch.away}`);
            updatedCount++;
          } catch (error) {
            console.error(`❌ Erreur mise à jour match ${i + 1}:`, error);
            errors.push(`Match ${i + 1}: ${error.message}`);
          }
        }
      }
    }
    
    // 4. Calculer les points de tous les participants
    if (updatedCount > 0) {
      showLoadingMessage('Calcul des points des participants...');
      await calculateAllParticipantsPoints();
    }
    
    // 5. Afficher le résultat
    hideLoadingMessage();
    
    if (updatedCount > 0) {
      alert(`✅ Mise à jour terminée!\n\n${updatedCount} match(s) mis à jour\nPoints recalculés pour tous les participants`);
    } else {
      alert('ℹ️ Aucun nouveau résultat à mettre à jour.\n\nTous les matchs sont déjà à jour.');
    }
    
    if (errors.length > 0) {
      console.warn('⚠️ Erreurs rencontrées:', errors);
    }
    
    // Recharger l'affichage
    if (typeof renderAdminMatches === 'function') {
      renderAdminMatches();
    }
    if (typeof renderPublicMatches === 'function') {
      renderPublicMatches();
    }
    if (typeof renderRanking === 'function') {
      renderRanking();
    }
    
  } catch (error) {
    hideLoadingMessage();
    console.error('❌ Erreur lors de la mise à jour automatique:', error);
    alert(`❌ Erreur lors de la mise à jour automatique:\n\n${error.message}\n\nVérifiez la console pour plus de détails.`);
  }
}

// Récupérer les résultats depuis l'API Football
async function fetchResultsFromAPI() {
  try {
    // Pour la Coupe du Monde 2026, on utilisera l'ID de la compétition
    // Note: L'ID exact sera disponible quand la compétition commencera
    const leagueId = 1; // FIFA World Cup
    const season = 2026;
    
    const url = `${API_BASE_URL}/fixtures?league=${leagueId}&season=${season}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.response || data.response.length === 0) {
      console.warn('⚠️ Aucun résultat trouvé pour la Coupe du Monde 2026');
      console.log('💡 Astuce: La Coupe du Monde 2026 n\'a peut-être pas encore commencé ou l\'ID de la compétition doit être mis à jour');
      return [];
    }
    
    return data.response;
    
  } catch (error) {
    console.error('❌ Erreur lors de la récupération depuis l\'API:', error);
    throw new Error(`Impossible de récupérer les résultats: ${error.message}`);
  }
}

// Trouver le match correspondant dans les résultats de l'API
function findMatchingApiResult(localMatch, apiResults) {
  // Normaliser les noms d'équipes pour la comparaison
  const normalizeTeamName = (name) => {
    return name.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, '');
  };
  
  const localHome = normalizeTeamName(localMatch.home);
  const localAway = normalizeTeamName(localMatch.away);
  
  // Chercher un match avec les mêmes équipes
  for (const apiMatch of apiResults) {
    const apiHome = normalizeTeamName(apiMatch.teams.home.name);
    const apiAway = normalizeTeamName(apiMatch.teams.away.name);
    
    if (apiHome === localHome && apiAway === localAway) {
      return apiMatch;
    }
  }
  
  return null;
}

// Calculer les points de tous les participants
async function calculateAllParticipantsPoints() {
  try {
    const participantsSnapshot = await database.ref('participants').once('value');
    if (!participantsSnapshot.exists()) {
      console.log('ℹ️ Aucun participant trouvé');
      return;
    }
    
    const matchesSnapshot = await database.ref('matches').once('value');
    const matches = matchesSnapshot.val();
    
    const participants = participantsSnapshot.val();
    let updatedCount = 0;
    
    for (const [participantId, participantData] of Object.entries(participants)) {
      if (!participantData.predictions) continue;
      
      let totalPoints = 0;
      
      participantData.predictions.forEach((pred, matchIndex) => {
        const match = matches[matchIndex];
        if (!match || match.homeScore === undefined || match.awayScore === undefined) {
          return;
        }
        
        const prediction = pred.prediction;
        if (!prediction || prediction.home === '' || prediction.away === '') {
          return;
        }
        
        const points = calculateMatchPoints(
          parseInt(prediction.home),
          parseInt(prediction.away),
          match.homeScore,
          match.awayScore
        );
        
        totalPoints += points;
      });
      
      await database.ref(`participants/${participantId}`).update({
        points: totalPoints
      });
      
      updatedCount++;
    }
    
    console.log(`✅ Points calculés pour ${updatedCount} participants`);
    
  } catch (error) {
    console.error('❌ Erreur lors du calcul des points:', error);
    throw error;
  }
}

// Calculer les points pour un match
function calculateMatchPoints(predHome, predAway, realHome, realAway) {
  // Score exact = 3 points
  if (predHome === realHome && predAway === realAway) {
    return 3;
  }
  
  // Bon résultat = 1 point
  const predResult = getMatchResult(predHome, predAway);
  const realResult = getMatchResult(realHome, realAway);
  
  if (predResult === realResult) {
    return 1;
  }
  
  // Mauvais pronostic = 0 points
  return 0;
}

// Obtenir le résultat d'un match (victoire/nul/défaite)
function getMatchResult(home, away) {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

// Afficher un message de chargement
function showLoadingMessage(message) {
  const existingMsg = document.getElementById('auto-update-loading');
  if (existingMsg) {
    existingMsg.textContent = message;
    return;
  }
  
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'auto-update-loading';
  loadingDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 30px;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 10000;
    text-align: center;
    min-width: 300px;
  `;
  
  loadingDiv.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 0 auto;"></div>
    </div>
    <p style="margin: 0; color: #333; font-weight: bold;">${message}</p>
  `;
  
  // Ajouter l'animation de rotation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(loadingDiv);
}

// Masquer le message de chargement
function hideLoadingMessage() {
  const loadingDiv = document.getElementById('auto-update-loading');
  if (loadingDiv) {
    loadingDiv.remove();
  }
}

// Attacher l'événement au bouton
document.addEventListener('DOMContentLoaded', () => {
  const autoUpdateBtn = document.getElementById('auto-update-results-btn');
  if (autoUpdateBtn) {
    autoUpdateBtn.addEventListener('click', () => {
      if (confirm('¿Deseas actualizar automáticamente los resultados desde API-Football?\n\nEsto sobrescribirá los resultados existentes.')) {
        autoUpdateResults();
      }
    });
    console.log('✅ Bouton de mise à jour automatique configuré');
  }
});

console.log('✅ Module auto-update-results.js chargé');

// Made with Bob
