const PARTICIPANT_STORAGE_KEY = "participant-predictions-v1";
const SENT_PREDICTIONS_KEY = "sent-predictions-v1";

let participantName = "";
let participantPassword = "";
let predictions = {};
let matches = [];
let sentPredictions = {}; // Stocke les pronostics envoyés par journée

// Fonction simple de hachage pour le mot de passe
function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

function normalizeParticipantId(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    // Remplacer les caractères interdits par Firebase (. $ # [ ] / @)
    .replace(/\./g, "_dot_")
    .replace(/\$/g, "_dollar_")
    .replace(/#/g, "_hash_")
    .replace(/\[/g, "_lbracket_")
    .replace(/\]/g, "_rbracket_")
    .replace(/\//g, "_slash_")
    .replace(/@/g, "_at_");
}

function findLegacyPasswordMatch(rawPassword, passwordHash) {
  if (!/^\d+$/.test(rawPassword)) {
    return null;
  }

  const candidates = [rawPassword];

  if (rawPassword.length === 4) {
    const permutations = [
      rawPassword,
      rawPassword.split("").reverse().join(""),
      rawPassword.slice(1) + rawPassword[0],
      rawPassword.slice(2) + rawPassword.slice(0, 2),
      rawPassword.slice(3) + rawPassword.slice(0, 3)
    ];

    permutations.forEach((candidate) => {
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    });
  }

  return candidates.find((candidate) => hashPassword(candidate) === passwordHash) || null;
}

// Charger automatiquement les matchs depuis Firebase
function loadMatchesFromSharedData() {
  const loadingDiv = document.getElementById("loading-matches");
  
  // Vérifier que Firebase est disponible
  if (typeof firebase === 'undefined' || !firebase.database) {
    console.error("❌ Firebase no está disponible");
    
    if (loadingDiv) {
      loadingDiv.innerHTML = `
        <p style="color: #ef4444;">❌ Error: Firebase no está disponible</p>
        <p style="font-size: 0.9rem;">Verifica la configuración de Firebase</p>
      `;
    }
    
    alert(
      `❌ Error al cargar los partidos\n\n` +
      `Firebase no está disponible.\n\n` +
      `Verifica que firebase-config.js está correctamente configurado`
    );
    return;
  }
  
  try {
    const db = firebase.database();
    const matchesRef = db.ref('matches');
    
    if (loadingDiv) {
      loadingDiv.innerHTML = `<p style="color: #3b82f6;">🔄 Cargando partidos desde Firebase...</p>`;
    }
    
    // Charger les matchs depuis Firebase
    matchesRef.once('value', (snapshot) => {
      const firebaseMatches = snapshot.val();
      
      if (!firebaseMatches) {
        console.log("ℹ️ No hay partidos en Firebase todavía");
        
        if (loadingDiv) {
          loadingDiv.innerHTML = `
            <p style="color: #f59e0b;">⚠️ No hay partidos disponibles</p>
            <p style="font-size: 0.9rem;">El administrador debe importar los partidos primero</p>
          `;
        }
        
        return;
      }
      
      // Convertir l'objet Firebase en tableau
      matches = Object.values(firebaseMatches).map(matchData => ({
        homeTeam: matchData.homeTeam,
        awayTeam: matchData.awayTeam,
        date: matchData.date,
        stage: matchData.stage,
        group: matchData.group || null,
        addedManually: matchData.addedManually || false
      }));
      
      console.log(`✅ ${matches.length} partidos cargados desde Firebase`);
      
      // Charger les décalages de freeze depuis Firebase
      db.ref('freezeDelays').once('value', (delaysSnapshot) => {
        if (delaysSnapshot.exists()) {
          window.freezeDelaysCache = delaysSnapshot.val();
          console.log('✅ Décalages de freeze chargés:', window.freezeDelaysCache);
        } else {
          window.freezeDelaysCache = {};
        }
        
        if (loadingDiv) {
          loadingDiv.innerHTML = `<p style="color: #10b981;">✅ ${matches.length} partidos cargados desde Firebase</p>`;
          setTimeout(() => {
            loadingDiv.style.display = "none";
          }, 2000);
        }
        
        // Activer le bouton de démarrage
        startBtn.disabled = false;
        startBtn.style.opacity = "1";
      });
    });
    
  } catch (error) {
    console.error("❌ Error al cargar los partidos desde Firebase:", error);
    
    if (loadingDiv) {
      loadingDiv.innerHTML = `
        <p style="color: #ef4444;">❌ Error al cargar los partidos</p>
        <p style="font-size: 0.9rem;">${error.message}</p>
      `;
    }
    
    alert(
      `❌ Error al cargar los partidos\n\n` +
      `No se pudo cargar desde Firebase.\n\n` +
      `Error: ${error.message}`
    );
  }
}

// Écouter les nouveaux matchs depuis Firebase
function listenToNewMatchesFromFirebase() {
  if (typeof firebase === 'undefined' || !firebase.database) {
    console.log("⚠️ Firebase no disponible - no se escucharán nuevos partidos");
    return;
  }
  
  try {
    const db = firebase.database();
    const matchesRef = db.ref('matches');
    
    // Écouter les nouveaux matchs ajoutés
    matchesRef.on('child_added', (snapshot) => {
      const newMatch = snapshot.val();
      
      // Vérifier si le match n'existe pas déjà (éviter les doublons)
      const matchExists = matches.some(m =>
        m.homeTeam === newMatch.homeTeam &&
        m.awayTeam === newMatch.awayTeam &&
        m.date === newMatch.date
      );
      
      if (!matchExists) {
        console.log("🆕 Nuevo partido detectado desde Firebase:", newMatch);
        
        // Ajouter le match à la liste
        matches.push({
          homeTeam: newMatch.homeTeam,
          awayTeam: newMatch.awayTeam,
          date: newMatch.date,
          stage: newMatch.stage || "Fase de grupos",
          group: newMatch.group || null,
          addedManually: newMatch.addedManually || false
        });
        
        // Initialiser une prédiction vide pour ce match
        const matchIndex = matches.length - 1;
        if (!predictions[matchIndex]) {
          predictions[matchIndex] = { home: "", away: "", firstGoal: "" };
        }
        
        // Si l'utilisateur est connecté, mettre à jour l'affichage
        if (participantName && mainView.style.display !== "none") {
          renderMatches();
          updateStats();
          
          // Afficher une notification
          const notification = document.createElement('div');
          notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #3b82f6;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
          `;
          notification.innerHTML = `
            🆕 <strong>Nuevo partido agregado:</strong><br>
            ${newMatch.homeTeam} vs ${newMatch.awayTeam}
          `;
          document.body.appendChild(notification);
          
          setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
          }, 5000);
        }
      }
    });
    
    // Écouter la suppression de tous les matchs (quand le nœud /matches est supprimé)
    matchesRef.on('value', (snapshot) => {
      // Si le snapshot est null, cela signifie que tous les matchs ont été supprimés
      if (!snapshot.exists() && matches.length > 0) {
        console.log("🗑️ Todos los partidos han sido eliminados desde Firebase");
        
        // Vider la liste des matchs
        matches = [];
        predictions = {};
        sentPredictions = {};
        
        // Nettoyer le localStorage
        localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
        localStorage.removeItem(SENT_PREDICTIONS_KEY);
        console.log("🧹 LocalStorage limpiado");
        
        // Si l'utilisateur est connecté, mettre à jour l'affichage
        if (participantName && mainView.style.display !== "none") {
          renderMatches();
          updateStats();
          
          // Afficher une notification
          const notification = document.createElement('div');
          notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
          `;
          notification.innerHTML = `
            🗑️ <strong>Todos los partidos han sido eliminados</strong><br>
            La lista ha sido vaciada por el administrador<br>
            <small>Tus pronósticos han sido eliminados</small>
          `;
          document.body.appendChild(notification);
          
          setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
          }, 5000);
        }
      }
    });
    
    console.log("✅ Escuchando nuevos partidos y eliminaciones desde Firebase");
  } catch (error) {
    console.error("❌ Error al configurar el listener de Firebase:", error);
  }
}

