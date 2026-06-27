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

// Vérifier si une journée est verrouillée (24h avant le premier match + décalage éventuel)
function isDayLocked(dayMatches, dayIndex = null) {
  if (!dayMatches || dayMatches.length === 0) return false;
  
  // Trouver le premier match de la journée
  const firstMatch = dayMatches.reduce((earliest, match) => {
    const matchDate = new Date(match.date);
    const earliestDate = new Date(earliest.date);
    return matchDate < earliestDate ? match : earliest;
  });
  
  const firstMatchDate = new Date(firstMatch.date);
  const now = new Date();
  
  // Deadline de base: 24h avant le premier match
  let deadline = new Date(firstMatchDate.getTime() - (24 * 60 * 60 * 1000));
  
  // Appliquer le décalage si disponible (chargé de manière synchrone depuis le cache)
  if (dayIndex !== null && window.freezeDelaysCache && window.freezeDelaysCache[`day${dayIndex + 1}`]) {
    const delayHours = window.freezeDelaysCache[`day${dayIndex + 1}`].hours || 0;
    deadline = new Date(deadline.getTime() + (delayHours * 60 * 60 * 1000));
    console.log(`⏰ [app.js isDayLocked] Décalage appliqué pour day${dayIndex + 1}: +${delayHours}h`);
  }
  
  return now >= deadline;
}

// Charger les décalages de freeze depuis Firebase (appelé au démarrage)
async function loadFreezeDelays() {
  try {
    if (typeof firebase !== 'undefined' && firebase.database) {
      const delaysSnapshot = await database.ref('freezeDelays').once('value');
      if (delaysSnapshot.exists()) {
        window.freezeDelaysCache = delaysSnapshot.val();
        console.log('✅ Décalages de freeze chargés:', window.freezeDelaysCache);
      } else {
        window.freezeDelaysCache = {};
      }
    }
  } catch (error) {
    console.error('❌ Erreur chargement décalages freeze:', error);
    window.freezeDelaysCache = {};
  }
}

