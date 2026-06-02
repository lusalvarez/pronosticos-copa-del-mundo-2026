// Polyfill pour crypto.randomUUID() (Safari mobile < iOS 15.4)
if (!crypto.randomUUID) {
  crypto.randomUUID = function() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  };
}

const STORAGE_KEY = "pronostics-coupe-du-monde-v1";
const API_KEY_STORAGE = "pronostics-api-key";

// Détecter si on est sur la page de consultation publique
const isConsultaPage = window.location.pathname.includes('consulta.html');

// Variable globale pour stocker les participants qui ont envoyé des pronostics via Firebase
let firebaseParticipants = new Set();

const initialData = {
  participants: [],
  matches: [], // Les matchs seront chargés depuis Firebase
};

function withDefaultPredictions(data) {
  const clone = structuredClone(data);

  clone.matches.forEach((match) => {
    clone.participants.forEach((participant) => {
      if (!match.predictions[participant.id]) {
        match.predictions[participant.id] = { home: "", away: "", firstGoal: "" };
      }
      // Migration: ajouter firstGoal aux prédictions existantes si manquant
      if (match.predictions[participant.id] && !match.predictions[participant.id].hasOwnProperty('firstGoal')) {
        match.predictions[participant.id].firstGoal = "";
      }
    });
  });

  return clone;
}

function cleanOrphanPredictions(state) {
  // Créer un Set des IDs de participants valides pour une recherche rapide
  const validParticipantIds = new Set(state.participants.map(p => p.id));
  
  // Nettoyer les pronostics orphelins dans chaque match
  let cleanedCount = 0;
  state.matches.forEach(match => {
    if (match.predictions) {
      Object.keys(match.predictions).forEach(participantId => {
        if (!validParticipantIds.has(participantId)) {
          delete match.predictions[participantId];
          cleanedCount++;
        }
      });
    }
  });
  
  if (cleanedCount > 0) {
    console.log(`🧹 Nettoyage: ${cleanedCount} pronostic(s) orphelin(s) supprimé(s)`);
  }
  
  return state;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const seeded = seedPredictions(withDefaultPredictions(initialData));
    persistState(seeded);
    return seeded;
  }

  try {
    const loadedState = withDefaultPredictions(JSON.parse(saved));
    // Nettoyer les pronostics orphelins au chargement
    return cleanOrphanPredictions(loadedState);
  } catch (error) {
    const fallback = seedPredictions(withDefaultPredictions(initialData));
    persistState(fallback);
    return fallback;
  }
}

function seedPredictions(data) {
  if (data.matches.length >= 2 && data.participants.length >= 3) {
    const [match1, match2] = data.matches;
    const [alice, bruno, chloe] = data.participants;

    match1.predictions[alice.id] = { home: 2, away: 1, firstGoal: "home" };
    match1.predictions[bruno.id] = { home: 1, away: 0, firstGoal: "home" };
    match1.predictions[chloe.id] = { home: 2, away: 2, firstGoal: "away" };

    match2.predictions[alice.id] = { home: 1, away: 1, firstGoal: "home" };
    match2.predictions[bruno.id] = { home: 0, away: 2, firstGoal: "away" };
    match2.predictions[chloe.id] = { home: 2, away: 1, firstGoal: "home" };
  }

  return data;
}

function persistState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

// Forcer un nettoyage immédiat au démarrage
state = cleanOrphanPredictions(state);
persistState(state);

const adminView = document.getElementById("admin-view");
const publicView = document.getElementById("public-view");
const participantForm = document.getElementById("participant-form");
const participantNameInput = document.getElementById("participant-name");
const matchForm = document.getElementById("match-form");
const participantsList = document.getElementById("participants-list");
const adminMatches = document.getElementById("admin-matches");
const publicMatches = document.getElementById("public-matches");
const rankingTable = document.getElementById("ranking-table");
const adminTemplate = document.getElementById("admin-match-template");
const publicTemplate = document.getElementById("public-match-template");
const tabButtons = document.querySelectorAll(".tab-button");
const importMatchesBtn = document.getElementById("import-matches-btn");
const fileInput = document.getElementById("file-input");
const deleteAllMatchesBtn = document.getElementById("delete-all-matches-btn");