// Matchs par défaut (fallback - ne devrait plus être utilisé)
const defaultMatches = [
  {
    "homeTeam": "Estados Unidos",
    "awayTeam": "Gales",
    "date": "2026-06-11T21:00",
    "stage": "Fase de grupos - Grupo A"
  },
  {
    "homeTeam": "México",
    "awayTeam": "Ecuador",
    "date": "2026-06-12T18:00",
    "stage": "Fase de grupos - Grupo A"
  },
  {
    "homeTeam": "Canadá",
    "awayTeam": "Marruecos",
    "date": "2026-06-12T21:00",
    "stage": "Fase de grupos - Grupo B"
  },
  {
    "homeTeam": "Argentina",
    "awayTeam": "Australia",
    "date": "2026-06-13T15:00",
    "stage": "Fase de grupos - Grupo B"
  },
  {
    "homeTeam": "Francia",
    "awayTeam": "Dinamarca",
    "date": "2026-06-13T18:00",
    "stage": "Fase de grupos - Grupo C"
  },
  {
    "homeTeam": "Brasil",
    "awayTeam": "Serbia",
    "date": "2026-06-13T21:00",
    "stage": "Fase de grupos - Grupo C"
  },
  {
    "homeTeam": "España",
    "awayTeam": "Croacia",
    "date": "2026-06-14T15:00",
    "stage": "Fase de grupos - Grupo D"
  },
  {
    "homeTeam": "Alemania",
    "awayTeam": "Japón",
    "date": "2026-06-14T18:00",
    "stage": "Fase de grupos - Grupo D"
  },
  {
    "homeTeam": "Inglaterra",
    "awayTeam": "Irán",
    "date": "2026-06-14T21:00",
    "stage": "Fase de grupos - Grupo E"
  },
  {
    "homeTeam": "Países Bajos",
    "awayTeam": "Senegal",
    "date": "2026-06-15T15:00",
    "stage": "Fase de grupos - Grupo E"
  },
  {
    "homeTeam": "Portugal",
    "awayTeam": "Ghana",
    "date": "2026-06-15T18:00",
    "stage": "Fase de grupos - Grupo F"
  },
  {
    "homeTeam": "Bélgica",
    "awayTeam": "Suiza",
    "date": "2026-06-15T21:00",
    "stage": "Fase de grupos - Grupo F"
  },
  {
    "homeTeam": "Uruguay",
    "awayTeam": "Corea del Sur",
    "date": "2026-06-16T15:00",
    "stage": "Fase de grupos - Grupo G"
  },
  {
    "homeTeam": "Polonia",
    "awayTeam": "Arabia Saudita",
    "date": "2026-06-16T18:00",
    "stage": "Fase de grupos - Grupo G"
  },
  {
    "homeTeam": "Italia",
    "awayTeam": "Camerún",
    "date": "2026-06-16T21:00",
    "stage": "Fase de grupos - Grupo H"
  },
  {
    "homeTeam": "Colombia",
    "awayTeam": "Túnez",
    "date": "2026-06-17T15:00",
    "stage": "Fase de grupos - Grupo H"
  },
  {
    "homeTeam": "Estados Unidos",
    "awayTeam": "Ecuador",
    "date": "2026-06-17T18:00",
    "stage": "Fase de grupos - Grupo A"
  },
  {
    "homeTeam": "Gales",
    "awayTeam": "México",
    "date": "2026-06-17T21:00",
    "stage": "Fase de grupos - Grupo A"
  },
  {
    "homeTeam": "Canadá",
    "awayTeam": "Argentina",
    "date": "2026-06-18T15:00",
    "stage": "Fase de grupos - Grupo B"
  },
  {
    "homeTeam": "Marruecos",
    "awayTeam": "Australia",
    "date": "2026-06-18T18:00",
    "stage": "Fase de grupos - Grupo B"
  },
  {
    "homeTeam": "Francia",
    "awayTeam": "Brasil",
    "date": "2026-06-18T21:00",
    "stage": "Fase de grupos - Grupo C"
  },
  {
    "homeTeam": "Dinamarca",
    "awayTeam": "Serbia",
    "date": "2026-06-19T15:00",
    "stage": "Fase de grupos - Grupo C"
  },
  {
    "homeTeam": "España",
    "awayTeam": "Alemania",
    "date": "2026-06-19T18:00",
    "stage": "Fase de grupos - Grupo D"
  },
  {
    "homeTeam": "Croacia",
    "awayTeam": "Japón",
    "date": "2026-06-19T21:00",
    "stage": "Fase de grupos - Grupo D"
  }
];

// Éléments DOM
const setupView = document.getElementById("setup-view");
const mainView = document.getElementById("main-view");
const participantNameInput = document.getElementById("participant-name-input");
const participantPasswordInput = document.getElementById("participant-password-input");
const startBtn = document.getElementById("start-btn");
const forgotPasswordBtn = document.getElementById("forgot-password-btn");
const participantNameDisplay = document.getElementById("participant-name-display");
const matchesList = document.getElementById("matches-list");
const saveBtn = document.getElementById("save-btn");
const exportBtn = document.getElementById("export-btn");
const resetBtn = document.getElementById("reset-btn");
const successMessage = document.getElementById("success-message");
const totalMatchesEl = document.getElementById("total-matches");
const completedPredictionsEl = document.getElementById("completed-predictions");
const remainingPredictionsEl = document.getElementById("remaining-predictions");

// Charger les données sauvegardées au démarrage
function loadSavedData() {
  // NE PAS charger les sentPredictions ici
  // Ils seront chargés APRÈS la vérification du nombre de matchs lors de la connexion
  
  // NE PAS charger automatiquement - toujours demander le mot de passe
  // Les données sont sauvegardées mais l'utilisateur doit se reconnecter à chaque fois
  return false;
}

// Charger les compteurs de pronostics envoyés (appelé après vérification)
function loadSentPredictions() {
  const sentData = localStorage.getItem(SENT_PREDICTIONS_KEY);
  if (sentData) {
    try {
      sentPredictions = JSON.parse(sentData);
      console.log("📊 Contadores de pronósticos cargados");
    } catch (error) {
      console.error("Error loading sent predictions:", error);
      sentPredictions = {};
    }
  }
}

// Sauvegarder les données (LOCAL uniquement)
function saveData() {
  const data = {
    participantName,
    participantPassword,
    predictions,
    lastSaved: new Date().toISOString()
  };
  localStorage.setItem(PARTICIPANT_STORAGE_KEY, JSON.stringify(data));
  
  // NE PAS synchroniser avec Firebase ici
  // Firebase sera utilisé uniquement avec le bouton "Enviar"
  
  showSuccessMessage("local");
}