// Décaler l'heure de freeze d'une journée (sans modifier les dates des matchs)
async function delayFreeze(dayIndex) {
  const dayGroups = groupMatchesByDay(state.matches);
  
  if (dayIndex >= dayGroups.length) {
    alert("❌ Journée invalide");
    return;
  }
  
  const dayGroup = dayGroups[dayIndex];
  const dayName = dayGroup.name || `JORNADA ${dayIndex + 1}`;
  
  // Note: On permet la configuration même si la journée est verrouillée
  // car le verrouillage peut être dû à l'absence de freeze delay configuré
  
  // Récupérer le décalage actuel depuis Firebase
  let currentDelayHours = 0;
  try {
    if (typeof firebase !== 'undefined' && firebase.database) {
      const delaySnapshot = await database.ref(`freezeDelays/day${dayIndex + 1}`).once('value');
      if (delaySnapshot.exists()) {
        currentDelayHours = delaySnapshot.val().hours || 0;
      }
    }
  } catch (error) {
    console.error("Erreur lecture décalage:", error);
  }
  
  // Demander le nombre d'heures de décalage SUPPLÉMENTAIRE
  const hoursInput = prompt(
    `⏰ Décaler le freeze de la ${dayName}\n\n` +
    `Décalage actuel: ${currentDelayHours > 0 ? '+' : ''}${currentDelayHours}h\n\n` +
    `Entrez le nombre d'heures SUPPLÉMENTAIRES à ajouter:\n\n` +
    `Exemples:\n` +
    `• 1 = ajouter 1 heure de plus\n` +
    `• 2 = ajouter 2 heures de plus\n` +
    `• -1 = retirer 1 heure`,
    "1"
  );
  
  if (hoursInput === null) return; // Annulé
  
  const additionalHours = parseFloat(hoursInput);
  if (isNaN(additionalHours)) {
    alert("❌ Nombre d'heures invalide");
    return;
  }
  
  const newTotalDelayHours = currentDelayHours + additionalHours;
  
  // Confirmer l'action
  const firstMatchDate = new Date(dayGroup.matches[0].date);
  const baseDeadline = new Date(firstMatchDate.getTime() - (24 * 60 * 60 * 1000));
  const currentDeadline = new Date(baseDeadline.getTime() + (currentDelayHours * 60 * 60 * 1000));
  const newDeadline = new Date(baseDeadline.getTime() + (newTotalDelayHours * 60 * 60 * 1000));
  
  // Formater les heures pour France et Colombie
  const formatTimeForTimezone = (date, timezone, label) => {
    return `${label}: ${date.toLocaleString('fr-FR', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })}`;
  };
  
  const currentFrance = formatTimeForTimezone(currentDeadline, 'Europe/Paris', '🇫🇷 France');
  const currentColombia = formatTimeForTimezone(currentDeadline, 'America/Bogota', '🇨🇴 Colombie');
  const newFrance = formatTimeForTimezone(newDeadline, 'Europe/Paris', '🇫🇷 France');
  const newColombia = formatTimeForTimezone(newDeadline, 'America/Bogota', '🇨🇴 Colombie');
  
  const confirm = window.confirm(
    `⏰ Confirmer le décalage du freeze?\n\n` +
    `Journée: ${dayName}\n` +
    `Premier match: ${formatDate(firstMatchDate.toISOString())} (INCHANGÉ)\n\n` +
    `📍 FREEZE ACTUEL:\n` +
    `${currentFrance}\n` +
    `${currentColombia}\n\n` +
    `📍 NOUVEAU FREEZE:\n` +
    `${newFrance}\n` +
    `${newColombia}\n\n` +
    `Décalage: ${newTotalDelayHours > 0 ? '+' : ''}${newTotalDelayHours}h par rapport aux 24h standard`
  );
  
  if (!confirm) return;
  
  try {
    // Sauvegarder le décalage dans Firebase (PAS les dates des matchs!)
    if (typeof firebase !== 'undefined' && firebase.database) {
      await database.ref(`freezeDelays/day${dayIndex + 1}`).set({
        hours: newTotalDelayHours,
        dayName: dayName,
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin'
      });
    }
    
    // Recharger l'affichage
    renderAdminMatches();
    
    alert(
      `✅ Freeze décalé avec succès!\n\n` +
      `${dayName}\n` +
      `Nouvelle deadline: ${formatDate(newDeadline.toISOString())}\n\n` +
      `⚠️ IMPORTANT: Les dates des matchs n'ont PAS changé.\n` +
      `Seul le délai de freeze a été ajusté de ${newTotalDelayHours > 0 ? '+' : ''}${newTotalDelayHours}h.`
    );
    
  } catch (error) {
    console.error("❌ Erreur lors du décalage du freeze:", error);
    alert(`❌ Erreur lors du décalage du freeze:\n\n${error.message}`);
  }
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
        const prediction = match.predictions[participant.id];
        // Ignorer les matchs sans prédiction
        if (!prediction) return sum;
        return sum + computePredictionPoints(prediction, match.actualScore);
      }, 0);

      const exactScores = state.matches.filter((match) => {
        const prediction = match.predictions[participant.id];
        // Vérifier que la prédiction existe avant d'accéder à ses propriétés
        return (
          prediction &&
          toNumber(prediction.home) === toNumber(match.actualScore.home) &&
          toNumber(prediction.away) === toNumber(match.actualScore.away) &&
          toNumber(match.actualScore.home) !== null
        );
      }).length;

      // Compter les pronostics corrects du premier but
      const correctFirstGoals = state.matches.filter((match) => {
        const prediction = match.predictions[participant.id];
        // Vérifier que la prédiction existe
        return prediction && isFirstGoalCorrect(prediction, match.actualScore);
      }).length;

      return {
        ...participant,
        totalPoints,
        exactScores,
        correctFirstGoals,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || b.correctFirstGoals - a.correctFirstGoals || b.exactScores - a.exactScores || a.name.localeCompare(b.name));
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