// Initialiser les événements admin uniquement si on n'est pas sur la page de consultation
if (!isConsultaPage) {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  if (participantForm) {
    participantForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = participantNameInput.value.trim();

  if (!name) {
    return;
  }

  state.participants.push({ id: crypto.randomUUID(), name });

  state.matches.forEach((match) => {
    match.predictions[state.participants[state.participants.length - 1].id] = {
      home: "",
      away: "",
      firstGoal: "",
    };
  });

  participantForm.reset();
      saveAndRender();
    });
  }

  if (matchForm) {
    matchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const homeTeam = document.getElementById("home-team").value.trim();
  const awayTeam = document.getElementById("away-team").value.trim();
  const date = document.getElementById("match-date").value;

  if (!homeTeam || !awayTeam || !date) {
    return;
  }

  // Si Firebase est disponible, envoyer le match à Firebase
  if (typeof firebase !== 'undefined' && firebase.database) {
    try {
      const db = firebase.database();
      const matchesRef = db.ref('matches');
      
      const matchData = {
        homeTeam: homeTeam,
        awayTeam: awayTeam,
        date: date,
        stage: "Partido manual",
        group: null,
        addedManually: true,
        importedAt: new Date().toISOString()
      };
      
      // Ajouter à Firebase (le listener se chargera de l'affichage local)
      await matchesRef.push(matchData);
      
      console.log("✅ Partido manual agregado a Firebase");
      matchForm.reset();
      
      // Afficher un message de succès
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
      `;
      notification.innerHTML = `
        ✅ <strong>Partido agregado:</strong><br>
        ${homeTeam} vs ${awayTeam}<br>
        <small>Sincronizado con Firebase</small>
      `;
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
      }, 3000);
      
    } catch (error) {
      console.error("❌ Error al agregar partido a Firebase:", error);
      alert(`❌ Error al agregar el partido.\n\nError: ${error.message}`);
    }
  } else {
    // Fallback: ajout local uniquement si Firebase n'est pas disponible
    const predictions = {};
    state.participants.forEach((participant) => {
      predictions[participant.id] = { home: "", away: "", firstGoal: "" };
    });

    state.matches.push({
      id: crypto.randomUUID(),
      homeTeam,
      awayTeam,
      date,
      actualScore: { home: null, away: null, firstGoalTeam: null },
      predictions,
    });

    matchForm.reset();
    saveAndRender();
    
    alert("⚠️ Partido agregado localmente.\n\nFirebase no está disponible. Los participantes no verán este partido.");
  }
});
  }

  if (importMatchesBtn) {
    importMatchesBtn.addEventListener("click", () => {
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    let data;
    
    // Bloc 1: Parser le JSON
    try {
      data = JSON.parse(e.target.result);
      
      if (!data.matches || !Array.isArray(data.matches)) {
        alert("Formato de archivo inválido. El archivo debe contener un array 'matches'.");
        return;
      }
    } catch (error) {
      alert(`Error al leer el archivo JSON. Verifica el formato del archivo.\n\nError: ${error.message}`);
      console.error("Error de parsing JSON:", error);
      return;
    }

    // Bloc 2: Confirmer l'import (AJOUT uniquement, pas de suppression)
    const currentMatchCount = state.matches.length;
    const newTotal = currentMatchCount + data.matches.length;
    
    const confirmMessage = currentMatchCount === 0
      ? `¿Deseas importar ${data.matches.length} partido(s)?\n\nEsto agregará estos partidos y los sincronizará con los participantes.`
      : `¿Deseas importar ${data.matches.length} partido(s) adicionales?\n\nActualmente tienes ${currentMatchCount} partido(s).\nDespués de la importación tendrás ${newTotal} partido(s) en total.\n\n⚠️ Si quieres empezar de cero, usa primero el botón "Eliminar todos los partidos".`;
    
    if (!confirm(confirmMessage)) {
      fileInput.value = "";
      return;
    }

    // Bloc 3: Importer localement ET envoyer vers Firebase (AJOUT uniquement)
    console.log("📥 Début de l'import (mode AJOUT)...");
    
    try {
      // Si Firebase est disponible, envoyer d'abord à Firebase pour obtenir les IDs
      if (typeof firebase !== 'undefined' && firebase.database) {
        const db = firebase.database();
        const matchesRef = db.ref('matches');
        
        console.log("📤 Enviando partidos a Firebase...");
        
        // Envoyer chaque match à Firebase (le listener se chargera de l'affichage)
        for (const match of data.matches) {
          const matchData = {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            date: match.date,
            stage: match.stage || "Fase de grupos",
            group: match.group || null,
            importedAt: new Date().toISOString()
          };
          
          // Utiliser push() pour ajouter à Firebase
          await matchesRef.push(matchData);
        }
        
        fileInput.value = "";
        console.log(`✅ ${data.matches.length} partido(s) enviado(s) a Firebase`);
        console.log("⏳ El listener de Firebase cargará los partidos automáticamente...");
        alert(`¡${data.matches.length} partido(s) importado(s) y sincronizado(s) con éxito!\n\nLos partidos aparecerán automáticamente en unos segundos.\nLos participantes verán estos partidos automáticamente.`);
      } else {
        // Fallback: import local uniquement si Firebase n'est pas disponible
        data.matches.forEach((match) => {
          const predictions = {};
          state.participants.forEach((participant) => {
            predictions[participant.id] = { home: "", away: "", firstGoal: "" };
          });

          const newMatch = {
            id: crypto.randomUUID(),
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            date: match.date,
            stage: match.stage || "Fase de grupos",
            group: match.group || null,
            actualScore: { home: null, away: null, firstGoalTeam: null },
            predictions,
          };
          
          state.matches.push(newMatch);
        });
        
        fileInput.value = "";
        saveAndRender();
        alert(`¡${data.matches.length} partido(s) importado(s) localmente!\n\n⚠️ Firebase no está disponible. Los participantes no verán estos partidos.`);
      }
    } catch (error) {
      console.error("❌ Error durante el import:", error);
      alert(`❌ Error al importar los partidos.\n\nError: ${error.message}`);
      fileInput.value = "";
    }
  };

  reader.readAsText(file);
    });
  }

  // Supprimer tous les matchs (local + Firebase + localStorage)
  if (deleteAllMatchesBtn) {
    deleteAllMatchesBtn.addEventListener("click", async () => {
  if (state.matches.length === 0) {
    alert("⚠️ No hay partidos para eliminar.");
    return;
  }

  const confirmMessage =
    `⚠️ ¿Estás seguro de que deseas eliminar TODOS los partidos?\n\n` +
    `Esta acción:\n` +
    `• Eliminará ${state.matches.length} partido(s) del administrador\n` +
    `• Eliminará todos los partidos de Firebase\n` +
    `• Eliminará TODOS los pronósticos de los participantes\n` +
    `• Limpiará el localStorage del administrador\n` +
    `• Los participantes verán sus listas vaciarse automáticamente\n\n` +
    `⚠️ ESTA ACCIÓN NO SE PUEDE DESHACER`;

  if (!confirm(confirmMessage)) {
    return;
  }

  // Supprimer localement
  state.matches = [];
  state.participants = []; // Aussi réinitialiser les participants locaux
  
  // Nettoyer le localStorage de l'admin
  localStorage.removeItem(STORAGE_KEY);
  console.log("🧹 LocalStorage del administrador limpiado");
  
  saveAndRender();

  // Supprimer de Firebase si disponible
  if (typeof firebase !== 'undefined' && firebase.database) {
    try {
      const db = firebase.database();
      const matchesRef = db.ref('matches');
      const participantsRef = db.ref('participants');
      
      // Supprimer tous les matchs
      await matchesRef.remove();
      console.log("✅ Todos los partidos eliminados de Firebase");
      
      // Supprimer tous les pronostics des participants
      await participantsRef.remove();
      console.log("✅ Todos los pronósticos eliminados de Firebase");
      
      alert(
        `✅ ¡Todos los partidos han sido eliminados!\n\n` +
        `• Eliminados del administrador\n` +
        `• Eliminados de Firebase\n` +
        `• Pronósticos de participantes eliminados\n` +
        `• LocalStorage limpiado\n` +
        `• Los participantes verán la actualización automáticamente`
      );
    } catch (error) {
      console.error("❌ Error al eliminar de Firebase:", error);
      alert(
        `⚠️ Partidos eliminados localmente, pero hubo un error con Firebase.\n\n` +
        `Los participantes podrían seguir viendo los partidos.\n\n` +
        `Error: ${error.message}`
      );
    }
  } else {
    alert(
      `✅ Partidos eliminados localmente.\n\n` +
      `⚠️ Firebase no está disponible. Los participantes no verán esta actualización automáticamente.`
    );
  }
    });
  }
}

function switchView(view) {
  const isAdmin = view === "admin";
  adminView.classList.toggle("active", isAdmin);
  publicView.classList.toggle("active", !isAdmin);

  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
}

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

// Grouper les matchs par journée selon leur phase
// Phase de groupes: 3 journées de 24 matchs
// 16èmes de finale: 1 journée de 16 matchs
// 8èmes de finale: 1 journée de 8 matchs
// Quarts de finale: 1 journée de 4 matchs
// Demi-finales: 1 journée de 2 matchs
// Finales: 1 journée de 2 matchs (petite finale + finale)
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
    // Vérifier s'il reste assez de matchs pour cette journée
    if (currentIndex >= worldCupMatches.length) {
      break; // Plus de matchs disponibles, arrêter
    }
    
    const dayMatches = worldCupMatches.slice(currentIndex, currentIndex + dayDef.count);
    
    // Ajouter seulement si on a des matchs
    if (dayMatches.length > 0) {
      dayGroups.push({
        name: dayDef.name,
        matches: dayMatches,
        stage: dayDef.stage,
        date: dayMatches[0].date,
        isWorldCup: true
      });
      currentIndex += dayMatches.length; // Avancer du nombre réel de matchs ajoutés
    }
  }
  
  // Ajouter les matchs manuels comme un groupe séparé à la fin
  if (manualMatches.length > 0) {
    // Trier les matchs manuels par date croissante
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

// Vérifier si une journée est verrouillée (24h avant le premier match)
function isDayLocked(dayMatches) {
  if (!dayMatches || dayMatches.length === 0) return false;
  
  // Trouver le premier match de la journée
  const firstMatch = dayMatches.reduce((earliest, match) => {
    const matchDate = new Date(match.date);
    const earliestDate = new Date(earliest.date);
    return matchDate < earliestDate ? match : earliest;
  });
  
  const firstMatchDate = new Date(firstMatch.date);
  const now = new Date();
  const deadline = new Date(firstMatchDate.getTime() - (24 * 60 * 60 * 1000)); // 24h avant
  
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

  // Points pour le score uniquement (pas de bonus pour le premier but)
  if (predictedHome === actualHome && predictedAway === actualAway) {
    return 3; // Score exact
  }

  if (getOutcome(predictedHome, predictedAway) === getOutcome(actualHome, actualAway)) {
    return 1; // Résultat correct
  }

  return 0;
}

// Vérifier si le pronostic du premier but est correct
function isFirstGoalCorrect(prediction, actualScore) {
  const predictedHome = toNumber(prediction.home);
  const predictedAway = toNumber(prediction.away);
  const actualHome = toNumber(actualScore.home);
  const actualAway = toNumber(actualScore.away);

  // Si le score réel n'est pas encore défini, retourner false
  if (actualHome === null || actualAway === null) {
    return false;
  }

  // Cas spécial : match nul 0-0
  // Si pronostic 0-0 sans premier but ET résultat 0-0, c'est correct
  if (predictedHome === 0 && predictedAway === 0 &&
      actualHome === 0 && actualAway === 0 &&
      (!prediction.firstGoal || prediction.firstGoal === "")) {
    return true;
  }

  // Si le premier but n'est pas renseigné dans le pronostic ou le résultat réel
  if (!prediction.firstGoal || !actualScore.firstGoalTeam) {
    return false;
  }

  // Vérifier si le pronostic du premier but correspond au résultat réel
  return prediction.firstGoal === actualScore.firstGoalTeam;
}

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

      // Compter les pronostics corrects du premier but
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

function saveAndRender() {
  // Nettoyer les pronostics orphelins avant de sauvegarder
  state = cleanOrphanPredictions(state);
  persistState(state);
  render();
}

function deleteParticipant(participantId) {
  if (!confirm("¿Estás seguro de que deseas eliminar este participante? Todos sus pronósticos también serán eliminados.")) {
    return;
  }

  // Trouver le nom du participant pour Firebase
  const participant = state.participants.find((p) => p.id === participantId);
  const participantName = participant ? participant.name : null;

  // Supprimer le participant de la liste
  state.participants = state.participants.filter((p) => p.id !== participantId);

  // Supprimer tous les pronostics de ce participant
  state.matches.forEach((match) => {
    delete match.predictions[participantId];
  });

  // Supprimer de Firebase si disponible
  if (participantName && typeof firebase !== 'undefined' && firebase.database) {
    try {
      const db = firebase.database();
      // Normaliser l'ID Firebase de la même manière que dans participant.js
      const participantFirebaseId = participantName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-");
      
      db.ref('participants/' + participantFirebaseId).remove()
        .then(() => {
          console.log(`✅ Participante ${participantName} eliminado de Firebase`);
        })
        .catch((error) => {
          console.error("❌ Error al eliminar de Firebase:", error);
        });
    } catch (error) {
      console.error("❌ Error en deleteParticipant Firebase:", error);
    }
  }

  saveAndRender();
}

// Modifier les noms d'équipes d'un match de phase finale
async function editMatchTeams(match) {
  const newHomeTeam = prompt(
    `Modificar equipo local\n\nActual: ${match.homeTeam}\n\nIngresa el nuevo nombre del equipo local:`,
    match.homeTeam
  );
  
  if (newHomeTeam === null) return; // Annulé
  
  const newAwayTeam = prompt(
    `Modificar equipo visitante\n\nActual: ${match.awayTeam}\n\nIngresa el nuevo nombre del equipo visitante:`,
    match.awayTeam
  );
  
  if (newAwayTeam === null) return; // Annulé
  
  // Vérifier que les noms ne sont pas vides
  if (!newHomeTeam.trim() || !newAwayTeam.trim()) {
    alert("⚠️ Los nombres de los equipos no pueden estar vacíos.");
    return;
  }
  
  // Confirmer la modification
  const confirmMessage =
    `¿Confirmas la modificación?\n\n` +
    `Antes: ${match.homeTeam} vs ${match.awayTeam}\n` +
    `Después: ${newHomeTeam.trim()} vs ${newAwayTeam.trim()}\n\n` +
    `Esta modificación se sincronizará automáticamente con los participantes.`;
  
  if (!confirm(confirmMessage)) return;
  
  // Mettre à jour localement
  const oldHomeTeam = match.homeTeam;
  const oldAwayTeam = match.awayTeam;
  match.homeTeam = newHomeTeam.trim();
  match.awayTeam = newAwayTeam.trim();
  
  saveAndRender();
  
  // Mettre à jour dans Firebase
  if (typeof firebase !== 'undefined' && firebase.database) {
    try {
      const db = firebase.database();
      const matchesRef = db.ref('matches');
      
      // Trouver le match dans Firebase et le mettre à jour
      const snapshot = await matchesRef.once('value');
      const firebaseMatches = snapshot.val();
      
      if (firebaseMatches) {
        // Chercher le match correspondant dans Firebase
        for (const [firebaseId, firebaseMatch] of Object.entries(firebaseMatches)) {
          if (firebaseMatch.homeTeam === oldHomeTeam &&
              firebaseMatch.awayTeam === oldAwayTeam &&
              firebaseMatch.date === match.date) {
            // Mettre à jour ce match
            await matchesRef.child(firebaseId).update({
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              updatedAt: new Date().toISOString()
            });
            
            console.log(`✅ Partido actualizado en Firebase: ${match.homeTeam} vs ${match.awayTeam}`);
            alert(
              `✅ ¡Equipos actualizados con éxito!\n\n` +
              `${match.homeTeam} vs ${match.awayTeam}\n\n` +
              `Los participantes verán la actualización automáticamente.`
            );
            return;
          }
        }
      }
      
      alert(
        `⚠️ Equipos actualizados localmente, pero no se encontró el partido en Firebase.\n\n` +
        `Los participantes podrían no ver la actualización.`
      );
      
    } catch (error) {
      console.error("❌ Error al actualizar en Firebase:", error);
      alert(
        `⚠️ Equipos actualizados localmente, pero hubo un error con Firebase.\n\n` +
        `Los participantes podrían no ver la actualización.\n\n` +
        `Error: ${error.message}`
      );
    }
  } else {
    alert(
      `✅ Equipos actualizados localmente.\n\n` +
      `⚠️ Firebase no está disponible. Los participantes no verán la actualización automáticamente.`
    );
  }
}

async function deleteMatch(matchId) {
  if (!confirm("¿Estás seguro de que deseas eliminar este partido? Todos los pronósticos asociados también serán eliminados.")) {
    return;
  }

  // Supprimer le match de la liste locale
  state.matches = state.matches.filter((m) => m.id !== matchId);

  // Supprimer de Firebase si disponible
  if (typeof firebase !== 'undefined' && firebase.database) {
    try {
      const db = firebase.database();
      await db.ref('matches/' + matchId).remove();
      console.log(`✅ Partido ${matchId} eliminado de Firebase`);
    } catch (error) {
      console.error("❌ Error al eliminar partido de Firebase:", error);
      alert(`⚠️ El partido fue eliminado localmente pero hubo un error con Firebase.\n\nError: ${error.message}`);
    }
  }

  saveAndRender();
}

function renderParticipants() {
  participantsList.innerHTML = "";

  // Filtrer les participants pour n'afficher que ceux qui ont envoyé des pronostics via Firebase
  const validParticipants = state.participants.filter(participant =>
    firebaseParticipants.has(participant.name.toLowerCase())
  );

  if (!validParticipants.length) {
    participantsList.innerHTML = '<li style="color: #666; font-style: italic;">Ningún participante ha enviado pronósticos todavía</li>';
    return;
  }

  validParticipants.forEach((participant) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${participant.name}</span>
      <button class="delete-btn" data-id="${participant.id}" title="Supprimer ${participant.name}">×</button>
    `;
    
    const deleteBtn = li.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", () => deleteParticipant(participant.id));
    
    participantsList.appendChild(li);
  });
}