// Envoyer vers Firebase
function sendToFirebase() {
  // Vérifier que Firebase est initialisé
  if (typeof firebase === 'undefined' || !firebase.database) {
    alert("❌ Firebase no está disponible.\n\nNo se pueden enviar los pronósticos al administrador.\n\nPor favor, verifica tu conexión a Internet.");
    return;
  }
  
  try {
    const db = firebase.database();
    const participantId = normalizeParticipantId(participantName);
    
    // Préparer les données pour Firebase (avec mot de passe haché)
    const firebaseData = {
      participantName: participantName,
      passwordHash: participantPassword, // Mot de passe haché
      lastUpdated: new Date().toISOString(),
      predictions: matches.map((match, index) => ({
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        date: match.date,
        stage: match.stage,
        prediction: predictions[index] || { home: "", away: "", firstGoal: "" }
      }))
    };
    
    // DEBUG: Afficher les prédictions envoyées
    console.log("📤 Données envoyées à Firebase:");
    firebaseData.predictions.forEach((p, i) => {
      if (p.prediction.home !== "" || p.prediction.away !== "") {
        console.log(`  Match ${i}: ${p.homeTeam} vs ${p.awayTeam} = ${p.prediction.home}-${p.prediction.away}`);
      }
    });
    
    // Envoyer à Firebase
    db.ref('participants/' + participantId).set(firebaseData)
      .then(() => {
        console.log("✅ Pronósticos enviados a Firebase");
        showSuccessMessage("firebase");
      })
      .catch((error) => {
        console.error("❌ Error al enviar a Firebase:", error);
        alert("❌ Error al enviar los pronósticos.\n\nPor favor, intenta de nuevo.");
      });
      
  } catch (error) {
    console.error("❌ Error en sendToFirebase:", error);
    alert("❌ Error al enviar los pronósticos.\n\nPor favor, intenta de nuevo.");
  }
}

// Afficher une modal de confirmation avec récapitulatif des pronostics
function showConfirmationModal(dayGroup, dayPredictions, completedCount, totalCount, dayIndex) {
  // Créer la modal
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 1rem;
    overflow-y: auto;
  `;
  
  // Créer le contenu de la modal
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    border-radius: 12px;
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  `;
  
  // En-tête
  const header = document.createElement('div');
  header.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 1.5rem;
    border-radius: 12px 12px 0 0;
    text-align: center;
  `;
  header.innerHTML = `
    <h2 style="margin: 0; font-size: 1.5rem;">📤 Confirmar envío de pronósticos</h2>
    <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">${dayGroup.name}</p>
  `;
  modalContent.appendChild(header);
  
  // Corps avec le tableau récapitulatif
  const body = document.createElement('div');
  body.style.cssText = `
    padding: 1.5rem;
  `;
  
  // Message d'avertissement si incomplet
  if (completedCount < totalCount) {
    const warning = document.createElement('div');
    warning.style.cssText = `
      background: #fef3c7;
      border: 2px solid #f59e0b;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    `;
    warning.innerHTML = `
      <p style="margin: 0; color: #92400e; font-weight: bold;">
        ⚠️ Atención: Solo has completado ${completedCount} de ${totalCount} pronósticos
      </p>
      <p style="margin: 0.5rem 0 0 0; color: #78350f; font-size: 0.9rem;">
        Los pronósticos incompletos se enviarán vacíos
      </p>
    `;
    body.appendChild(warning);
  }
  
  // Tableau récapitulatif
  const table = document.createElement('div');
  table.style.cssText = `
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 1rem;
  `;
  
  let tableHTML = `
    <div style="background: #f3f4f6; padding: 0.75rem; font-weight: bold; border-bottom: 2px solid #d1d5db;">
      <div style="display: grid; grid-template-columns: 2fr 1fr 1.2fr; gap: 0.5rem; font-size: 0.9rem;">
        <div>Partido</div>
        <div style="text-align: center;">Pronóstico</div>
        <div style="text-align: center;">1er gol</div>
      </div>
    </div>
  `;
  
  dayGroup.matches.forEach(match => {
    const index = match.originalIndex;
    const pred = dayPredictions[index];
    const isEmpty = !pred || pred.home === "" || pred.home === null || pred.home === undefined || pred.away === "" || pred.away === null || pred.away === undefined;
    const firstGoalTeam =
      pred?.firstGoal === "home"
        ? `⚽ ${match.homeTeam}`
        : pred?.firstGoal === "away"
          ? `⚽ ${match.awayTeam}`
          : "❌ No seleccionado";
    
    tableHTML += `
      <div style="padding: 0.75rem; border-bottom: 1px solid #e5e7eb; ${isEmpty ? 'background: #fee2e2;' : 'background: #f0fdf4;'}">
        <div style="display: grid; grid-template-columns: 2fr 1fr 1.2fr; gap: 0.5rem; align-items: center; font-size: 0.9rem;">
          <div style="font-weight: 500; color: #1f2937;">
            ${match.homeTeam} vs ${match.awayTeam}
          </div>
          <div style="text-align: center; font-weight: bold; font-size: 1.1rem; ${isEmpty ? 'color: #991b1b;' : 'color: #065f46;'}">
            ${isEmpty ? '❌ Vacío' : `${pred.home} - ${pred.away}`}
          </div>
          <div style="text-align: center; font-weight: 700; color: ${pred?.firstGoal ? '#1d4ed8' : '#991b1b'}; background: ${pred?.firstGoal ? '#dbeafe' : '#fee2e2'}; padding: 0.35rem 0.5rem; border-radius: 6px;">
            ${firstGoalTeam}
          </div>
        </div>
      </div>
    `;
  });
  
  table.innerHTML = tableHTML;
  body.appendChild(table);
  
  // Résumé
  const summary = document.createElement('div');
  summary.style.cssText = `
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  `;
  summary.innerHTML = `
    <p style="margin: 0; color: #166534; font-weight: bold;">
      ✅ Pronósticos completados: ${completedCount} / ${totalCount}
    </p>
  `;
  body.appendChild(summary);
  
  modalContent.appendChild(body);
  
  // Pied avec boutons
  const footer = document.createElement('div');
  footer.style.cssText = `
    padding: 1rem 1.5rem;
    border-top: 1px solid #e5e7eb;
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  `;
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '❌ Cancelar';
  cancelBtn.style.cssText = `
    padding: 0.75rem 1.5rem;
    background: #6b7280;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
  `;
  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '✅ Enviar pronósticos';
  confirmBtn.style.cssText = `
    padding: 0.75rem 1.5rem;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
  `;
  confirmBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
    
    // IMPORTANT: Sauvegarder d'abord localement avant d'envoyer
    console.log("💾 Guardando pronósticos localmente antes de enviar...");
    saveData();
    
    // Envoyer les pronostics de cette journée
    console.log(`📤 Enviando pronósticos de la Jornada ${dayIndex + 1}:`, dayPredictions);
    sendToFirebaseWithValidation(dayPredictions, dayIndex);
  });
  
  footer.appendChild(cancelBtn);
  footer.appendChild(confirmBtn);
  modalContent.appendChild(footer);
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Fermer en cliquant sur le fond
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// Envoyer vers Firebase avec validation des journées
function sendToFirebaseWithValidation(validPredictions, dayIndex) {
  // Vérifier que Firebase est initialisé
  if (typeof firebase === 'undefined' || !firebase.database) {
    alert("❌ Firebase no está disponible.\n\nNo se pueden enviar los pronósticos al administrador.\n\nPor favor, verifica tu conexión a Internet.");
    return;
  }
  
  try {
    const db = firebase.database();
    const participantId = normalizeParticipantId(participantName);
    
    console.log('🔍 [UPDATE] Mise à jour des pronostics pour:', participantId);
    console.log('📊 [UPDATE] Journée:', dayIndex + 1);
    console.log('📊 [UPDATE] Nombre de pronostics à mettre à jour:', Object.keys(validPredictions).length);
    
    // Préparer les mises à jour individuelles pour chaque match
    const updates = {};
    
    // Mettre à jour les métadonnées
    updates[`participants/${participantId}/participantName`] = participantName;
    updates[`participants/${participantId}/passwordHash`] = participantPassword;
    updates[`participants/${participantId}/lastUpdated`] = new Date().toISOString();
    
    // Mettre à jour UNIQUEMENT les pronostics de cette journée
    Object.keys(validPredictions).forEach(index => {
      const pred = validPredictions[index];
      const match = matches[index];
      
      if (match) {
        // DEBUG: Afficher pred AVANT traitement
        if (index === 26 || index === 27) {
          console.log(`🔍 [DEBUG] Match ${index} pred AVANT:`, JSON.stringify(pred), `types: home=${typeof pred.home}, away=${typeof pred.away}`);
        }
        
        // Mettre à jour chaque propriété individuellement
        updates[`participants/${participantId}/predictions/${index}/homeTeam`] = match.homeTeam;
        updates[`participants/${participantId}/predictions/${index}/awayTeam`] = match.awayTeam;
        updates[`participants/${participantId}/predictions/${index}/date`] = match.date;
        updates[`participants/${participantId}/predictions/${index}/stage`] = match.stage;
        
        const homeValue = pred.home !== null && pred.home !== undefined ? pred.home : "";
        const awayValue = pred.away !== null && pred.away !== undefined ? pred.away : "";
        
        updates[`participants/${participantId}/predictions/${index}/prediction/home`] = homeValue;
        updates[`participants/${participantId}/predictions/${index}/prediction/away`] = awayValue;
        updates[`participants/${participantId}/predictions/${index}/prediction/firstGoal`] = pred.firstGoal || "";
        
        // DEBUG: Afficher valeurs APRÈS traitement
        if (index === 26 || index === 27) {
          console.log(`🔍 [DEBUG] Match ${index} APRÈS: home=${homeValue} (${typeof homeValue}), away=${awayValue} (${typeof awayValue})`);
        }
        
        console.log(`📝 [UPDATE] Match ${index}: ${pred.home}-${pred.away}`);
      }
    });
    
    console.log('📤 [UPDATE] Envoi de', Object.keys(updates).length, 'mises à jour à Firebase');
    
    // Utiliser update() au lieu de set() pour ne modifier QUE les chemins spécifiés
    db.ref().update(updates)
      .then(() => {
        console.log("✅ [UPDATE] Pronósticos enviados a Firebase");
        
        // Compter uniquement les pronostics non vides
        let nonEmptyCount = 0;
        Object.values(validPredictions).forEach(pred => {
          if (pred && pred.home !== "" && pred.away !== "") {
            nonEmptyCount++;
          }
        });
        
        // Marquer cette journée comme envoyée avec le nombre de pronostics non vides
        if (!sentPredictions[participantName]) {
          sentPredictions[participantName] = {};
        }
        sentPredictions[participantName][dayIndex] = {
          sentAt: new Date().toISOString(),
          count: nonEmptyCount
        };
        
        // Sauvegarder dans localStorage
        localStorage.setItem(SENT_PREDICTIONS_KEY, JSON.stringify(sentPredictions));
        
        showSuccessMessage("firebase");
        
        // Rafraîchir l'affichage pour mettre à jour les compteurs
        renderMatches();
      })
      .catch((error) => {
        console.error("❌ Error al enviar a Firebase:", error);
        alert("❌ Error al enviar los pronósticos.\n\nPor favor, intenta de nuevo.");
      });
      
  } catch (error) {
    console.error("❌ Error en sendToFirebaseWithValidation:", error);
    alert("❌ Error al enviar los pronósticos.\n\nPor favor, intenta de nuevo.");
  }
}