// Modifier les informations d'un match de phase finale (équipes, date et heure)
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
  
  // Demander la nouvelle date et heure
  const currentDate = new Date(match.date);
  const currentDateString = currentDate.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
  
  const newDateString = prompt(
    `Modificar fecha y hora del partido\n\n` +
    `Actual: ${formatDate(match.date)}\n\n` +
    `Ingresa la nueva fecha y hora (formato: YYYY-MM-DDTHH:mm):\n` +
    `Ejemplo: 2026-07-19T21:00`,
    currentDateString
  );
  
  if (newDateString === null) return; // Annulé
  
  // Valider le format de la date
  const newDate = new Date(newDateString);
  if (isNaN(newDate.getTime())) {
    alert("⚠️ Formato de fecha inválido. Usa el formato: YYYY-MM-DDTHH:mm");
    return;
  }
  
  // Confirmer la modification
  const confirmMessage =
    `¿Confirmas la modificación?\n\n` +
    `EQUIPOS:\n` +
    `Antes: ${match.homeTeam} vs ${match.awayTeam}\n` +
    `Después: ${newHomeTeam.trim()} vs ${newAwayTeam.trim()}\n\n` +
    `FECHA Y HORA:\n` +
    `Antes: ${formatDate(match.date)}\n` +
    `Después: ${formatDate(newDate.toISOString())}\n\n` +
    `Esta modificación se sincronizará automáticamente con los participantes.`;
  
  if (!confirm(confirmMessage)) return;
  
  // Mettre à jour localement
  const oldHomeTeam = match.homeTeam;
  const oldAwayTeam = match.awayTeam;
  const oldDate = match.date;
  match.homeTeam = newHomeTeam.trim();
  match.awayTeam = newAwayTeam.trim();
  match.date = newDate.toISOString();
  
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
        // Chercher le match correspondant dans Firebase (utiliser l'ancienne date)
        for (const [firebaseId, firebaseMatch] of Object.entries(firebaseMatches)) {
          if (firebaseMatch.homeTeam === oldHomeTeam &&
              firebaseMatch.awayTeam === oldAwayTeam &&
              firebaseMatch.date === oldDate) {
            // Mettre à jour ce match avec les nouvelles informations
            await matchesRef.child(firebaseId).update({
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              date: match.date,
              updatedAt: new Date().toISOString()
            });
            
            console.log(`✅ Partido actualizado en Firebase: ${match.homeTeam} vs ${match.awayTeam} - ${formatDate(match.date)}`);
            alert(
              `✅ ¡Partido actualizado con éxito!\n\n` +
              `Equipos: ${match.homeTeam} vs ${match.awayTeam}\n` +
              `Fecha: ${formatDate(match.date)}\n\n` +
              `Los participantes verán la actualización automáticamente.`
            );
            return;
          }
        }
      }
      
      alert(
        `⚠️ Partido actualizado localmente, pero no se encontró en Firebase.\n\n` +
        `Los participantes podrían no ver la actualización.`
      );
      
    } catch (error) {
      console.error("❌ Error al actualizar en Firebase:", error);
      alert(
        `⚠️ Partido actualizado localmente, pero hubo un error con Firebase.\n\n` +
        `Los participantes podrían no ver la actualización.\n\n` +
        `Error: ${error.message}`
      );
    }
  } else {
    alert(
      `✅ Partido actualizado localmente.\n\n` +
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
    const isLocked = isDayLocked(dayGroup.matches, dayIndex);
    const firstMatchDate = new Date(dayGroup.matches[0].date);
    let deadline = new Date(firstMatchDate.getTime() - (24 * 60 * 60 * 1000));
    
    // Appliquer le décalage de freeze si disponible
    if (window.freezeDelaysCache && window.freezeDelaysCache[`day${dayIndex + 1}`]) {
      const delayHours = window.freezeDelaysCache[`day${dayIndex + 1}`].hours || 0;
      deadline = new Date(deadline.getTime() + (delayHours * 60 * 60 * 1000));
    }
    
    // Déterminer si cette journée doit être ouverte par défaut
    // Ouvrir la dernière journée verrouillée (la journée en cours avec résultats)
    const lockedDays = dayGroups.map((g, idx) => ({ locked: isDayLocked(g.matches, idx), index: idx }))
                                .filter(d => d.locked);
    const lastLockedIndex = lockedDays.length > 0 ? lockedDays[lockedDays.length - 1].index : -1;
    const shouldBeOpen = (lastLockedIndex >= 0 && dayIndex === lastLockedIndex) ||
                         (lastLockedIndex === -1 && dayIndex === 0);
    
    // Section de la journée
    const daySection = document.createElement("div");
    daySection.style.cssText = `
      margin-bottom: 2.5rem;
      border: 2px solid ${isLocked ? '#ef4444' : '#667eea'};
      border-radius: 12px;
      overflow: hidden;
      background: ${isLocked ? 'rgba(239, 68, 68, 0.05)' : 'rgba(102, 126, 234, 0.05)'};
    `;
    
    // En-tête de la journée (cliquable pour ouvrir/fermer)
    const dayHeader = document.createElement("div");
    dayHeader.style.cssText = `
      background: ${isLocked ? '#ef4444' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'};
      color: white;
      padding: 1.2rem 1.5rem;
      cursor: pointer;
      user-select: none;
      transition: opacity 0.2s;
    `;
    dayHeader.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 1.4rem;">
            ${isLocked ? '🔒' : '📅'} ${dayName}
          </h3>
          <p style="margin: 0.5rem 0 0 0; font-size: 0.95rem; opacity: 0.95;">
            ${formatDate(dayGroup.matches[0].date).split(',')[0]}
          </p>
        </div>
        <div class="chevron" style="font-size: 1.5rem; transition: transform 0.3s; transform: rotate(${shouldBeOpen ? '180deg' : '0deg'}); margin-left: 1rem;">
          ▼
        </div>
      </div>
    `;
    
    // Effet hover
    dayHeader.addEventListener('mouseenter', () => {
      dayHeader.style.opacity = '0.9';
    });
    dayHeader.addEventListener('mouseleave', () => {
      dayHeader.style.opacity = '1';
    });
    
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
    
    // Ajouter un bouton pour décaler le freeze (toujours visible pour permettre la configuration)
    const delayFreezeBtn = document.createElement("button");
    delayFreezeBtn.textContent = isLocked ? "⏰ Configurer freeze" : "⏰ Décaler freeze";
    delayFreezeBtn.style.cssText = `
      margin-top: 1rem;
      margin-left: 1rem;
      padding: 0.75rem 1.5rem;
      background: ${isLocked ? '#ef4444' : '#f59e0b'};
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
      font-size: 0.95rem;
    `;
    delayFreezeBtn.addEventListener("click", () => delayFreeze(dayIndex));
    dayHeader.appendChild(delayFreezeBtn);
    
    daySection.appendChild(dayHeader);
    
    // Conteneur pliable pour le contenu de la journée
    const collapsibleContent = document.createElement("div");
    collapsibleContent.className = "day-content";
    collapsibleContent.style.cssText = `
      display: ${shouldBeOpen ? 'block' : 'none'};
      transition: all 0.3s ease-in-out;
    `;
    
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
    collapsibleContent.appendChild(warningBox);
    
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
        editTeamsBtn.textContent = "✏️ Modificar partido";
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
        
        // Vérifier si ce pronostic SPÉCIFIQUE a été envoyé (prediction existe et n'est pas vide)
        // Vérifier explicitement pour gérer le cas où la valeur est 0
        const hasHomePrediction = prediction.home !== "" && prediction.home !== null && prediction.home !== undefined;
        const hasAwayPrediction = prediction.away !== "" && prediction.away !== null && prediction.away !== undefined;
        const predictionSent = isFromFirebase && hasHomePrediction && hasAwayPrediction;
        
        const isDisabled = predictionSent ? "disabled" : "";
        const disabledStyle = predictionSent ? "opacity: 0.6; cursor: not-allowed;" : "";
        
        // Vérifier si on doit masquer les pronostics (AVANT le freeze, on masque)
        const showPredictions = isLocked;
        
        // Afficher les valeurs ou un cadenas selon le freeze
        const homeValue = !showPredictions && hasHomePrediction ? "🔒" : prediction.home;
        const awayValue = !showPredictions && hasAwayPrediction ? "🔒" : prediction.away;
        const firstGoalDisplay = !showPredictions && prediction.firstGoal ?
          "🔒" :
          (prediction.firstGoal === "home" ? "Local" : prediction.firstGoal === "away" ? "Visitante" : "-");

        row.innerHTML = `
          <div>
            <strong>${participant.name}</strong>
            ${predictionSent ? '<span class="small-text" style="color: #10b981;">✓ Enviado por el participante</span>' : ''}
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
              ${match.actualScore.home === null ? "Pendiente" : `${points} punto(s)`}
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
    
    collapsibleContent.appendChild(matchesContainer);
    daySection.appendChild(collapsibleContent);
    
    // Gestionnaire de clic pour ouvrir/fermer la journée
    const chevron = dayHeader.querySelector('.chevron');
    dayHeader.addEventListener('click', (e) => {
      // Ne pas déclencher le toggle si on clique sur un bouton
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
        return;
      }
      
      const isCurrentlyOpen = collapsibleContent.style.display !== 'none';
      collapsibleContent.style.display = isCurrentlyOpen ? 'none' : 'block';
      chevron.style.transform = isCurrentlyOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    });
    
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

// Générer un récapitulatif WhatsApp pour une journée (optimisé mobile)
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
  
  let text = "⚽ *COPA 2026* ⚽\n";
  text += `📅 ${dayGroup.name}\n\n`;
  text += "🏆 *CLASIFICACIÓN*\n";
  
  // Classement compact (une ligne par participant)
  ranking.forEach((participant, index) => {
    const medals = ["🥇", "🥈", "🥉"];
    const medal = index < 3 ? medals[index] : `${index + 1}.`;
    text += `${medal} ${participant.name}: ${participant.totalPoints}pts (🎯${participant.correctFirstGoals})\n`;
  });
  
  text += "\n⚽ *PARTIDOS*\n";
  
  // Matchs de la journée (seulement ceux avec résultat)
  dayGroup.matches.forEach((match) => {
    const actualScore = match.actualScore;
    const hasResult = actualScore.home !== null && actualScore.away !== null;
    
    // Ne pas afficher les matchs en attente
    if (!hasResult) return;
    
    // Formater la date au format jj/mm
    const matchDate = new Date(match.date);
    const day = String(matchDate.getDate()).padStart(2, '0');
    const month = String(matchDate.getMonth() + 1).padStart(2, '0');
    const dateStr = `${day}/${month}`;
    
    // Raccourcir les noms d'équipes (3 premières lettres en majuscules)
    const homeShort = match.homeTeam.substring(0, 3).toUpperCase();
    const awayShort = match.awayTeam.substring(0, 3).toUpperCase();
    
    // Ligne du match (tout sur une ligne)
    text += `${dateStr} ${homeShort} ${actualScore.home}-${actualScore.away} ${awayShort}`;
    
    // Premier but (si défini)
    if (actualScore.firstGoalTeam) {
      const firstGoalShort = actualScore.firstGoalTeam === "home" ? homeShort : awayShort;
      text += ` 🎯${firstGoalShort}`;
    }
    text += "\n";
    
    // Pronostics de chaque participant (une ligne par participant)
    state.participants.forEach((participant) => {
      const prediction = match.predictions[participant.id] || { home: "", away: "", firstGoal: "" };
      const points = computePredictionPoints(prediction, actualScore);
      const firstGoalCorrect = isFirstGoalCorrect(prediction, actualScore);
      
      let status = "";
      if (points === 3) status = "✅";
      else if (points === 1) status = "⚠️";
      else status = "❌";
      
      const firstGoalStatus = firstGoalCorrect ? "🎯" : "❌";
      
      // Nom court (prénom seulement ou 8 premiers caractères)
      const nameParts = participant.name.split(' ');
      const shortName = nameParts[0].substring(0, 8);
      
      text += ` ${shortName}: ${prediction.home}-${prediction.away}${status}${points}p ${firstGoalStatus}\n`;
    });
    
    text += "\n";
  });
  
  text += "✅=3p ⚠️=1p ❌=0p 🎯=1ergol\n";
  
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
    const isLocked = isDayLocked(dayGroup.matches, dayIndex);
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
        
        // Vérifier si ce participant a envoyé un pronostic pour ce match via Firebase
        const key = `${participant.id}_${match.id}`;
        const predictionSent = firebaseParticipants.has(key);
        
        const row = document.createElement("div");
        row.className = "prediction-row";
        
        // Afficher les valeurs ou un cadenas selon le freeze
        const homeValue = !showPredictions && prediction.home !== "" ? "🔒" : prediction.home;
        const awayValue = !showPredictions && prediction.away !== "" ? "🔒" : prediction.away;
        
        let firstGoalDisplay = '';
        if (showPredictions && prediction.firstGoal) {
          const firstGoalTeamName = prediction.firstGoal === 'home' ? match.homeTeam : match.awayTeam;
          firstGoalDisplay = `⚽ ${firstGoalTeamName}`;
          if (match.actualScore.firstGoalTeam) {
            firstGoalDisplay += firstGoalCorrect ? ' ✅' : ' ❌';
          }
        } else if (!showPredictions && prediction.firstGoal) {
          firstGoalDisplay = '🔒';
        }
        
        row.innerHTML = `
          <div>
            <strong>${participant.name}</strong>
            ${predictionSent ? '<span class="small-text" style="color: #10b981;">✓ Enviado</span>' : ''}
          </div>
          <div>${showPredictions ? (prediction.home === "" ? "-" : prediction.home) : (homeValue || "-")}</div>
          <div>${showPredictions ? (prediction.away === "" ? "-" : prediction.away) : (awayValue || "-")}</div>
          <div>
            <span class="small-text">${firstGoalDisplay || '-'}</span>
          </div>
          <div>
            <span class="${match.actualScore.home === null ? "status-pending" : "status-success"}">
              ${match.actualScore.home === null ? "Partido no jugado" : `${points} punto(s)`}
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

// Charger les décalages de freeze depuis Firebase
loadFreezeDelays();

// Démarrer l'écoute Firebase après le premier rendu
listenToFirebaseUpdates();

// Made with Bob