function renderAdminMatches() {
  adminMatches.innerHTML = "";

  // Grouper les matchs par journée (sépare automatiquement manuels et Coupe du Monde)
  const dayGroups = groupMatchesByDay(state.matches);
  
  // Si aucun match du tout (ni Coupe du Monde, ni manuels)
  if (!state.matches.length) {
    adminMatches.innerHTML = '<p class="empty-state">Ningún partido registrado.</p>';
    return;
  }

  // Vérifier s'il y a des matchs de la Coupe du Monde
  const hasWorldCupMatches = dayGroups.some(group => group.isWorldCup);
  
  // Afficher le titre principal seulement s'il y a des matchs de la Coupe du Monde
  if (hasWorldCupMatches) {
    const mainTitle = document.createElement("div");
    mainTitle.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      text-align: center;
    `;
    
    // Compter uniquement les matchs de la Coupe du Monde
    const worldCupMatchCount = state.matches.filter(m => m.stage !== "Partido manual" && !m.addedManually).length;
    const titleText = worldCupMatchCount > 72 ? "COPA DEL MUNDO FIFA 2026" : "FASE DE GRUPOS";
    const subtitleText = worldCupMatchCount > 72
      ? `48 equipos - 12 grupos de 4 equipos + fase final - ${worldCupMatchCount} partidos`
      : "48 equipos - 12 grupos de 4 equipos - 72 partidos";
    
    mainTitle.innerHTML = `
      <h2 style="margin: 0; font-size: 1.8rem;">⚽ ${titleText}</h2>
      <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">${subtitleText}</p>
    `;
    adminMatches.appendChild(mainTitle);
  }
  
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
    
    // Ajouter un bouton WhatsApp dans l'en-tête
    const whatsappBtn = document.createElement("button");
    whatsappBtn.textContent = "📱 Copiar resumen WhatsApp";
    whatsappBtn.style.cssText = `
      margin-top: 1rem;
      padding: 0.75rem 1.5rem;
      background: #25D366;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
      font-size: 0.95rem;
    `;
    whatsappBtn.addEventListener("click", () => copyWhatsAppSummary(dayIndex));
    dayHeader.appendChild(whatsappBtn);
    
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
          ⚠️ JORNADA CERRADA - Los pronósticos para esta jornada ya no pueden ser modificados
        </p>
        <p style="margin: 0.5rem 0 0 0; color: #7f1d1d; font-size: 0.9rem;">
          La fecha límite era: ${formatDate(deadline.toISOString())}
        </p>
      `;
    } else {
      warningBox.innerHTML = `
        <p style="margin: 0; color: #1e40af; font-weight: bold;">
          ⏰ Fecha límite para enviar pronósticos de esta jornada:
        </p>
        <p style="margin: 0.5rem 0 0 0; color: #1e3a8a; font-size: 0.95rem;">
          ${formatDate(deadline.toISOString())}
        </p>
        <p style="margin: 0.5rem 0 0 0; color: #1e3a8a; font-size: 0.85rem; font-style: italic;">
          (24 horas antes del primer partido de la jornada)
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
      const fragment = adminTemplate.content.cloneNode(true);
      
      const matchTitleElement = fragment.querySelector(".match-title");
      matchTitleElement.textContent = `${match.homeTeam} - ${match.awayTeam}`;
      
      // Ajouter un bouton pour modifier les équipes si c'est un match de phase finale
      const isPlayoffMatch = match.stage && (
        match.stage.includes("Dieciseisavos") ||
        match.stage.includes("Octavos") ||
        match.stage.includes("Cuartos") ||
        match.stage.includes("Semifinales") ||
        match.stage.includes("Finales")
      );
      
      if (isPlayoffMatch) {
        const editTeamsBtn = document.createElement("button");
        editTeamsBtn.textContent = "✏️ Modificar equipos";
        editTeamsBtn.style.cssText = `
          margin-left: 1rem;
          padding: 0.3rem 0.8rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.85rem;
        `;
        editTeamsBtn.addEventListener("click", () => editMatchTeams(match));
        matchTitleElement.appendChild(editTeamsBtn);
      }
      
      fragment.querySelector(".match-date").textContent = formatDate(match.date);

      // Ajouter l'événement de suppression
      const deleteBtn = fragment.querySelector(".delete-match-btn");
      deleteBtn.addEventListener("click", () => deleteMatch(match.id));

      const actualHomeInput = fragment.querySelector(".actual-home");
      const actualAwayInput = fragment.querySelector(".actual-away");
      const actualFirstGoalSelect = fragment.querySelector(".actual-first-goal");
      actualHomeInput.value = match.actualScore.home ?? "";
      actualAwayInput.value = match.actualScore.away ?? "";
      actualFirstGoalSelect.value = match.actualScore.firstGoalTeam ?? "";

      fragment.querySelector(".save-result").addEventListener("click", async () => {
        match.actualScore.home = actualHomeInput.value === "" ? null : Number(actualHomeInput.value);
        match.actualScore.away = actualAwayInput.value === "" ? null : Number(actualAwayInput.value);
        match.actualScore.firstGoalTeam = actualFirstGoalSelect.value === "" ? null : actualFirstGoalSelect.value;
        
        // Sauvegarder localement
        saveAndRender();
        
        // Sauvegarder dans Firebase si disponible
        if (typeof firebase !== 'undefined' && firebase.database) {
          try {
            const db = firebase.database();
            const matchRef = db.ref('matches/' + match.id);
            
            // Mettre à jour le résultat réel dans Firebase
            await matchRef.update({
              actualScore: {
                home: match.actualScore.home,
                away: match.actualScore.away,
                firstGoalTeam: match.actualScore.firstGoalTeam
              },
              updatedAt: new Date().toISOString()
            });
            
            console.log("✅ Resultado guardado en Firebase:", match.id);
          } catch (error) {
            console.error("❌ Error al guardar resultado en Firebase:", error);
            alert("⚠️ El resultado se guardó localmente pero no se pudo sincronizar con Firebase.\n\nError: " + error.message);
          }
        }
      });

      const predictionsTable = fragment.querySelector(".predictions-table");
      const grid = document.createElement("div");
      grid.className = "predictions-grid";

      // Filtrer uniquement les participants qui existent encore
      const validParticipants = state.participants.filter(p => p && p.id && p.name);
      
      validParticipants.forEach((participant) => {
        const row = document.createElement("div");
        row.className = "prediction-row";
        const prediction = match.predictions[participant.id] || { home: "", away: "", firstGoal: "" };
        const points = computePredictionPoints(prediction, match.actualScore);
        
        // Vérifier si ce participant a envoyé ses pronostics via Firebase
        const isFromFirebase = firebaseParticipants.has(participant.name.toLowerCase());
        const isDisabled = isFromFirebase ? "disabled" : "";
        const disabledStyle = isFromFirebase ? "opacity: 0.6; cursor: not-allowed;" : "";
        
        // Vérifier si on doit masquer les pronostics (avant le freeze)
        const showPredictions = isLocked;
        
        // Afficher les valeurs ou un cadenas selon le freeze
        const homeValue = showPredictions ? prediction.home : (prediction.home !== "" ? "🔒" : "");
        const awayValue = showPredictions ? prediction.away : (prediction.away !== "" ? "🔒" : "");
        const firstGoalDisplay = showPredictions ?
          (prediction.firstGoal === "home" ? "Local" : prediction.firstGoal === "away" ? "Visitante" : "-") :
          (prediction.firstGoal ? "🔒" : "-");

        row.innerHTML = `
          <div>
            <strong>${participant.name}</strong>
            ${isFromFirebase ? '<span class="small-text" style="color: #10b981;">✓ Enviado por el participante</span>' : '<span class="small-text">Puntuación: 3 marcador exacto / 1 resultado correcto (primer gol = contador aparte)</span>'}
          </div>
          <label style="${disabledStyle}">
            Local
            ${showPredictions ?
              `<input type="number" min="0" value="${prediction.home}" data-side="home" ${isDisabled} />` :
              `<input type="text" value="${homeValue}" disabled style="text-align: center;" />`
            }
          </label>
          <label style="${disabledStyle}">
            Visitante
            ${showPredictions ?
              `<input type="number" min="0" value="${prediction.away}" data-side="away" ${isDisabled} />` :
              `<input type="text" value="${awayValue}" disabled style="text-align: center;" />`
            }
          </label>
          <label style="${disabledStyle}">
            Primer gol
            ${showPredictions ?
              `<select data-side="firstGoal" ${isDisabled}>
                <option value="">-</option>
                <option value="home" ${prediction.firstGoal === "home" ? "selected" : ""}>Local</option>
                <option value="away" ${prediction.firstGoal === "away" ? "selected" : ""}>Visitante</option>
              </select>` :
              `<input type="text" value="${firstGoalDisplay}" disabled style="text-align: center;" />`
            }
          </label>
          <div>
            <span class="${match.actualScore.home === null ? "status-pending" : "status-success"}">
              ${match.actualScore.home === null ? "Pendiente" : (showPredictions ? `${points} punto(s)` : "🔒")}
            </span>
          </div>
        `;

        // Ne pas ajouter d'événements si les pronostics viennent de Firebase OU si on est avant le freeze
        if (!isFromFirebase && showPredictions) {
          const inputs = row.querySelectorAll("input[type='number']");
          inputs.forEach((input) => {
            input.addEventListener("change", () => {
              const target = match.predictions[participant.id] || { home: "", away: "", firstGoal: "" };
              target[input.dataset.side] = input.value === "" ? "" : Number(input.value);
              match.predictions[participant.id] = target;
              saveAndRender();
            });
          });

          const selects = row.querySelectorAll("select");
          selects.forEach((select) => {
            select.addEventListener("change", () => {
              const target = match.predictions[participant.id] || { home: "", away: "", firstGoal: "" };
              target[select.dataset.side] = select.value;
              match.predictions[participant.id] = target;
              saveAndRender();
            });
          });
        }

        grid.appendChild(row);
      });

      predictionsTable.appendChild(grid);
      matchesContainer.appendChild(fragment);
    });
    
    daySection.appendChild(matchesContainer);
    adminMatches.appendChild(daySection);
  });
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

// Générer un récapitulatif WhatsApp pour une journée
function generateWhatsAppSummary(dayIndex = 0) {
  console.log("🔍 generateWhatsAppSummary appelée avec dayIndex:", dayIndex);
  console.log("📊 state.matches:", state.matches.length, "matchs");
  
  const dayGroups = groupMatchesByDay(state.matches);
  console.log("📅 dayGroups:", dayGroups.length, "journées");
  
  if (dayIndex >= dayGroups.length) {
    console.error("❌ dayIndex", dayIndex, ">=", dayGroups.length);
    alert("❌ Journée invalide");
    return null;
  }
  
  const dayGroup = dayGroups[dayIndex];
  const ranking = getRanking();
  
  let text = "⚽ COPA DEL MUNDO 2026 ⚽\n";
  text += `📅 ${dayGroup.name}\n\n`;
  text += "━━━━━━━━━━━━━━━━━━━━━\n";
  text += "🏆 CLASIFICACIÓN GENERAL\n";
  text += "━━━━━━━━━━━━━━━━━━━━━\n\n";
  
  // Top 3 avec podium
  ranking.slice(0, 3).forEach((participant, index) => {
    const medals = ["🥇", "🥈", "🥉"];
    text += `${medals[index]} ${index + 1}. ${participant.name} - ${participant.totalPoints} pts\n`;
    text += `   📊 ${participant.exactScores} exactos | ⚽ ${participant.correctFirstGoals} primeros goles\n\n`;
  });
  
  // Reste du classement
  if (ranking.length > 3) {
    ranking.slice(3).forEach((participant, index) => {
      text += `${index + 4}. ${participant.name} - ${participant.totalPoints} pts\n`;
      text += `   📊 ${participant.exactScores} exactos | ⚽ ${participant.correctFirstGoals} primeros goles\n\n`;
    });
  }
  
  text += "━━━━━━━━━━━━━━━━━━━━━\n";
  text += "⚽ PARTIDOS DE LA JORNADA\n";
  text += "━━━━━━━━━━━━━━━━━━━━━\n\n";
  
  // Matchs de la journée (seulement ceux avec résultat)
  dayGroup.matches.forEach((match) => {
    const actualScore = match.actualScore;
    const hasResult = actualScore.home !== null && actualScore.away !== null;
    
    // Ne pas afficher les matchs en attente
    if (!hasResult) return;
    
    // Formater la date au format jj/mois
    const matchDate = new Date(match.date);
    const day = matchDate.getDate();
    const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const month = monthNames[matchDate.getMonth()];
    const dateStr = `${day}/${month}`;
    
    // Noms des équipes et scores en gras
    text += `${dateStr} - *${match.homeTeam}* *${actualScore.home}-${actualScore.away}* *${match.awayTeam}*\n`;
    
    // Afficher le premier but si défini
    if (actualScore.firstGoalTeam) {
      const firstGoalTeam = actualScore.firstGoalTeam === "home" ? match.homeTeam : match.awayTeam;
      text += `Primer gol: *${firstGoalTeam}* ⚽\n\n`;
    } else {
      text += "\n";
    }
    
    // Pronostics de chaque participant
    state.participants.forEach((participant) => {
      const prediction = match.predictions[participant.id] || { home: "", away: "", firstGoal: "" };
      const points = computePredictionPoints(prediction, actualScore);
      const firstGoalCorrect = isFirstGoalCorrect(prediction, actualScore);
      
      let status = "";
      if (points === 3) status = "✅";
      else if (points === 1) status = "⚠️";
      else status = "❌";
      
      const firstGoalStatus = firstGoalCorrect ? "✅" : "❌";
      const firstGoalText = prediction.firstGoal ?
        (prediction.firstGoal === "home" ? match.homeTeam : match.awayTeam) :
        "-";
      
      text += `   _${participant.name}: ${prediction.home}-${prediction.away} ${status} (${points}pts) | 1er gol: ${firstGoalText} ${firstGoalStatus}_\n`;
    });
    
    text += "\n";
  });
  
  text += "━━━━━━━━━━━━━━━━━━━━━\n";
  text += "Leyenda:\n";
  text += "✅ = Correcto | ❌ = Incorrecto | ⚠️ = Resultado correcto (1pt)\n";
  text += "📊 = Marcadores exactos | ⚽ = Primeros goles correctos\n";
  
  return text;
}

// Copier le récapitulatif WhatsApp dans le presse-papiers
function copyWhatsAppSummary(dayIndex = 0) {
  console.log("🔍 copyWhatsAppSummary appelée avec dayIndex:", dayIndex);
  
  const text = generateWhatsAppSummary(dayIndex);
  console.log("📝 Texte généré:", text ? "OK (" + text.length + " caractères)" : "VIDE");
  
  if (!text) {
    console.error("❌ Pas de texte généré");
    return;
  }
  
  // Copier dans le presse-papiers
  navigator.clipboard.writeText(text).then(() => {
    alert("✅ ¡Resumen copiado al portapapeles!\n\nPuedes pegarlo directamente en WhatsApp.");
  }).catch((err) => {
    // Fallback si clipboard API ne fonctionne pas
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand("copy");
      alert("✅ ¡Resumen copiado al portapapeles!\n\nPuedes pegarlo directamente en WhatsApp.");
    } catch (err) {
      alert("❌ Error al copiar. Por favor, copia manualmente:\n\n" + text);
    }
    
    document.body.removeChild(textarea);
  });
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
    <h2 style="margin: 0; font-size: 1.8rem;">⚽ FASE DE GRUPOS</h2>
    <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">48 equipos - 12 grupos de 4 equipos - 72 partidos</p>
  `;
  publicMatches.appendChild(mainTitle);

  // Grouper les matchs par journée
  const dayGroups = groupMatchesByDay(state.matches);
  
  dayGroups.forEach((dayGroup, dayIndex) => {
    const dayName = dayGroup.name || `JORNADA ${dayIndex + 1}`;
    const dayNumber = dayIndex + 1;
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
  // Sur la page de consultation, afficher uniquement la vue publique
  if (isConsultaPage) {
    renderRanking();
    renderPublicMatches();
    return;
  }
  
  // Sur la page admin, afficher tout
  renderParticipants();
  renderAdminMatches();
  renderRanking();
  renderPublicMatches();
}

// Écouter les mises à jour Firebase en temps réel
function listenToFirebaseUpdates() {
  // Vérifier que Firebase est initialisé
  if (typeof firebase === 'undefined' || !firebase.database) {
    console.warn("⚠️ Firebase no está disponible - modo sin conexión");
    return;
  }
  
  try {
    const db = firebase.database();
    const participantsRef = db.ref('participants');
    const matchesRef = db.ref('matches');
    
    console.log("🔄 Escuchando actualizaciones de Firebase...");
    
    // Écouter les matchs depuis Firebase
    matchesRef.on('value', (snapshot) => {
      const firebaseMatches = snapshot.val();
      
      if (!firebaseMatches) {
        console.log("ℹ️ No hay partidos en Firebase todavía");
        // Si Firebase est vide mais qu'on a des matchs locaux, ne rien faire
        // (permet de garder les matchs importés localement en attendant la sync)
        return;
      }
      
      // Convertir l'objet Firebase en tableau en utilisant les IDs Firebase
      const matchesArray = Object.entries(firebaseMatches).map(([firebaseId, matchData]) => {
        // Chercher le match existant pour préserver les prédictions
        const existingMatch = state.matches.find(m => m.id === firebaseId);
        
        return {
          id: firebaseId, // Utiliser l'ID Firebase au lieu de générer un nouveau
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
          // Préserver les prédictions existantes ou initialiser à vide
          predictions: existingMatch?.predictions || {}
        };
      });
      
      // Initialiser les prédictions UNIQUEMENT pour les nouveaux participants ou nouveaux matchs
      state.participants.forEach(participant => {
        matchesArray.forEach(match => {
          if (!match.predictions[participant.id]) {
            match.predictions[participant.id] = { home: "", away: "", firstGoal: "" };
          }
        });
      });
      
      // Mettre à jour les matchs dans l'état
      state.matches = matchesArray;
      
      console.log(`✅ ${matchesArray.length} partidos cargados desde Firebase`);
      
      // Nettoyer les pronostics orphelins APRÈS le chargement des matchs
      state = cleanOrphanPredictions(state);
      
      // Sauvegarder et rafraîchir l'affichage
      persistState(state);
      render();
    });
    
    // Écouter les changements en temps réel
    participantsRef.on('value', (snapshot) => {
      const firebaseData = snapshot.val();
      
      if (!firebaseData) {
        console.log("ℹ️ No hay datos en Firebase todavía");
        // Réinitialiser la liste des participants Firebase
        firebaseParticipants.clear();
        render();
        return;
      }
      
      console.log("📥 Datos recibidos de Firebase:", Object.keys(firebaseData).length, "participantes");
      
      // Réinitialiser et mettre à jour la liste des participants qui ont envoyé des pronostics
      firebaseParticipants.clear();
      
      // Mettre à jour les prédictions pour chaque participant Firebase
      Object.values(firebaseData).forEach(participantData => {
        const participantName = participantData.participantName;
        
        // Ajouter ce participant à la liste des participants Firebase (qui ont envoyé des pronostics)
        firebaseParticipants.add(participantName.toLowerCase());
        
        // Trouver ou créer le participant dans l'application admin
        let participant = state.participants.find(p =>
          p.name.toLowerCase() === participantName.toLowerCase()
        );
        
        if (!participant) {
          // Créer automatiquement le participant s'il n'existe pas
          participant = {
            id: crypto.randomUUID(),
            name: participantName
          };
          state.participants.push(participant);
          console.log(`✅ Nuevo participante agregado automáticamente: ${participantName}`);
        }
        
        // Mettre à jour les prédictions
        participantData.predictions.forEach((predictionData, index) => {
          if (state.matches[index]) {
            // Migration automatique : ajouter firstGoal si manquant
            const prediction = predictionData.prediction;
            if (prediction && !prediction.hasOwnProperty('firstGoal')) {
              prediction.firstGoal = "";
            }
            state.matches[index].predictions[participant.id] = prediction;
          }
        });
      });
      
      console.log(`📋 Participantes con pronósticos enviados: ${firebaseParticipants.size}`);
      
      // Nettoyer les pronostics orphelins APRÈS la synchronisation Firebase
      state = cleanOrphanPredictions(state);
      
      // Sauvegarder et rafraîchir l'affichage
      persistState(state);
      render();
      
      console.log("✅ Pronósticos sincronizados desde Firebase");
    });
    
  } catch (error) {
    console.error("❌ Error al configurar Firebase:", error);
  }
}

render();

// Démarrer l'écoute Firebase après le premier rendu
listenToFirebaseUpdates();

// Made with Bob