// Afficher le message de succès
function showSuccessMessage(type = "local") {
  if (type === "local") {
    successMessage.innerHTML = "✅ ¡Tus pronósticos han sido guardados localmente!";
    successMessage.style.background = "#10b981"; // Vert
  } else if (type === "firebase") {
    successMessage.innerHTML = "🎉 ¡Tus pronósticos han sido enviados al administrador con éxito!";
    successMessage.style.background = "#3b82f6"; // Bleu
  }
  
  successMessage.style.display = "block";
  
  // Scroll vers le haut pour voir le message
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  setTimeout(() => {
    successMessage.style.display = "none";
  }, 5000);
}

// Démarrer la saisie des pronostics
startBtn.addEventListener("click", async () => {
  const name = participantNameInput.value.trim();
  const password = participantPasswordInput.value.trim();

  if (!name) {
    alert("⚠️ Por favor ingresa tu nombre");
    return;
  }

  if (!password) {
    alert("⚠️ Por favor ingresa una contraseña");
    return;
  }

  if (password.length < 4) {
    alert("⚠️ La contraseña debe tener al menos 4 caracteres");
    return;
  }

  if (matches.length === 0) {
    alert("⚠️ Por favor carga primero el archivo de partidos");
    return;
  }

  const inputPasswordHash = hashPassword(password);

  // Vérifier d'abord dans Firebase si disponible (priorité à Firebase)
  if (typeof firebase !== 'undefined' && firebase.database) {
    try {
      const db = firebase.database();
      const participantId = normalizeParticipantId(name);
      const snapshot = await db.ref('participants/' + participantId).once('value');
      
      if (snapshot.exists()) {
        // Le participant existe dans Firebase, vérifier le mot de passe
        const existingData = snapshot.val();
        const storedPasswordHash = existingData.passwordHash;
        const storedLegacyPassword = existingData.password;
        
        let passwordMatches = false;
        
        // Si passwordHash existe, on ne vérifie QUE le hash (pas de legacy)
        if (storedPasswordHash) {
          passwordMatches = (storedPasswordHash === inputPasswordHash);
        }
        // Sinon, on vérifie l'ancien format (password en clair ou legacy)
        else if (storedLegacyPassword) {
          const matchedLegacyPassword = findLegacyPasswordMatch(password, storedLegacyPassword);
          passwordMatches = (storedLegacyPassword === password || matchedLegacyPassword !== null);
        }
        
        if (!passwordMatches) {
          alert("❌ Contraseña incorrecta para este participante.\n\nSi olvidaste tu contraseña, contacta al administrador.");
          return;
        }
        
        // Mot de passe correct
        participantName = existingData.participantName || name;
        participantPassword = inputPasswordHash;
        
        // Vérifier si le nombre de matchs correspond
        const savedPredictionsCount = existingData.predictions ? existingData.predictions.length : 0;
        if (savedPredictionsCount !== matches.length) {
          console.log(`ℹ️ Número de partidos cambió en Firebase (${savedPredictionsCount} → ${matches.length}). Ajustando pronósticos.`);
          
          // IMPORTANT: Ne PAS supprimer les données existantes!
          // Charger les prédictions existantes
          predictions = {};
          if (existingData.predictions) {
            existingData.predictions.forEach((pred, index) => {
              predictions[index] = pred.prediction;
            });
          }
          
          // Ajouter des prédictions vides pour les nouveaux matchs
          for (let i = savedPredictionsCount; i < matches.length; i++) {
            predictions[i] = { home: "", away: "", firstGoal: "" };
          }
          
          console.log(`✅ ${savedPredictionsCount} pronósticos existentes conservados, ${matches.length - savedPredictionsCount} nuevos partidos agregados`);
          
          // Charger les compteurs de pronostics envoyés
          loadSentPredictions();
        } else {
          // Charger les prédictions existantes
          predictions = {};
          if (existingData.predictions) {
            existingData.predictions.forEach((pred, index) => {
              predictions[index] = pred.prediction;
              // DEBUG: Afficher les prédictions chargées avec types
              if (pred.prediction && (pred.prediction.home !== "" || pred.prediction.away !== "")) {
                console.log(`📥 Match ${index} chargé: ${pred.homeTeam} vs ${pred.awayTeam} = ${pred.prediction.home}-${pred.prediction.away} (types: ${typeof pred.prediction.home}, ${typeof pred.prediction.away})`);
              }
            });
          }
          
          // Charger les compteurs de pronostics envoyés
          loadSentPredictions();
        }
        
        // Initialiser les prédictions manquantes
        matches.forEach((match, index) => {
          if (!predictions[index]) {
            predictions[index] = { home: "", away: "", firstGoal: "" };
          }
        });
        
        // Migrer automatiquement les anciens enregistrements vers passwordHash
        if (storedPasswordHash !== inputPasswordHash || existingData.password) {
          // IMPORTANT: Utiliser les prédictions actuelles (avec les nouveaux matchs ajoutés)
          const migratedFirebaseData = {
            participantName,
            passwordHash: inputPasswordHash,
            lastUpdated: new Date().toISOString(),
            predictions: matches.map((match, index) => ({
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              date: match.date,
              stage: match.stage,
              prediction: predictions[index] || { home: "", away: "", firstGoal: "" }
            }))
          };
          
          await db.ref('participants/' + participantId).set(migratedFirebaseData);
          console.log("🔄 Contraseña migrada al formato passwordHash con todas las predicciones conservadas");
        }

        saveData();
        showMainView();
        return;
      } else {
        // Le participant n'existe PAS dans Firebase
        console.log("❌ Participante no encontrado en Firebase");
        alert(
          `❌ Participante no encontrado\n\n` +
          `El nombre "${name}" no existe en la base de datos.\n\n` +
          `Por favor verifica:\n` +
          `• Que el nombre esté escrito correctamente\n` +
          `• Que hayas sido registrado por el administrador\n\n` +
          `Si el problema persiste, contacta al administrador.`
        );
        return;
      }
    } catch (error) {
      console.warn("⚠️ Firebase no disponible, usando modo local:", error.message);
      
      // Si Firebase n'est pas disponible, essayer de charger depuis localStorage
      const savedData = localStorage.getItem(PARTICIPANT_STORAGE_KEY);
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          if (parsed.participantName === name && parsed.participantPassword === inputPasswordHash) {
            console.log("✅ Cargando datos desde localStorage (Firebase no disponible)");
            participantName = name;
            participantPassword = inputPasswordHash;
            predictions = parsed.predictions || {};
            
            loadSentPredictions();
            
            matches.forEach((match, index) => {
              if (!predictions[index]) {
                predictions[index] = { home: "", away: "", firstGoal: "" };
              }
            });
            
            saveData();
            showMainView();
            return;
          }
        } catch (e) {
          console.error("❌ Error al parsear localStorage:", e);
        }
      }
    }
  }

  // Si on arrive ici, c'est que Firebase n'est pas disponible
  // Dans ce cas, on refuse la création de nouveaux participants
  console.log("❌ No se puede crear nuevo participante sin Firebase");
  alert(
    `❌ No se puede acceder\n\n` +
    `No se pudo verificar tu nombre en la base de datos.\n\n` +
    `Posibles causas:\n` +
    `• Problemas de conexión a Internet\n` +
    `• El servidor Firebase no está disponible\n\n` +
    `Por favor intenta de nuevo más tarde o contacta al administrador.`
  );
  return;
});

