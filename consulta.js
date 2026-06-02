// Polyfill pour crypto.randomUUID() (Safari mobile < iOS 15.4)
if (!crypto.randomUUID) {
  crypto.randomUUID = function() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  };
}

// Script dédié pour la page de consultation publique
// Version simplifiée qui charge uniquement les données depuis Firebase

let state = {
  participants: [],
  matches: []
};

// Éléments DOM
const rankingTable = document.getElementById('ranking-table');
const publicMatches = document.getElementById('public-matches');
const publicTemplate = document.getElementById('public-match-template');

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function formatDate(value) {
  if (!value) {
    return "Fecha no definida";
  }

  const date = new Date(value);
  
  // Heure française
  const frenchTime = date.toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  
  // Heure colombienne (France -7h)
  const colombianDate = new Date(date.getTime() - (7 * 60 * 60 * 1000));
  const colombianTime = colombianDate.toLocaleTimeString("es-ES", {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  return `${frenchTime} (hora francesa) - ${colombianTime} (hora colombiana)`;
}

function groupMatchesByDay(matches) {
  const dayGroups = [];
  
  // Séparer les matchs manuels des matchs de la Coupe du Monde
  const worldCupMatches = [];
  const manualMatches = [];
  
  matches.forEach((match, index) => {
    if (match.stage === "Partido manual" || match.addedManually === true) {
      manualMatches.push({ ...match, originalIndex: index });
    } else {
      worldCupMatches.push({ ...match, originalIndex: index });
    }
  });
  
  let currentIndex = 0;
  
  // Définir la structure des journées
  const dayStructure = [
    { name: "JORNADA 1", count: 24, stage: "Fase de grupos" },
    { name: "JORNADA 2", count: 24, stage: "Fase de grupos" },
    { name: "JORNADA 3", count: 24, stage: "Fase de grupos" },
    { name: "DIECISEISAVOS DE FINAL", count: 16, stage: "Dieciseisavos de final" },
    { name: "OCTAVOS DE FINAL", count: 8, stage: "Octavos de final" },
    { name: "CUARTOS DE FINAL", count: 4, stage: "Cuartos de final" },
    { name: "SEMIFINALES", count: 2, stage: "Semifinales" },
    { name: "FINALES", count: 2, stage: "Finales" }
  ];
  
  // Grouper les matchs de la Coupe du Monde selon la structure définie
  for (const dayDef of dayStructure) {
    if (currentIndex >= worldCupMatches.length) {
      break;
    }
    
    const dayMatches = worldCupMatches.slice(currentIndex, currentIndex + dayDef.count);
    
    if (dayMatches.length > 0) {
      dayGroups.push({
        name: dayDef.name,
        matches: dayMatches,
        stage: dayDef.stage,
        date: dayMatches[0].date,
        isWorldCup: true
      });
      currentIndex += dayMatches.length;
    }
  }
  
  // Ajouter les matchs manuels comme un groupe séparé à la fin
  if (manualMatches.length > 0) {
    manualMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    dayGroups.push({
      name: "JORNADA EXTRA",
      matches: manualMatches,
      stage: "Jornada extra",
      date: manualMatches[0].date,
      isManual: true
    });
  }
  
  return dayGroups;
}

function isDayLocked(dayMatches) {
  if (!dayMatches || dayMatches.length === 0) return false;
  
  const firstMatch = dayMatches.reduce((earliest, match) => {
    const matchDate = new Date(match.date);
    const earliestDate = new Date(earliest.date);
    return matchDate < earliestDate ? match : earliest;
  });
  
  const firstMatchDate = new Date(firstMatch.date);
  const now = new Date();
  const deadline = new Date(firstMatchDate.getTime() - (24 * 60 * 60 * 1000));
  
  return now >= deadline;
}

function toNumber(value) {
  return value === "" || value === null || value === undefined ? null : Number(value);
}

function getOutcome(home, away) {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function computePredictionPoints(prediction, actualScore) {
  const predictedHome = toNumber(prediction.home);
  const predictedAway = toNumber(prediction.away);
  const actualHome = toNumber(actualScore.home);
  const actualAway = toNumber(actualScore.away);

  if (
    predictedHome === null ||
    predictedAway === null ||
    actualHome === null ||
    actualAway === null
  ) {
    return 0;
  }

  if (predictedHome === actualHome && predictedAway === actualAway) {
    return 3; // Score exact
  }

  if (getOutcome(predictedHome, predictedAway) === getOutcome(actualHome, actualAway)) {
    return 1; // Résultat correct
  }

  return 0;
}

function isFirstGoalCorrect(prediction, actualScore) {
  if (!prediction || !actualScore) return false;
  
  const predictedFirstGoal = prediction.firstGoal;
  const actualFirstGoal = actualScore.firstGoalTeam;
  
  if (!predictedFirstGoal || !actualFirstGoal) return false;
  
  return predictedFirstGoal === actualFirstGoal;
}

// ============================================
// FONCTIONS DE RENDU
// ============================================

function getRanking() {
  return state.participants
    .map((participant) => {
      const totalPoints = state.matches.reduce((sum, match) => {
        return sum + computePredictionPoints(match.predictions[participant.id], match.actualScore);
      }, 0);

      const exactScores = state.matches.filter((match) => {
        const prediction = match.predictions[participant.id];
        return (
          toNumber(prediction.home) === toNumber(match.actualScore.home) &&
          toNumber(prediction.away) === toNumber(match.actualScore.away) &&
          toNumber(match.actualScore.home) !== null
        );
      }).length;

      const correctFirstGoals = state.matches.filter((match) => {
        return isFirstGoalCorrect(match.predictions[participant.id], match.actualScore);
      }).length;

      return {
        ...participant,
        totalPoints,
        exactScores,
        correctFirstGoals,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || b.exactScores - a.exactScores || b.correctFirstGoals - a.correctFirstGoals || a.name.localeCompare(b.name));
}

function renderRanking() {
  const ranking = getRanking();

  if (!ranking.length) {
    rankingTable.innerHTML = '<p class="empty-state">Ningún participante para clasificar.</p>';
    return;
  }

  const rows = ranking
    .map(
      (participant, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${participant.name}</td>
          <td>${participant.totalPoints}</td>
          <td>${participant.exactScores}</td>
          <td>${participant.correctFirstGoals}</td>
        </tr>
      `
    )
    .join("");

  rankingTable.innerHTML = `
    <table class="ranking-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Participante</th>
          <th>Puntos</th>
          <th>Marcadores exactos</th>
          <th>⚽ Primeros goles</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderPublicMatches() {
  publicMatches.innerHTML = "";

  if (!state.matches.length) {
    publicMatches.innerHTML = '<p class="empty-state">Ningún partido disponible.</p>';
    return;
  }

  // Titre principal
  const mainTitle = document.createElement("div");
  mainTitle.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 1.5rem;
    border-radius: 12px;
    margin-bottom: 2rem;
    text-align: center;
  `;
  mainTitle.innerHTML = `
    <h2 style="margin: 0; font-size: 1.8rem;">⚽ COPA DEL MUNDO 2026</h2>
    <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Pronósticos y resultados en tiempo real</p>
  `;
  publicMatches.appendChild(mainTitle);

  // Grouper les matchs par journée
  const dayGroups = groupMatchesByDay(state.matches);
  
  dayGroups.forEach((dayGroup, dayIndex) => {
    const dayName = dayGroup.name || `JORNADA ${dayIndex + 1}`;
    const isLocked = isDayLocked(dayGroup.matches);
    const firstMatchDate = new Date(dayGroup.matches[0].date);
    const deadline = new Date(firstMatchDate.getTime() - (24 * 60 * 60 * 1000));
    
    // Section de la journée
    const daySection = document.createElement("div");
    daySection.style.cssText = `
      margin-bottom: 2.5rem;
      border: 2px solid ${isLocked ? '#ef4444' : '#667eea'};
      border-radius: 12px;
      overflow: hidden;
      background: ${isLocked ? 'rgba(239, 68, 68, 0.05)' : 'rgba(102, 126, 234, 0.05)'};
    `;
    
    // En-tête de la journée
    const dayHeader = document.createElement("div");
    dayHeader.style.cssText = `
      background: ${isLocked ? '#ef4444' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'};
      color: white;
      padding: 1.2rem 1.5rem;
    `;
    dayHeader.innerHTML = `
      <h3 style="margin: 0; font-size: 1.4rem;">
        ${isLocked ? '🔒' : '📅'} ${dayName}
      </h3>
      <p style="margin: 0.5rem 0 0 0; font-size: 0.95rem; opacity: 0.95;">
        ${formatDate(dayGroup.matches[0].date).split(',')[0]}
      </p>
    `;
    daySection.appendChild(dayHeader);
    
    // Avertissement de délai
    const warningBox = document.createElement("div");
    warningBox.style.cssText = `
      padding: 1rem 1.5rem;
      background: ${isLocked ? '#fee2e2' : '#dbeafe'};
      border-bottom: 1px solid ${isLocked ? '#fecaca' : '#bfdbfe'};
    `;
    
    if (isLocked) {
      warningBox.innerHTML = `
        <p style="margin: 0; color: #991b1b; font-weight: bold;">
          ⚠️ JORNADA CERRADA
        </p>
        <p style="margin: 0.5rem 0 0 0; color: #7f1d1d; font-size: 0.9rem;">
          La fecha límite era: ${formatDate(deadline.toISOString())}
        </p>
      `;
    } else {
      warningBox.innerHTML = `
        <p style="margin: 0; color: #1e40af; font-weight: bold;">
          ⏰ Fecha límite para pronósticos:
        </p>
        <p style="margin: 0.5rem 0 0 0; color: #1e3a8a; font-size: 0.95rem;">
          ${formatDate(deadline.toISOString())}
        </p>
      `;
    }
    daySection.appendChild(warningBox);
    
    // Conteneur des matchs
    const matchesContainer = document.createElement("div");
    matchesContainer.style.cssText = `
      padding: 1.5rem;
    `;
    
    // Rendre chaque match de la journée
    dayGroup.matches.forEach((match) => {
      const fragment = publicTemplate.content.cloneNode(true);
      fragment.querySelector(".match-title").textContent = `${match.homeTeam} - ${match.awayTeam}`;
      fragment.querySelector(".match-date").textContent = formatDate(match.date);
      
      const resultBadge = fragment.querySelector(".result-badge");
      if (match.actualScore.home === null) {
        resultBadge.textContent = "Resultado pendiente";
      } else {
        const firstGoalText = match.actualScore.firstGoalTeam 
          ? ` | ⚽ Primer gol: ${match.actualScore.firstGoalTeam === 'home' ? match.homeTeam : match.awayTeam}`
          : '';
        resultBadge.textContent = `Resultado: ${match.actualScore.home} - ${match.actualScore.away}${firstGoalText}`;
      }

      const predictionsWrapper = fragment.querySelector(".public-predictions");
      const grid = document.createElement("div");
      grid.className = "predictions-grid";

      // Vérifier si la journée est verrouillée pour afficher les pronostics
      const showPredictions = isLocked;

      state.participants.forEach((participant) => {
        const prediction = match.predictions[participant.id] || { home: "", away: "", firstGoal: "" };
        const points = computePredictionPoints(prediction, match.actualScore);
        const firstGoalCorrect = isFirstGoalCorrect(prediction, match.actualScore);
        
        const row = document.createElement("div");
        row.className = "prediction-row";
        
        let firstGoalDisplay = '';
        if (showPredictions && prediction.firstGoal) {
          const firstGoalTeamName = prediction.firstGoal === 'home' ? match.homeTeam : match.awayTeam;
          firstGoalDisplay = `⚽ ${firstGoalTeamName}`;
          if (match.actualScore.firstGoalTeam) {
            firstGoalDisplay += firstGoalCorrect ? ' ✅' : ' ❌';
          }
        } else if (!showPredictions) {
          firstGoalDisplay = '🔒';
        }
        
        row.innerHTML = `
          <div>
            <strong>${participant.name}</strong>
            <span class="small-text">Pronóstico</span>
          </div>
          <div>${showPredictions ? (prediction.home === "" ? "-" : prediction.home) : "🔒"}</div>
          <div>${showPredictions ? (prediction.away === "" ? "-" : prediction.away) : "🔒"}</div>
          <div>
            <span class="small-text">${firstGoalDisplay || '-'}</span>
          </div>
          <div>
            <span class="${match.actualScore.home === null ? "status-pending" : "status-success"}">
              ${match.actualScore.home === null ? "Partido no jugado" : (showPredictions ? `${points} punto(s)` : "🔒")}
            </span>
          </div>
        `;
        grid.appendChild(row);
      });

      predictionsWrapper.appendChild(grid);
      matchesContainer.appendChild(fragment);
    });
    
    daySection.appendChild(matchesContainer);
    publicMatches.appendChild(daySection);
  });
}

function render() {
  renderRanking();
  renderPublicMatches();
}

// ============================================
// CHARGEMENT DES DONNÉES DEPUIS FIREBASE
// ============================================

function listenToFirebaseUpdates() {
  // Vérifier que Firebase est initialisé
  if (typeof firebase === 'undefined' || !firebase.database) {
    console.error("❌ Firebase no está disponible");
    rankingTable.innerHTML = '<p class="empty-state" style="color: #ef4444;">Error: Firebase no está configurado correctamente.</p>';
    publicMatches.innerHTML = '<p class="empty-state" style="color: #ef4444;">Error: No se pueden cargar los datos.</p>';
    return;
  }
  
  try {
    const db = firebase.database();
    const participantsRef = db.ref('participants');
    const matchesRef = db.ref('matches');
    
    console.log("🔄 Cargando datos desde Firebase...");
    
    // Afficher un message de chargement
    rankingTable.innerHTML = '<p class="empty-state">⏳ Cargando clasificación...</p>';
    publicMatches.innerHTML = '<p class="empty-state">⏳ Cargando partidos...</p>';
    
    // Timeout de sécurité
    let dataLoaded = false;
    setTimeout(() => {
      if (!dataLoaded) {
        console.log("⚠️ Timeout: Los datos tardan en cargar");
        if (state.matches.length === 0) {
          publicMatches.innerHTML = '<p class="empty-state" style="color: #f59e0b;">⚠️ No hay datos disponibles todavía. Por favor, asegúrate de que los datos estén en Firebase.</p>';
        }
        if (state.participants.length === 0) {
          rankingTable.innerHTML = '<p class="empty-state" style="color: #f59e0b;">⚠️ No hay participantes todavía.</p>';
        }
      }
    }, 5000);
    
    // Écouter les matchs depuis Firebase
    matchesRef.on('value', (snapshot) => {
      const firebaseMatches = snapshot.val();
      
      if (!firebaseMatches) {
        console.log("ℹ️ No hay partidos en Firebase todavía");
        publicMatches.innerHTML = '<p class="empty-state">No hay partidos disponibles.</p>';
        return;
      }
      
      // Convertir l'objet Firebase en tableau
      const matchesArray = Object.entries(firebaseMatches).map(([firebaseId, matchData]) => {
        const existingMatch = state.matches.find(m => m.id === firebaseId);
        
        return {
          id: firebaseId,
          homeTeam: matchData.homeTeam,
          awayTeam: matchData.awayTeam,
          date: matchData.date,
          stage: matchData.stage,
          group: matchData.group || null,
          addedManually: matchData.addedManually || false,
          actualScore: {
            home: matchData.actualScore?.home ?? null,
            away: matchData.actualScore?.away ?? null,
            firstGoalTeam: matchData.actualScore?.firstGoalTeam ?? null
          },
          predictions: existingMatch?.predictions || {}
        };
      });
      
      state.matches = matchesArray;
      dataLoaded = true;
      console.log(`✅ ${matchesArray.length} partidos cargados`);
      render();
    });
    
    // Écouter les participants depuis Firebase
    participantsRef.on('value', (snapshot) => {
      const firebaseData = snapshot.val();
      
      if (!firebaseData) {
        console.log("ℹ️ No hay participantes en Firebase todavía");
        rankingTable.innerHTML = '<p class="empty-state">No hay participantes todavía.</p>';
        return;
      }
      
      console.log("📥 Datos recibidos:", Object.keys(firebaseData).length, "participantes");
      
      // Créer ou mettre à jour les participants
      Object.values(firebaseData).forEach(participantData => {
        const participantName = participantData.participantName;
        
        let participant = state.participants.find(p =>
          p.name.toLowerCase() === participantName.toLowerCase()
        );
        
        if (!participant) {
          participant = {
            id: crypto.randomUUID(),
            name: participantName
          };
          state.participants.push(participant);
          console.log(`✅ Participante agregado: ${participantName}`);
        }
        
        // Mettre à jour les prédictions
        participantData.predictions.forEach((predictionData, index) => {
          if (state.matches[index]) {
            const prediction = predictionData.prediction;
            if (prediction && !prediction.hasOwnProperty('firstGoal')) {
              prediction.firstGoal = "";
            }
            state.matches[index].predictions[participant.id] = prediction;
          }
        });
      });
      
      dataLoaded = true;
      console.log(`✅ ${state.participants.length} participantes cargados`);
      render();
    });
    
  } catch (error) {
    console.error("❌ Error al cargar datos de Firebase:", error);
    rankingTable.innerHTML = '<p class="empty-state" style="color: #ef4444;">Error al cargar los datos. Por favor, recarga la página.</p>';
    publicMatches.innerHTML = '<p class="empty-state" style="color: #ef4444;">Error al cargar los datos.</p>';
  }
}

// ============================================
// INITIALISATION
// ============================================

// Démarrer l'écoute Firebase au chargement de la page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', listenToFirebaseUpdates);
} else {
  listenToFirebaseUpdates();
}

console.log("✅ Script de consultation chargé");

// Made with Bob