// Désactiver le bouton au démarrage jusqu'à ce que les matchs soient chargés
startBtn.disabled = true;
startBtn.style.opacity = "0.5";

// Charger les matchs automatiquement au démarrage depuis matches-data.js
// Gérer le bouton "¿Olvidaste tu contraseña?"
forgotPasswordBtn.addEventListener("click", () => {
  const name = participantNameInput.value.trim();
  
  if (!name) {
    alert("⚠️ Por favor ingresa tu nombre primero para que podamos ayudarte a recuperar tu contraseña.");
    participantNameInput.focus();
    return;
  }
  
  const message = `🔑 Recuperación de contraseña\n\n` +
    `Para recuperar tu contraseña, contacta al administrador:\n\n` +
    `📧 Email: [email del administrador]\n` +
    `💬 WhatsApp: [número del administrador]\n\n` +
    `Proporciona tu nombre: "${name}"\n\n` +
    `El administrador podrá restablecer tu contraseña.`;
  
  alert(message);
});

loadMatchesFromSharedData();

// Démarrer l'écoute des nouveaux matchs depuis Firebase
listenToNewMatchesFromFirebase();

// Afficher la vue principale
function showMainView() {
  setupView.style.display = "none";
  mainView.style.display = "block";
  participantNameDisplay.textContent = participantName;
  renderMatches();
  updateStats();
}

// Formater la date
function formatDate(dateString) {
  if (!dateString) return "Fecha no definida";
  
  const date = new Date(dateString);
  
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
function groupMatchesByDay() {
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
  
  // Grouper les matchs de la Coupe du Monde par journée
  let currentIndex = 0;
  const totalWorldCupMatches = worldCupMatches.length;
  const dayStructure = [];
  
  // Phase de groupes: 3 journées de 24 matchs (72 matchs)
  if (totalWorldCupMatches >= 24) {
    dayStructure.push({ name: "JORNADA 1", count: 24, stage: "Fase de grupos" });
  }
  if (totalWorldCupMatches >= 48) {
    dayStructure.push({ name: "JORNADA 2", count: 24, stage: "Fase de grupos" });
  }
  if (totalWorldCupMatches >= 72) {
    dayStructure.push({ name: "JORNADA 3", count: 24, stage: "Fase de grupos" });
  }
  
  // Phase finale: seulement si on a plus de 72 matchs
  if (totalWorldCupMatches > 72) {
    const remainingMatches = totalWorldCupMatches - 72;
    
    if (remainingMatches >= 16) {
      dayStructure.push({ name: "DIECISEISAVOS DE FINAL", count: 16, stage: "Dieciseisavos de final" });
    }
    if (remainingMatches >= 24) {
      dayStructure.push({ name: "OCTAVOS DE FINAL", count: 8, stage: "Octavos de final" });
    }
    if (remainingMatches >= 28) {
      dayStructure.push({ name: "CUARTOS DE FINAL", count: 4, stage: "Cuartos de final" });
    }
    if (remainingMatches >= 30) {
      dayStructure.push({ name: "SEMIFINALES", count: 2, stage: "Semifinales" });
    }
    if (remainingMatches >= 32) {
      dayStructure.push({ name: "FINALES", count: 2, stage: "Finales" });
    }
  }
  
  // Grouper les matchs de la Coupe du Monde selon la structure définie
  let dayNumber = 1;  // Compteur pour numéroter les journées
  for (const dayDef of dayStructure) {
    const dayMatches = worldCupMatches.slice(currentIndex, currentIndex + dayDef.count);
    
    if (dayMatches.length > 0) {
      // Ajouter la propriété 'day' à chaque match du groupe
      dayMatches.forEach(match => {
        match.day = dayNumber;
      });
      
      dayGroups.push({
        name: dayDef.name,
        matches: dayMatches,
        stage: dayDef.stage,
        date: dayMatches[0].date,
        isWorldCup: true,
        isManual: false,  // Explicitly mark World Cup matches as not manual
        dayNumber: dayNumber  // Ajouter le numéro de journée au groupe
      });
      currentIndex += dayDef.count;
      dayNumber++;  // Incrémenter pour la prochaine journée
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
// Timestamps de freeze en UTC (millisecondes depuis 1970) - identiques pour tous les fuseaux horaires
const FREEZE_TIMESTAMPS = {
  day1: 1781118000000,   // 10 juin 2026 21:00 (France) - 24h avant match du 11 juin 21:00
  day2: 1781712000000,   // 17 juin 2026 18:00 (France) - 24h avant match du 18 juin 18:00
  day3: 1782241200000    // 23 juin 2026 21:00 (France) - 24h avant match du 24 juin 21:00
};

function isDayLocked(dayMatches) {
  if (!dayMatches || dayMatches.length === 0) return false;
  
  // Récupérer le numéro de journée depuis le premier match
  const firstMatch = dayMatches[0];
  const dayNumber = firstMatch.day;
  const dayKey = `day${dayNumber}`;
  
  console.log(`🔍 isDayLocked debug - dayNumber: ${dayNumber}, dayKey: ${dayKey}, firstMatch:`, firstMatch);
  
  // Récupérer le timestamp de freeze pour cette journée
  let freezeTimestamp = FREEZE_TIMESTAMPS[dayKey];
  console.log(`🔍 freezeTimestamp for ${dayKey}:`, freezeTimestamp);
  
  if (!freezeTimestamp) {
    console.log(`⚠️ No freeze timestamp found for ${dayKey}`);
    return false;
  }
  
  // Appliquer le décalage de freeze si disponible
  if (window.freezeDelaysCache && window.freezeDelaysCache[dayKey]) {
    const delayHours = window.freezeDelaysCache[dayKey].hours || 0;
    const delayMs = delayHours * 60 * 60 * 1000;
    freezeTimestamp = freezeTimestamp + delayMs;
    console.log(`⏰ Décalage appliqué: +${delayHours}h → nouveau freeze: ${freezeTimestamp}`);
  }
  
  // Comparer avec l'heure actuelle (en millisecondes UTC)
  const now = Date.now();
  const isLocked = now >= freezeTimestamp;
  console.log(`🔍 Comparison - now: ${now}, freeze: ${freezeTimestamp}, isLocked: ${isLocked}`);
  return isLocked;
}

// Rendre les matchs groupés par journée
function renderMatches() {
  matchesList.innerHTML = "";

  // Si aucun match du tout
  if (matches.length === 0) {
    matchesList.innerHTML = '<p class="empty-state">No hay partidos disponibles.</p>';
    return;
  }

  // Grouper les matchs par journée (sépare automatiquement manuels et Coupe du Monde)
  const dayGroups = groupMatchesByDay();
  
  console.log("📊 Grupos de jornadas:", dayGroups.length);
  dayGroups.forEach((group, idx) => {
    console.log(`  Grupo ${idx}: ${group.name}, ${group.matches.length} partidos, isManual: ${group.isManual}`);
  });

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
    const worldCupMatchCount = matches.filter(m => m.stage !== "Partido manual" && !m.addedManually).length;
    
    // Afficher le nombre de matchs dynamiquement
    let matchesText;
    if (worldCupMatchCount <= 24) {
      matchesText = `${worldCupMatchCount} partidos - Jornada 1`;
    } else if (worldCupMatchCount <= 48) {
      matchesText = `${worldCupMatchCount} partidos - Jornadas 1-2`;
    } else if (worldCupMatchCount <= 72) {
      matchesText = `${worldCupMatchCount} partidos - Fase de grupos completa`;
    } else {
      matchesText = `${worldCupMatchCount} partidos (72 fase de grupos + ${worldCupMatchCount - 72} fase final)`;
    }
    
    mainTitle.innerHTML = `
      <h2 style="margin: 0; font-size: 1.8rem;">⚽ COPA DEL MUNDO FIFA 2026</h2>
      <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">48 equipos - ${matchesText}</p>
    `;
    matchesList.appendChild(mainTitle);
  }
  
  dayGroups.forEach((dayGroup, dayIndex) => {
    console.log(`🔄 Renderizando grupo ${dayIndex}: ${dayGroup.name}`);
    
    const dayName = dayGroup.name || `JORNADA ${dayIndex + 1}`;
    const totalMatches = dayGroup.matches.length;
    
    // Pour les matchs manuels, ne pas appliquer le verrouillage par journée
    const isLocked = dayGroup.isManual ? false : isDayLocked(dayGroup.matches);
    console.log(`🔒 isLocked for ${dayName}:`, isLocked, 'isManual:', dayGroup.isManual);
    
    if (!dayGroup.matches[0]) {
      console.error("❌ Error: No hay partidos en el grupo", dayGroup);
      return;
    }
    
    const firstMatchDate = new Date(dayGroup.matches[0].date);
    let deadline = new Date(firstMatchDate.getTime() - (24 * 60 * 60 * 1000));
    
    // Appliquer le décalage de freeze si disponible
    if (window.freezeDelaysCache && window.freezeDelaysCache[`day${dayIndex}`]) {
      const delayHours = window.freezeDelaysCache[`day${dayIndex}`].hours || 0;
      deadline = new Date(deadline.getTime() + (delayHours * 60 * 60 * 1000));
    }
    
    // Compter les pronostics enregistrés (sauvegardés localement) pour cette journée
    let savedCount = 0;
    dayGroup.matches.forEach(match => {
      const pred = predictions[match.originalIndex];
      if (pred && pred.home !== "" && pred.away !== "") {
        savedCount++;
      }
    });
    
    // Compter les pronostics envoyés pour cette journée
    let sentCount = 0;
    if (sentPredictions[participantName] && sentPredictions[participantName][dayIndex]) {
      sentCount = sentPredictions[participantName][dayIndex].count || 0;
    }
    
    // Section de la journée
    const daySection = document.createElement("div");
    daySection.style.cssText = `
      margin-bottom: 2.5rem;
      border: 2px solid ${isLocked ? '#ef4444' : '#667eea'};
      border-radius: 12px;
      overflow: hidden;
      background: ${isLocked ? 'rgba(239, 68, 68, 0.05)' : 'rgba(102, 126, 234, 0.05)'};
    `;
    
    // Déterminer si cette journée doit être ouverte par défaut
    // Ouvrir la première journée non verrouillée, ou la première si toutes sont verrouillées
    const isFirstUnlocked = dayGroups.findIndex(g => !isDayLocked(g.matches)) === dayIndex;
    const shouldBeOpen = isFirstUnlocked || (dayIndex === 0 && dayGroups.every(g => isDayLocked(g.matches)));
    
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
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 1.4rem;">
            ${isLocked ? '🔒' : '📅'} ${dayName}
          </h3>
          <p style="margin: 0.5rem 0 0 0; font-size: 0.95rem; opacity: 0.95;">
            ${formatDate(dayGroup.matches[0].date).split(',')[0]}
          </p>
        </div>
        <div class="chevron" style="font-size: 1.5rem; transition: transform 0.3s; transform: rotate(${shouldBeOpen ? '180deg' : '0deg'});">
          ▼
        </div>
      </div>
      <div style="margin-top: 0.8rem; display: flex; gap: 1.5rem; font-size: 0.9rem; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1.2rem;">💾</span>
          <span><strong>${savedCount}/${totalMatches}</strong> pronósticos guardados</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1.2rem;">📤</span>
          <span><strong>${sentCount}/${totalMatches}</strong> pronósticos enviados</span>
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
    
    daySection.appendChild(dayHeader);
    
    // Avertissement de délai (seulement pour les matchs de la Coupe du Monde)
    if (!dayGroup.isManual) {
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
    } else {
      // Pour les matchs manuels, afficher un message différent
      const infoBox = document.createElement("div");
      infoBox.style.cssText = `
        padding: 1rem 1.5rem;
        background: #f0fdf4;
        border-bottom: 1px solid #bbf7d0;
      `;
      infoBox.innerHTML = `
        <p style="margin: 0; color: #166534; font-weight: bold;">
          ⚽ Partidos adicionales - Puedes hacer tus pronósticos en cualquier momento
        </p>
        <p style="margin: 0.5rem 0 0 0; color: #15803d; font-size: 0.9rem;">
          Estos partidos fueron agregados manualmente por el administrador
        </p>
      `;
      daySection.appendChild(infoBox);
    }
    
    // Conteneur pliable pour le contenu de la journée
    const collapsibleContent = document.createElement("div");
    collapsibleContent.className = "day-content";
    collapsibleContent.style.cssText = `
      display: ${shouldBeOpen ? 'block' : 'none'};
      transition: all 0.3s ease-in-out;
    `;
    
    // Conteneur des matchs
    const matchesContainer = document.createElement("div");
    matchesContainer.style.cssText = `
      padding: 1.5rem;
    `;
    
    // Rendre chaque match de la journée
    dayGroup.matches.forEach((match) => {
      const index = match.originalIndex;
      const card = document.createElement("div");
      card.className = "match-card-participant";
      card.style.cssText = `
        opacity: ${isLocked ? '0.6' : '1'};
        pointer-events: ${isLocked ? 'none' : 'auto'};
      `;

      const prediction = predictions[index] || { home: "", away: "", firstGoal: "" };

      card.innerHTML = `
        <h3>${match.homeTeam} - ${match.awayTeam}</h3>
        <p class="match-date-participant">📅 ${formatDate(match.date)}</p>
        <div class="prediction-input-group">
          <label>
            <strong>${match.homeTeam}</strong>
            <input
              type="number"
              min="0"
              max="99"
              value="${prediction.home !== null && prediction.home !== undefined && prediction.home !== '' ? prediction.home : ''}"
              data-index="${index}"
              data-side="home"
              placeholder="Marcador"
              ${isLocked ? 'disabled' : ''}
            />
          </label>
          <div class="vs-separator">VS</div>
          <label>
            <strong>${match.awayTeam}</strong>
            <input
              type="number"
              min="0"
              max="99"
              value="${prediction.away !== null && prediction.away !== undefined && prediction.away !== '' ? prediction.away : ''}"
              data-index="${index}"
              data-side="away"
              placeholder="Marcador"
              ${isLocked ? 'disabled' : ''}
            />
          </label>
        </div>
        <div style="margin-top: 1rem; padding: 1rem; background: rgba(102, 126, 234, 0.1); border-radius: 8px;">
          <label style="display: flex; flex-direction: column; gap: 0.5rem;">
            <strong style="color: #667eea; font-size: 1rem;">⚽ ¿Quién marca el primer gol?</strong>
            <select
              data-index="${index}"
              data-side="firstGoal"
              style="padding: 0.75rem; font-size: 1rem; border: 2px solid #667eea; border-radius: 8px; background: white; cursor: pointer;"
              ${isLocked ? 'disabled' : ''}
            >
              <option value="">-- Selecciona un equipo --</option>
              <option value="home" ${prediction.firstGoal === "home" ? "selected" : ""}>${match.homeTeam}</option>
              <option value="away" ${prediction.firstGoal === "away" ? "selected" : ""}>${match.awayTeam}</option>
            </select>
          </label>
        </div>
      `;

      // Ajouter les événements de changement
      if (!isLocked) {
        const inputs = card.querySelectorAll("input");
        inputs.forEach((input) => {
          input.addEventListener("input", (e) => {
            const index = parseInt(e.target.dataset.index);
            const side = e.target.dataset.side;
            const value = e.target.value;

            if (!predictions[index]) {
              predictions[index] = { home: "", away: "", firstGoal: "" };
            }

            predictions[index][side] = value === "" ? "" : parseInt(value);
            updateStats();
          });
        });

        const selects = card.querySelectorAll("select");
        selects.forEach((select) => {
          select.addEventListener("change", (e) => {
            const index = parseInt(e.target.dataset.index);
            const side = e.target.dataset.side;
            const value = e.target.value;

            if (!predictions[index]) {
              predictions[index] = { home: "", away: "", firstGoal: "" };
            }

            predictions[index][side] = value;
            updateStats();
          });
        });
      }

      matchesContainer.appendChild(card);
    });
    
    collapsibleContent.appendChild(matchesContainer);
    
    // Ajouter les boutons d'action après chaque journée
    const actionButtonsContainer = document.createElement("div");
    actionButtonsContainer.className = "action-buttons";
    actionButtonsContainer.style.cssText = `
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 2px solid ${isLocked ? '#ef4444' : '#667eea'};
    `;
    actionButtonsContainer.innerHTML = `
      <button type="button" class="save-btn btn-save">
        💾 Guardar mis pronósticos
      </button>
      <button type="button" class="export-btn btn-export">
        📤 Enviar mis pronósticos
      </button>
      <button type="button" class="reset-btn btn-reset">
        🔄 Reiniciar
      </button>
    `;
    
    collapsibleContent.appendChild(actionButtonsContainer);
    daySection.appendChild(collapsibleContent);
    
    // Ajouter l'événement click pour ouvrir/fermer la journée
    dayHeader.addEventListener('click', () => {
      const isCurrentlyOpen = collapsibleContent.style.display !== 'none';
      const chevron = dayHeader.querySelector('.chevron');
      
      if (isCurrentlyOpen) {
        collapsibleContent.style.display = 'none';
        chevron.style.transform = 'rotate(0deg)';
      } else {
        collapsibleContent.style.display = 'block';
        chevron.style.transform = 'rotate(180deg)';
      }
    });
    
    matchesList.appendChild(daySection);
    
    // Attacher les événements aux boutons de cette journée
    const saveBtnDay = actionButtonsContainer.querySelector(".save-btn");
    const exportBtnDay = actionButtonsContainer.querySelector(".export-btn");
    const resetBtnDay = actionButtonsContainer.querySelector(".reset-btn");
    
    saveBtnDay.addEventListener("click", () => {
      saveData();
    });
    
    exportBtnDay.addEventListener("click", () => {
      // Identifier la journée concernée par ce bouton
      const currentDayIndex = dayIndex;
      const currentDayGroup = dayGroups[currentDayIndex];
      
      // Vérifier si cette journée est verrouillée
      const isCurrentDayLocked = dayGroup.isManual ? false : isDayLocked(currentDayGroup.matches);
      
      if (isCurrentDayLocked) {
        alert(
          "❌ ERROR: Esta jornada está cerrada\n\n" +
          "No se pueden enviar pronósticos para esta jornada porque el plazo ha expirado.\n\n" +
          "El plazo era 24 horas antes del primer partido de la jornada."
        );
        return;
      }
      
      // Vérifier les pronostics de cette journée uniquement
      const dayPredictions = {};
      let completedCount = 0;
      let totalCount = currentDayGroup.matches.length;
      
      // DEBUG: Afficher predictions[26] et predictions[27] AVANT traitement
      console.log("🔍 [PREP] predictions[26]:", JSON.stringify(predictions[26]));
      console.log("🔍 [PREP] predictions[27]:", JSON.stringify(predictions[27]));
      
      currentDayGroup.matches.forEach(match => {
        const index = match.originalIndex;
        const pred = predictions[index];
        
        // DEBUG: Afficher les valeurs avant validation
        if (pred && (pred.home !== "" || pred.away !== "")) {
          console.log(`🔍 Match ${index} avant envoi: home=${pred.home} (${typeof pred.home}), away=${pred.away} (${typeof pred.away})`);
        }
        
        if (pred && pred.home !== "" && pred.home !== null && pred.home !== undefined &&
            pred.away !== "" && pred.away !== null && pred.away !== undefined) {
          completedCount++;
          dayPredictions[index] = {
            home: pred.home,
            away: pred.away,
            firstGoal: pred.firstGoal || ""
          };
        } else {
          // Ajouter une prédiction vide pour les matchs non remplis
          dayPredictions[index] = { home: "", away: "", firstGoal: "" };
        }
      });
      
      // Afficher la modal de confirmation avec récapitulatif
      showConfirmationModal(currentDayGroup, dayPredictions, completedCount, totalCount, currentDayIndex);
    });
    
    resetBtnDay.addEventListener("click", () => {
      const confirm = window.confirm(
        "⚠️ ¿Estás seguro de que deseas reiniciar?\n\n" +
        "Todos tus datos serán eliminados.\n\n" +
        "Recuerda exportar tus pronósticos antes si deseas conservarlos."
      );

      if (confirm) {
        localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
        participantName = "";
        predictions = {};
        setupView.style.display = "block";
        mainView.style.display = "none";
        participantNameInput.value = "";
      }
    });
  });
}

// Mettre à jour les statistiques
function updateStats() {
  const total = matches.length;
  const completed = Object.values(predictions).filter(
    (p) => p.home !== "" && p.home !== null && p.home !== undefined &&
           p.away !== "" && p.away !== null && p.away !== undefined
  ).length;
  const remaining = total - completed;

  totalMatchesEl.textContent = total;
  completedPredictionsEl.textContent = completed;
  remainingPredictionsEl.textContent = remaining;
}

// Les gestionnaires d'événements des boutons sont maintenant dans renderMatches()
// car les boutons sont créés dynamiquement à la fin des journées

// Charger les données au démarrage
loadSavedData();
// Gérer le bouton "Cambiar mi contraseña" sur la page d'accueil
const changePasswordBtn = document.getElementById("change-password-btn");
if (changePasswordBtn) {
  changePasswordBtn.addEventListener("click", async () => {
    // Demander le nom du participant
    const name = prompt("🎯 Ingresa tu nombre:");
    
    if (!name || name.trim() === "") {
      return; // L'utilisateur a annulé
    }
    
    // Demander l'ancien mot de passe
    const oldPassword = prompt("🔐 Ingresa tu contraseña actual:");
    
    if (!oldPassword) {
      return; // L'utilisateur a annulé
    }
    
    // Vérifier que Firebase est disponible
    if (typeof firebase === 'undefined' || !firebase.database) {
      alert("❌ Firebase no está disponible. No se puede cambiar la contraseña.");
      return;
    }
    
    try {
      const db = firebase.database();
      const participantId = normalizeParticipantId(name.trim());
      const participantRef = db.ref('participants/' + participantId);
      
      // Récupérer les données existantes
      const snapshot = await participantRef.once('value');
      
      if (!snapshot.exists()) {
        alert("❌ No se encontró ningún participante con ese nombre.\n\nVerifica que el nombre sea correcto.");
        return;
      }
      
      const existingData = snapshot.val();
      
      // Vérifier que l'ancien mot de passe est correct
      const oldPasswordHash = hashPassword(oldPassword);
      
      // Vérifier d'abord avec passwordHash, puis avec l'ancien champ password
      const storedPasswordHash = existingData.passwordHash || existingData.password;
      
      if (!storedPasswordHash) {
        alert("❌ No se encontró contraseña para este participante.\n\nPor favor, contacta al administrador.");
        return;
      }
      
      // Vérifier le mot de passe (essayer aussi les variantes legacy)
      let passwordMatch = (oldPasswordHash === storedPasswordHash);
      
      if (!passwordMatch) {
        const legacyMatch = findLegacyPasswordMatch(oldPassword, storedPasswordHash);
        passwordMatch = (legacyMatch !== null);
      }
      
      if (!passwordMatch) {
        alert("❌ Contraseña actual incorrecta.\n\nPor favor, intenta de nuevo o usa el botón '¿Olvidaste tu contraseña?'");
        return;
      }
      
      // Demander le nouveau mot de passe
      const newPassword = prompt("🔑 Ingresa tu nueva contraseña (mínimo 4 caracteres):");
      
      if (!newPassword) {
        return; // L'utilisateur a annulé
      }
      
      if (newPassword.length < 4) {
        alert("❌ La nueva contraseña debe tener al menos 4 caracteres.");
        return;
      }
      
      // Confirmer le nouveau mot de passe
      const confirmPassword = prompt("🔑 Confirma tu nueva contraseña:");
      
      if (confirmPassword !== newPassword) {
        alert("❌ Las contraseñas no coinciden. Por favor, intenta de nuevo.");
        return;
      }
      
      // Calculer le nouveau hash
      const newPasswordHash = hashPassword(newPassword);
      
      // Mettre à jour uniquement le mot de passe
      const updatedData = {
        ...existingData,
        passwordHash: newPasswordHash
      };
      
      // Supprimer l'ancien champ password s'il existe
      delete updatedData.password;
      
      // Sauvegarder dans Firebase
      await participantRef.set(updatedData);
      
      // Nettoyer le localStorage pour ce participant pour forcer la resynchronisation
      const savedData = localStorage.getItem(PARTICIPANT_STORAGE_KEY);
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          if (parsed.participantName === name.trim()) {
            localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
            console.log("🧹 localStorage limpiado para forzar resincronización con nuevo password");
          }
        } catch (e) {
          console.error("Error al limpiar localStorage:", e);
        }
      }
      
      alert("✅ ¡Contraseña cambiada con éxito!\n\nRecuerda usar tu nueva contraseña la próxima vez que inicies sesión.");
      
    } catch (error) {
      console.error('Error al cambiar contraseña:', error);
      alert("❌ Error al cambiar la contraseña. Por favor, intenta de nuevo.");
    }
  });
}


// Made with Bob
