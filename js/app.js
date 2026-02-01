// 📦 Chargement des états depuis localStorage
let state = JSON.parse(localStorage.getItem("OPTC_unit_state")) || {};
let shipState = JSON.parse(localStorage.getItem("OPTC_ship_state")) || {};
let currentView = localStorage.getItem("OPTC_current_view") || "units"; // 'units' ou 'ships'
let ownedFilter = "all";
let searchTerm = "";
let attributeFilter = ["all"]; // Tableau pour multi-select
let classFilter = ["all"];     // Tableau pour multi-select
let categoryFilter = ["all"];  // Tableau pour multi-select
let potentialFilter = ["all"]; // Tableau pour multi-select
let artworkEnabled = false; 

const SOCKET_TYPES = [
  "Reduction legere des degats", "Reduction du temps de chargement du coup special", "Resistance au lien", "Resistance au desespoir du capitaine", "Autoguerison a chaque tour", "Amelioration des soins", 
  "Augmentation des chances d avoir un cercle correspondant au type du personnage", "Resistance au poison", "Resistance aux degats de carte", "Resistance occasionnelle aux degats avec 1HP"
];

// 🏴‍☠️ Bateaux Spéciaux (Max Lv 1, Pas de Cola)
const SPECIAL_SHIP_IDS = [18, 22, 25, 30, 31, 37, 38, 42, 45, 49, 51, 56, 57, 59, 64, 65, 66];

function getColaColor(n) {
  switch(parseInt(n)) {
    case 1: return '#cd853f'; // Marron (Peru)
    case 2: return '#f0e68c'; // Jaune Pale (Khaki)
    case 4: return '#ffd700'; // Jaune Dorée
    default: return 'white';  // 0, 3
  }
}

// 🔁 Sauvegarde
function saveState() {
  if (currentView === "units") localStorage.setItem("OPTC_unit_state", JSON.stringify(state));
  else localStorage.setItem("OPTC_ship_state", JSON.stringify(shipState));
}

// 🎯 Gestion du mode actif
let currentMode = "normal"; 
function setMode(mode) {
  if (currentMode === mode && mode !== "normal") {
    currentMode = "normal";
  } else {
    currentMode = mode;
  }
  document.querySelectorAll('button[onclick*="setMode"]').forEach(btn => {
    const onclickAttr = btn.getAttribute('onclick') || '';
    const isThisMode = onclickAttr.includes(`'${currentMode}'`) || onclickAttr.includes(`"${currentMode}"`);
    if (isThisMode) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

// 🔹 Modal Artwork
const artworkModal = document.getElementById("artworkModal");
const artworkContainer = document.getElementById("artworkContainer");

function openArtworkModal(id, customSrc) {
  if (!artworkModal || !artworkContainer) return;
  
  // Nettoyage du conteneur
  artworkContainer.innerHTML = "";

  // Détermine le chemin de base en fonction de la vue actuelle (Unités ou Bateaux)
  const basePath = currentView === "ships" ? "artwork/ships/" : "artwork/artwork/";

  // Fonction utilitaire pour ajouter une image au conteneur
  const addImage = (src) => {
    const img = document.createElement("img");
    img.src = src;
    // Style : hauteur max pour ne pas dépasser l'écran, arrondi, ombre
    img.className = "max-h-[90vh] rounded shadow-lg object-contain flex-shrink-0"; 
    
    // Empêche la fermeture si on clique sur l'image elle-même
    img.addEventListener("click", (e) => e.stopPropagation());
    artworkContainer.appendChild(img);
  };

  // 1. Ajout de l'image principale
  const mainSrc = customSrc ? customSrc : `${basePath}${id}.png`;
  addImage(mainSrc);
  
  // 2. Recherche et ajout des images supplémentaires (si pas de source custom)
  if (!customSrc) {
    let index = 2;
    const loadNext = () => {
      const nextSrc = `${basePath}${id}-${index}.png`;
      const imgCheck = new Image();
      imgCheck.onload = () => {
        addImage(nextSrc);
        index++;
        loadNext(); // On continue tant qu'on trouve des images
      };
      imgCheck.src = nextSrc;
    };
    loadNext();
  }

  artworkModal.classList.remove("hidden");
}

if (artworkModal) {
  artworkModal.addEventListener("click", (e) => { if (e.target === artworkModal) artworkModal.classList.add("hidden"); });
}

// ✅ Mise à jour UI d'une carte
function updateCardUI(id, cardElement = null) {
  const card = cardElement || document.querySelector(`.unit-card[data-id="${id}"]`);
  if (!card) return;
  
  const currentState = currentView === "units" ? state : shipState;
  // Initialisation avec valeurs par défaut pour les bateaux (level 1, stats 0)
  const itemState = currentState[id] || { owned: false, ft: false, sft: false, spec: 0, max: false, level: 1, stats: 0 };
  
  // Synchronisation visuelle LB (Manager) <-> Rainbow/Super Rainbow
  if (currentView === "units") {
    const unitData = units.find(u => u.id === id);
    const potCount = unitData?.potentials?.length || 0;
    const p1 = itemState.pot1 || 0;
    const p2 = itemState.pot2 || 0;
    const p3 = itemState.pot3 || 0;
    
    let maxPots = false;
    if (potCount > 0) {
      maxPots = (p1 >= 5);
      if (potCount >= 2) maxPots = maxPots && (p2 >= 5);
      if (potCount >= 3) maxPots = maxPots && (p3 >= 5);
    }

    itemState.ft = (itemState.lb === 1 && maxPots);
    itemState.sft = (itemState.lb === 2 && maxPots);
  }

  card.classList.toggle('selected', !!itemState.owned);
  card.classList.toggle('ft', !!itemState.ft); // Rainbow (Unités)
  card.classList.toggle('sft', !!itemState.sft); // Super Rainbow (Unités)
  if (currentView === "ships") card.classList.toggle('max-ship', (itemState.level === 12)); // Max (Bateaux) si Lv12

  let badge = card.querySelector('.spe-badge');
  if (itemState.owned) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'spe-badge';
      card.appendChild(badge);
    }

    // --- Gestion du Badge Stats (Bateaux uniquement) ---
    let statsBadge = card.querySelector('.stats-badge');
    const hasStats = itemState.stats && (
      (typeof itemState.stats === 'number' && itemState.stats > 0) ||
      (typeof itemState.stats === 'string' && /[1-5]/.test(itemState.stats))
    );
    const isSpecialShip = currentView === "ships" && SPECIAL_SHIP_IDS.includes(id);

    if (currentView === "ships" && hasStats && !isSpecialShip) {
      if (!statsBadge) {
        statsBadge = document.createElement('span');
        statsBadge.className = 'stats-badge';
        card.appendChild(statsBadge);
      }
      const s = itemState.stats;
      let text = (typeof s === 'number') ? `${s}/${s}/${s}` : s;
      
      let html = '';
      for (const char of text) {
        if (/[0-9]/.test(char)) {
          const d = parseInt(char);
          if (d === 5) html += '<span class="text-rainbow">5</span>';
          else html += `<span style="color: ${getColaColor(d)}">${char}</span>`;
        } else {
          html += `<span style="color: white">${char}</span>`;
        }
      }
      statsBadge.innerHTML = html;
      statsBadge.className = 'stats-badge bg-gray-800';
    } else {
      if (statsBadge) statsBadge.remove();
    }
    // ---------------------------------------------------

    // --- Gestion du Badge Niveau (Unités uniquement, en bas) ---
    let levelBadge = card.querySelector('.level-badge');
    if (currentView === "units") {
      if (!levelBadge) {
        levelBadge = document.createElement('div');
        levelBadge.className = 'level-badge';
        card.appendChild(levelBadge);
      }
      const lvl = itemState.level || 1;
      levelBadge.textContent = `Lv.${lvl}`;

      const maxLevels = [99, 105, 110, 120, 130, 150];
      const currentMaxLv = maxLevels[itemState.llb || 0] || 99;

      if (lvl === 150) {
        levelBadge.style.color = "#ff0000"; // Rouge
      } else if (lvl >= currentMaxLv) {
        levelBadge.style.color = "#ffa500"; // Orange
      } else {
        levelBadge.style.color = "#fff";
      }
    } else if (levelBadge) levelBadge.remove();
    // ---------------------------------------------------

    let badgeClass = 'spe-badge ';
    if (currentView === "units") {
      if (itemState.sft) badgeClass += 'bg-pink-500 text-white';
      else if (itemState.ft) badgeClass += 'bg-purple-600 text-white';
      else badgeClass += 'bg-yellow-400 text-black';
      badge.textContent = itemState.llb ?? 0; // Affiche le LLB (0-5)
    } else {
      // Mode Bateaux
      const isSpecial = SPECIAL_SHIP_IDS.includes(id);
      let color = 'white';
      
      if (isSpecial) {
        badge.textContent = "MAX";
        color = '#ff0000';
      } else {
        const level = itemState.level || (itemState.max ? 12 : 1);
        badge.textContent = (level === 12) ? "MAX" : "Lv." + level;
        
        if (level >= 11) {
          color = '#ff0000';
        } else if (level === 10) {
          color = '#ffa500';
        }
      }
      
      badge.style.color = color;
      badgeClass += 'bg-gray-800';
      badge.style.width = "auto"; badge.style.padding = "0 4px"; badge.style.borderRadius = "4px";
    }
    
    badge.className = badgeClass;
    badge.style.display = 'flex';
  } else {
    if (badge) badge.style.display = 'none';
    const levelBadge = card.querySelector('.level-badge');
    if (levelBadge) levelBadge.remove();
    const statsBadge = card.querySelector('.stats-badge');
    if (statsBadge) statsBadge.remove();
  }
}

// ✅ FONCTIONS D'ÉTAT
function toggleUnit(id) {
  const currentState = currentView === "units" ? state : shipState;
  if (!currentState[id]) currentState[id] = { owned: false, ft: false, sft: false, spec: 0, max: false, level: 1, stats: 0 };
  
  currentState[id].owned = !currentState[id].owned;
  // Suppression de la réinitialisation des données lors du décochage
  
  saveState();
  updateCardUI(id);
  applyFilters();
}

/**
 * Mode simple : Clic sur une unité possédée la désélectionne et supprime toutes ses données.
 * Clic sur une unité non possédée la sélectionne simplement.
 * @param {number} id - L'ID de l'unité.
 */
function simpleToggleUnit(id) {
  const currentState = currentView === "units" ? state : shipState;

  if (currentState[id] && currentState[id].owned) {
    // L'unité est possédée : on la retire et on supprime toutes ses données.
    delete currentState[id];
  } else {
    // L'unité n'est pas possédée : on l'ajoute comme possédée (sans données additionnelles).
    currentState[id] = { owned: true };
  }

  saveState();
  updateCardUI(id);
  applyFilters();
}

function incrementShipLevel(id) {
  if (currentView !== "ships") return;
  if (!shipState[id] || !shipState[id].owned) return;
  
  let currentLevel = shipState[id].level || (shipState[id].max ? 12 : 1);
  currentLevel++;
  if (currentLevel > 12) currentLevel = 1;
  
  shipState[id].level = currentLevel;
  shipState[id].max = (currentLevel === 12); // Maintien de la synchro
  saveState();
  updateCardUI(id);
}

function incrementShipStats(id) {
  if (currentView !== "ships") return;
  if (!shipState[id] || !shipState[id].owned) return;

  let currentStats = shipState[id].stats || 0;
  shipState[id].stats = currentStats >= 5 ? 0 : currentStats + 1;
  
  saveState();
  updateCardUI(id);
  updateProgress();
}

// 🧱 Construction des cartes
function buildCards() {
  const container = document.getElementById("unit-list");
  if (!container) return;
  container.innerHTML = "";
  
  const data = currentView === "units" ? units : ships;
  const currentState = currentView === "units" ? state : shipState;

  data.forEach(item => {
    const itemState = currentState[item.id] || { owned: false };
    const card = document.createElement("div");
    // Ajout de classes conditionnelles pour le style
    let classes = `unit-card cursor-pointer relative ${itemState.owned ? "selected" : ""}`;
    if (currentView === "units") {
      if (itemState.ft) classes += " ft";
      if (itemState.sft) classes += " sft";
    } else {
      if (itemState.level === 12 || itemState.max) classes += " max-ship"; // Style spécifique bateau max
    }
    card.className = classes;
    
    card.dataset.id = item.id;
    // Gère les attributs simples et multiples (ex: "QCK & STR" devient "qck str")
    card.dataset.attribute = item.attribute ? item.attribute.toLowerCase().split(' & ').join(' ') : 'none';
    
    const img = document.createElement("img");
    img.src = item.image;
    img.loading = "lazy";
    img.className = "mb-1 w-full";
    img.style.pointerEvents = "none";
    
    const badge = document.createElement("span");
    badge.className = 'spe-badge';
    // Le contenu du badge est géré par updateCardUI
    
    const overlay = document.createElement("div");
    overlay.className = "card-overlay";
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.zIndex = "5";
    
    overlay.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(card.dataset.id, 10);
      if (artworkEnabled) {
        openArtworkModal(id, item.artwork);
        return;
      }
      
      if (currentView === "units") {
        if (currentMode === "manager") {
          openManagerModal(id);
        } else if (currentMode === "simple") {
          simpleToggleUnit(id);
        } else { // Mode "normal" (aucun bouton de mode actif)
          toggleUnit(id);
        }
      } else {
        // Mode Bateaux
        if (currentMode === "manager") openManagerModal(id);
        else if (currentMode === "simple") simpleToggleUnit(id);
        else toggleUnit(id);
      }
    });

    card.appendChild(img);
    card.appendChild(badge);
    card.appendChild(overlay);
    container.appendChild(card);
    updateCardUI(item.id, card);
  });
}

// 🚀 Filtrage
function applyFilters() {
  const allCards = document.querySelectorAll(".unit-card");
  const term = searchTerm.trim().toLowerCase();
  const data = currentView === "units" ? units : ships;
  const currentState = currentView === "units" ? state : shipState;

  allCards.forEach(card => {
    const id = parseInt(card.dataset.id, 10);
    const attr = card.dataset.attribute;
    const item = data.find(u => u.id === id);
    const itemState = currentState[id] || { owned: false };
    let visible = true;
    if (ownedFilter === "owned" && !itemState.owned) visible = false;
    if (ownedFilter === "not-owned" && itemState.owned) visible = false;
    if (currentView === "units" && !attributeFilter.includes("all")) {
      const cardAttributes = attr.split(' ');
      // Vérifie si au moins un des attributs de la carte correspond à la sélection
      if (!cardAttributes.some(a => attributeFilter.includes(a))) visible = false;
    }
    if (currentView === "units" && !classFilter.includes("all")) {
      if (!item.classes || !item.classes.some(c => classFilter.includes(c))) {
        visible = false;
      }
    }
    if (currentView === "units" && !categoryFilter.includes("all")) {
      if (!item.categorie || !item.categorie.some(c => categoryFilter.includes(c))) {
        visible = false;
      }
    }
    if (currentView === "units" && !potentialFilter.includes("all")) {
      if (!item.potentials || !item.potentials.some(p => potentialFilter.includes(p))) {
        visible = false;
      }
    }
    if (term !== "") {
      // Utilise 'Recherche' si défini (pour les easter eggs), sinon utilise 'name'
      const searchStr = (item.Recherche || item.name || '').toLowerCase();
      if (!searchStr.includes(term)) visible = false;
    }
    card.style.display = visible ? "" : "none";
    const overlay = card.querySelector('.card-overlay');
    if (overlay) overlay.style.cursor = artworkEnabled ? "zoom-in" : "pointer";
  });
  updateProgress();
}

function updateProgress() {
  const progressBar = document.getElementById("progressBar");
  const progressLabel = document.getElementById("progressLabel");
  if (!progressBar) return;

  const data = currentView === "units" ? units : ships;
  const currentState = currentView === "units" ? state : shipState;

  const total = data.length;
  const owned = Object.values(currentState).filter(u => u.owned).length;
  const percent = total > 0 ? Math.round((owned / total) * 100) : 0;

  progressBar.style.width = `${percent}%`;
  if (progressLabel) progressLabel.textContent = `${owned}/${total} (${percent}%)`;
}

// --- Boutons Système ---
function resetAll() {
  if (confirm(`Réinitialiser la collection (${currentView === "units" ? "Unités" : "Bateaux"}) ?`)) {
    if (currentView === "units") state = {};
    else shipState = {};
    saveState();
    document.querySelectorAll('.unit-card').forEach(card => updateCardUI(parseInt(card.dataset.id, 10), card));
    applyFilters();
  }
}
function exportCollection() {
  const dataToExport = { units: state, ships: shipState };
  const dataStr = JSON.stringify(dataToExport);
  const blob = new Blob([dataStr], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "optc_collection.json"; a.click();
}
function importCollection() {
  const input = document.createElement("input");
  input.type = "file"; input.accept = ".json";
  input.onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const imported = JSON.parse(event.target.result);
      // Support rétrocompatible ou format complet
      if (imported.units || imported.ships) {
        if (imported.units) state = imported.units;
        if (imported.ships) shipState = imported.ships;
      } else {
        state = imported; // Ancien format (juste les unités)
      }
      saveState();
      document.querySelectorAll('.unit-card').forEach(card => updateCardUI(parseInt(card.dataset.id, 10), card));
      applyFilters();
    };
    reader.readAsText(e.target.files[0]);
  };
  input.click();
}

// ⚓ Changement de Vue (Unités <-> Bateaux)
function toggleView() {
  currentView = currentView === "units" ? "ships" : "units";
  localStorage.setItem("OPTC_current_view", currentView);
  const btn = document.getElementById("viewSwitchBtn");
  const filterBtn = document.getElementById("masterFilterBtn");
  const iconUnits = document.getElementById("icon-units");
  const iconShip = document.getElementById("icon-ship");
  
  // ✅ Réinitialisation de la recherche lors du changement de vue
  searchTerm = "";
  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";
  
  if (currentView === "ships") {
    btn.innerHTML = '<img src="icons/ui/units.png" class="w-5 h-5 object-contain"> Unités';
    if (iconUnits) iconUnits.classList.add("hidden");
    if (iconShip) iconShip.classList.remove("hidden");
  } else {
    btn.innerHTML = '<img src="icons/ui/ship.png" class="w-5 h-5 object-contain"> Bateaux';
    if (iconUnits) iconUnits.classList.remove("hidden");
    if (iconShip) iconShip.classList.add("hidden");
  }

  updateModeButtons();
  currentMode = "normal"; // Force la réinitialisation pour éviter de désactiver le mode s'il est déjà actif
  setMode("manager"); // Reset mode to manager on switch
  buildCards();
  applyFilters();
  // Afficher/cacher le bouton de filtre principal
  if (filterBtn) {
    // Utilisation de visibility pour conserver l'espace et éviter que le bouton Menu ne bouge
    filterBtn.style.visibility = 'visible';
  }
}

function updateModeButtons() {
  // Le conteneur pour les boutons de mode est maintenant 'centered-mode-buttons'
  const container = document.getElementById("centered-mode-buttons");
  if (!container) return;

  // Vide le conteneur et crée les nouveaux boutons selon la vue
  let newButtonsHTML = "";
  if (currentView === "units") {
    newButtonsHTML = `
      <button onclick="setMode('manager')" class="mode-button btn-manager unit-mode-btn text-white px-3 py-1 rounded transition">Mode Manager</button>
      <button onclick="setMode('simple')" class="mode-button btn-simple unit-mode-btn text-white px-3 py-1 rounded transition">Mode Reset</button>
    `;
  } else {
    newButtonsHTML = `
      <button onclick="setMode('manager')" class="mode-button btn-manager text-white px-3 py-1 rounded transition">Mode Manager</button>
      <button onclick="setMode('simple')" class="mode-button btn-simple text-white px-3 py-1 rounded transition">Mode Reset</button>
    `;
  }

  // Insère les nouveaux boutons
  container.innerHTML = newButtonsHTML;

  // Réattache les événements et icônes
  initModeButtons();
}

const modeIcons = { 
  'simple': 'icons/modes/Reset.png', 
  'default_ship': 'icons/modes/normal_ship.png', 
  'manager': 'icons/modes/normal.png', 
  'max': 'icons/modes/max.png', 
  'ship_level': 'icons/modes/ship_level.png', 
  'ship_stats': 'icons/modes/ship_stats.png'
};

function initModeButtons() {
  document.querySelectorAll('button[onclick*="setMode"]').forEach(btn => {
    const match = btn.getAttribute('onclick').match(/setMode\(['"]([^'"]+)['"]\)/);
    const mode = match ? match[1] : "normal";
    btn.classList.add('rounded-lg', 'flex', 'items-center', 'justify-center');
    const text = btn.textContent.trim();
    // Ajoute l'icône si elle existe, sinon juste le texte
    btn.innerHTML = (modeIcons[mode] ? `<img src="${modeIcons[mode]}" class="w-5 h-5 mr-2" onerror="this.style.display='none'"> ` : '') + text;
    
    // ✅ FIX : Réapplique l'état grisé si le mode Artwork est actif lors de la création des boutons
    if (artworkEnabled) {
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
    }

    btn.onclick = null;
    btn.addEventListener("click", (e) => { 
      e.preventDefault(); 
      if (!artworkEnabled) setMode(mode); 
    });
  });
}

// 🛠️ MANAGER MODAL SYSTEM
const managerModal = document.getElementById("managerModal");
const managerContent = document.getElementById("managerContent");

window.openSocketSelector = function(slotIndex) {
  const selector = document.getElementById('socketSelector');
  const optionsContainer = document.getElementById('socketOptions');
  if(!selector || !optionsContainer) return;
  
  selector.dataset.slot = slotIndex;

  // Récupérer les sockets déjà utilisés sur ce personnage
  const usedSockets = [];
  for(let i=1; i<=5; i++) {
    if(i === slotIndex) continue; // On ignore le slot actuel pour permettre de changer
    const val = document.getElementById(`mgr_sockType${i}`).value;
    if(val) usedSockets.push(val);
  }

  // Générer la liste des options
  optionsContainer.innerHTML = '';

  // Autres pouvoirs disponibles
  SOCKET_TYPES.forEach(type => {
    if(usedSockets.includes(type)) return; // Masquer si déjà utilisé ailleurs sur ce perso

    const btn = document.createElement('div');
    btn.className = "cursor-pointer flex flex-col items-center hover:bg-gray-700 p-2 rounded transition border border-gray-600 hover:border-gray-400";
    btn.onclick = () => selectSocket(slotIndex, type);
    btn.innerHTML = `<img src="./icons/Pouvoirs/${type}.png" class="w-10 h-10 object-contain" title="${type}">`;
    optionsContainer.appendChild(btn);
  });

  selector.classList.remove('hidden');
}

window.selectSocket = function(slotIndex, type) {
  document.getElementById(`mgr_sockType${slotIndex}`).value = type;
  document.getElementById(`mgr_sockImg${slotIndex}`).src = `./icons/Pouvoirs/${type || 'Vide'}.png`;
  const levelInput = document.getElementById(`mgr_sockLv${slotIndex}`);
  if(!type && levelInput) {
    levelInput.value = 0; // Reset niveau si vide
    levelInput.style.color = 'white'; // Revert color to white
  }
  document.getElementById('socketSelector').classList.add('hidden');
}

window.updateShipStatInput = function(input, nextIdx) {
  let valStr = input.value.replace(/[^0-9]/g, '');
  let val = 0;
  if (valStr.length > 0) {
    // On prend le dernier chiffre tapé pour éviter les cumuls (ex: "03" -> 3)
    val = parseInt(valStr.slice(-1));
  }
  if (val > 5) val = 5;
  input.value = val;
  
  // Mise à jour de la couleur
  input.classList.remove('text-rainbow');
  
  if (val === 5) {
    input.classList.add('text-rainbow');
    input.style.color = ''; // Important : on retire la couleur blanche pour voir l'arc-en-ciel
  } else {
    input.style.color = getColaColor(val);
  }

  // Auto-focus vers le champ suivant
  if (nextIdx && valStr.length > 0) {
    const next = document.getElementById('mgr_ship_stat' + nextIdx);
    if (next) next.focus();
  }
}

window.handleShipLevelChange = function(input) {
    if(parseInt(input.value) > 12) input.value = 12; 
    if(parseInt(input.value) < 1) input.value = 1;
    const v = parseInt(input.value) || 1;
    input.style.color = (v >= 11) ? '#ff0000' : (v === 10 ? '#ffa500' : 'white');

    const statsContainer = document.getElementById('shipStatsContainer');
    if (!statsContainer) return;

    const isMaxLevel = v === 12;
    statsContainer.style.opacity = isMaxLevel ? '1' : '0.5';
    statsContainer.style.pointerEvents = isMaxLevel ? 'auto' : 'none';
    
    const helpText = statsContainer.querySelector('p');
    if (helpText) helpText.textContent = isMaxLevel ? 'Max: 5 par stat' : 'Niveau 12 requis';

    // Réinitialise les stats si le niveau est abaissé en dessous de 12
    if (!isMaxLevel) {
        for (let i = 1; i <= 3; i++) {
            const statInput = document.getElementById(`mgr_ship_stat${i}`);
            if (statInput) {
                statInput.value = 0;
                updateShipStatInput(statInput, 0); // Met à jour la couleur sans changer le focus
            }
        }
    }
}

window.setLBSlider = function(level) {
  const slider = document.getElementById('mgr_lbLevel');
  if (slider) {
    slider.value = level;
    updateLBUI(level); // Call the existing UI update function
  }
}

let lbAnimationFrame; // Variable pour gérer la fluidité

window.updateLBUI = function(val) {
  if (lbAnimationFrame) cancelAnimationFrame(lbAnimationFrame);

  lbAnimationFrame = requestAnimationFrame(() => {
    const level = parseInt(val);
    const display = document.getElementById('lb_level_display');
    const slider = document.getElementById('mgr_lbLevel');
    
    if(display) {
      display.textContent = (level === 40) ? "MAX" : "Lv. " + level;
      display.style.color = (level >= 31) ? '#ff0000' : 'white';
    }
    
    if(slider) {
      const color = (level >= 31) ? '#ff0000' : '#ffa500';
      const percent = (level / 40) * 100;
      slider.style.background = `linear-gradient(to right, ${color} 0%, ${color} ${percent}%, #374151 ${percent}%, #374151 100%)`;
      slider.style.accentColor = color;
    }

    const milestones = [4, 15, 23, 27, 30, 31, 39];
    milestones.forEach(m => {
      const img = document.getElementById('lb_icon_' + m);
      if(img) {
        if(level >= m) {
          img.classList.remove('opacity-30', 'grayscale');
        } else {
          img.classList.add('opacity-30', 'grayscale');
        }
      }
    });

    // Sync Dropdown Limit Break (Stats tab) with Slider
    const lbSelect = document.getElementById('mgr_lb');
    if (lbSelect) {
      if (level >= 40) lbSelect.value = 2;
      else if (level >= 30) lbSelect.value = 1;
      else lbSelect.value = 0;
    }
  });
}

window.updateLBFromStats = function(select) {
  const val = parseInt(select.value);
  const slider = document.getElementById('mgr_lbLevel');
  if (slider) {
    if (val === 1) {
      slider.value = 30;
      updateLBUI(30);
    } else if (val === 2) {
      slider.value = 40;
      updateLBUI(40);
    } else if (val === 0) {
      slider.value = 0;
      updateLBUI(0);
    }
  }
}

function openManagerModal(id) {
  if (!managerModal || !managerContent) return;
  
  const data = currentView === "units" ? units : ships;
  const currentState = currentView === "units" ? state : shipState;
  const item = data.find(u => u.id === id);
  // Initialisation complète des stats si elles n'existent pas
  const s = currentState[id] || { 
    owned: false, ft: false, sft: false, spec: 0, max: false, level: 1, stats: 0, llb: 0,
    ccHp: 0, ccAtk: 0, ccRcv: 0, lb: 0, support: 0, pot1: 1, pot2: 1, pot3: 1,
    lbLevel: 0,
    rumbleSpec: 1, rumbleAb: 1, rumbleRes: 1
  };

  // Logique LLB -> Max Level
  const maxLevels = [99, 105, 110, 120, 130, 150];
  const currentMaxLv = maxLevels[s.llb || 0];

  // Helper pour la couleur du texte (Orange si MAX)
  const getMaxColor = (val, max) => parseInt(val) >= max ? '#ffa500' : 'white';

  // Helper spécifique pour la couleur du niveau
  const getLevelColor = (val, max) => {
    if (parseInt(val) === 150) return '#ff0000';
    if (parseInt(val) >= max) return '#ffa500';
    return 'white';
  };

  // Script oninput pour mettre à jour la couleur
  const onInputMax = (max) => `oninput="if(parseInt(this.value) > ${max}) this.value = ${max}; this.style.color = (parseInt(this.value) >= ${max}) ? '#ffa500' : 'white'"`;

  // Script oninput spécifique pour le niveau
  const getLevelInputCode = (max) => `if(parseInt(this.value) > ${max}) this.value = ${max}; this.style.color = (parseInt(this.value) === 150 ? '#ff0000' : (parseInt(this.value) >= ${max} ? '#ffa500' : 'white'))`;

  // Script spécifique pour mettre à jour le niveau max quand on change le LLB
  window.updateLevelMax = function(select) {
    const maxLevels = [99, 105, 110, 120, 130, 150];
    const newMax = maxLevels[parseInt(select.value)] || 99;
    const lvlInput = document.getElementById('mgr_level');
    lvlInput.max = newMax;
    if (parseInt(lvlInput.value) > newMax) lvlInput.value = newMax;
    
    // Update color
    lvlInput.style.color = getLevelColor(lvlInput.value, newMax);
    
    // Update de l'event oninput du niveau pour prendre en compte le nouveau max
    lvlInput.setAttribute('oninput', getLevelInputCode(newMax));
  };

  const lbMilestones = [
    { level: 4, icon: 'Acquisition de Potential Abilities.png', label: 'Potentiel 1' },
    { level: 15, icon: 'Acquisition de Potential Abilities - 2.png', label: 'Potentiel 2' },
    { level: 23, icon: 'Reduction du tempsde chargement du coup special.png', label: 'CDR 1' },
    { level: 27, icon: 'Ajout de Crewmate Abilities.png', label: 'Crewmate' },
    { level: 30, icon: 'Acquisition de Potential Abilities - 3.png', label: 'Potentiel 3' },
    { level: 31, icon: 'Cle orientation.png', label: 'Clé (LB+)' },
    { level: 39, icon: 'Reduction du tempsde chargement du coup special - 2.png', label: 'CDR 2' }
  ];

  let html = `
    <div class="mb-6 border-b border-gray-600 pb-4 relative">
      <!-- Bouton Fermer (Absolu en haut à droite) -->
      <button onclick="closeManagerModal()" class="absolute -top-2 -right-2 text-gray-400 hover:text-white text-3xl">&times;</button>

      <!-- Titre Centré -->
      <h2 class="text-3xl font-bold text-white text-center mb-4 w-full">${item.name}</h2>
      
      <div class="flex justify-between items-end">
        <!-- Gauche : Image + Infos -->
        <div class="flex flex-col gap-1">
            ${currentView === "units" && item.categorie ? 
              `<div class="flex flex-col items-start gap-1 mb-1">
                ${item.categorie.map(cat => `
                  <div class="flex items-center gap-2">
                    <img src="icons/categories/${cat}.png" class="h-6 object-contain" title="${cat}" onerror="this.style.display='none'">
                    <span class="text-xs text-gray-200 font-semibold whitespace-nowrap">${cat}</span>
                  </div>`).join('')}
              </div>` : ''}
          
          <div class="flex gap-5 items-center">
            <!-- Image Agrandie -->
            <img src="${item.image}" class="w-28 h-28 rounded-lg shadow-md object-cover bg-black">
            
            <div class="flex flex-col gap-2">
              <!-- Attributs & Rareté -->
              <div class="flex items-center gap-2">
              ${currentView === "units" && item.attribute ? 
                item.attribute.split(' & ').map(attr => 
                  `<img src="icons/types/${attr.trim()}.png" class="w-8 h-8 object-contain" title="${attr.trim()}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline'">
                   <span style="display:none" class="text-sm text-gray-400 font-bold">${attr.trim()}</span>`
                ).join('') 
                : ''}
              <p class="text-gray-300 font-bold text-lg">${currentView === "units" ? (item.rarity || "").replace("★", "<span class='text-yellow-400'>★</span>") : ""}</p>
            </div>
            
            <!-- Classes -->
            ${currentView === "units" ? `
            <div class="grid grid-cols-2 gap-0.5 w-max">
              ${(item.classes || ["EXEMPLE", "EXEMPLE"]).map(cls => `
                <div class="flex items-center" title="${cls}">
                  <img src="icons/Classes/${cls}.png" class="w-8 h-8 object-contain" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden')">
                  <span class="text-xs text-gray-300 hidden">${cls}</span>
                </div>
              `).join('')}
            </div>
            ` : ''}
            </div>
          </div>
        </div>

        <!-- Droite : Checkbox Possédé -->
        <div class="mb-2">
          <label id="mgr_owned_label" class="flex items-center cursor-pointer rounded border border-transparent transition-all">
            <input type="checkbox" id="mgr_owned" class="form-checkbox h-6 w-6 text-green-500 rounded" ${s.owned ? "checked" : ""} onchange="document.getElementById('mgr_owned_label').classList.remove('border-red-500', 'bg-red-500', 'bg-opacity-20', 'shake')">
            <span class="ml-2 text-white font-bold text-lg">Possédé</span>
          </label>
        </div>
      </div>
    </div>
  `;

  if (currentView === "units") {
    // --- UNIT TABS ---
    html += `
      <div class="flex mb-4 border-b border-gray-600">
        <button class="manager-tab active" onclick="switchManagerTab('stats')">Stats</button>
        <button class="manager-tab" onclick="switchManagerTab('skills')">Compétences</button>
        <button class="manager-tab" onclick="switchManagerTab('pvp')">PVP Rumble</button>
      </div>

      <div id="tab-stats" class="manager-tab-content">
        <div class="grid grid-cols-3 gap-4 mb-4">
          <div>
            <span class="manager-label">LLB <span class="hidden sm:inline">(Level Limit Break)</span></span>
            <select id="mgr_llb" class="manager-input" onchange="updateLevelMax(this)">
              <option value="0" ${s.llb == 0 ? "selected" : ""}>LLB 0 (Max 99)</option>
              <option value="1" ${s.llb == 1 ? "selected" : ""}>LLB 1 (Max 105)</option>
              <option value="2" ${s.llb == 2 ? "selected" : ""}>LLB 2 (Max 110)</option>
              <option value="3" ${s.llb == 3 ? "selected" : ""}>LLB 3 (Max 120)</option>
              <option value="4" ${s.llb == 4 ? "selected" : ""}>LLB 4 (Max 130)</option>
              <option value="5" ${s.llb == 5 ? "selected" : ""}>LLB 5 (Max 150)</option>
            </select>
          </div>
          <div>
            <span class="manager-label">Niveau</span>
            <div class="relative">
              <input type="number" id="mgr_level" value="${s.level || 1}" min="1" max="${currentMaxLv}" oninput="${getLevelInputCode(currentMaxLv)}" style="color: ${getLevelColor(s.level || 1, currentMaxLv)}" class="manager-input pr-12">
            </div>
          </div>
          <div><span class="manager-label">Limit Break</span>
            <select id="mgr_lb" class="manager-input" onchange="updateLBFromStats(this)">
              <option value="0" ${s.lb == 0 ? "selected" : ""}>Aucun</option>
              <option value="1" ${s.lb == 1 ? "selected" : ""}>Max LB</option>
              <option value="2" ${s.lb == 2 ? "selected" : ""}>Max LB+</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-4">
          <div><span class="manager-label">Spécial (Skill Lv)</span><div class="relative"><input type="number" id="mgr_spec" value="${s.spec || 0}" min="0" max="6" ${onInputMax(6)} style="color: ${getMaxColor(s.spec||0, 6)}" class="manager-input pr-12"></div></div>
          <div><span class="manager-label">Soutien (Support)</span><div class="relative"><input type="number" id="mgr_support" value="${s.support || 0}" min="0" max="5" ${onInputMax(5)} style="color: ${getMaxColor(s.support||0, 5)}" class="manager-input pr-12"></div></div>
        </div>

        <h3 class="text-yellow-400 font-bold mb-2 text-sm uppercase">Barbe à Papa (CC) <span class="text-xs text-gray-400 normal-case">(Max 200)</span></h3>
        <div class="grid grid-cols-3 gap-2">
          <div><span class="manager-label text-green-400">HP</span><div class="relative"><input type="number" id="mgr_ccHp" value="${s.ccHp || 0}" max="200" ${onInputMax(200)} style="color: ${getMaxColor(s.ccHp||0, 200)}" class="manager-input pr-12"></div></div>
          <div><span class="manager-label text-red-400">ATK</span><div class="relative"><input type="number" id="mgr_ccAtk" value="${s.ccAtk || 0}" max="200" ${onInputMax(200)} style="color: ${getMaxColor(s.ccAtk||0, 200)}" class="manager-input pr-12"></div></div>
          <div><span class="manager-label text-yellow-400">RCV</span><div class="relative"><input type="number" id="mgr_ccRcv" value="${s.ccRcv || 0}" max="200" ${onInputMax(200)} style="color: ${getMaxColor(s.ccRcv||0, 200)}" class="manager-input pr-12"></div></div>
        </div>
      </div>

      <div id="tab-skills" class="manager-tab-content hidden">
        <h3 class="text-green-400 font-bold mb-2 text-sm uppercase">Pouvoirs (Sockets)</h3>
        <div class="grid grid-cols-5 gap-2 mb-4 relative">
          ${[1,2,3,4,5].map(i => `
            <div class="flex flex-col items-center bg-gray-900 p-2 rounded border border-gray-700">
              <div class="relative w-10 h-10 mb-2 cursor-pointer hover:scale-110 transition" onclick="openSocketSelector(${i})">
                <img src="./icons/Pouvoirs/${s[`socket${i}Type`] || 'Vide'}.png" 
                     id="mgr_sockImg${i}"
                     class="w-full h-full object-contain" 
                     onerror="this.onerror=null; this.src='./icons/Pouvoirs/vide.png'">
              </div>
              <input type="hidden" id="mgr_sockType${i}" value="${s[`socket${i}Type`] || ''}">
              <div class="relative w-full">
                <input type="number" id="mgr_sockLv${i}" value="${s[`socket${i}Type`] ? (s[`socket${i}Lv`] || 0) : 0}" min="0" max="5" ${onInputMax(5)} style="color: ${getMaxColor(s[`socket${i}Type`] ? (s[`socket${i}Lv`] || 0) : 0, 5)}" class="manager-input text-center">
              </div>
            </div>
          `).join('')}
          <div id="socketSelector" class="hidden absolute top-0 left-0 w-full min-h-full bg-gray-900 bg-opacity-95 z-20 flex flex-col items-center justify-center rounded-lg p-4 border border-gray-600">
            <h4 class="text-white font-bold mb-4">Choisir un pouvoir</h4>
            <div id="socketOptions" class="grid grid-cols-4 gap-4"></div>
            <div class="flex gap-4 mt-4">
              <button onclick="selectSocket(document.getElementById('socketSelector').dataset.slot, '')" class="text-red-400 hover:text-white border border-red-400 px-3 py-1 rounded text-sm">Retirer</button>
              <button onclick="document.getElementById('socketSelector').classList.add('hidden')" class="text-gray-400 hover:text-white border border-gray-400 px-3 py-1 rounded text-sm">Retour</button>
            </div>
          </div>
        </div>
        <h3 class="text-purple-400 font-bold mb-2 text-sm uppercase">Potentiels (Tablettes)</h3>
        <div class="grid grid-cols-3 gap-2">
          ${(item.potentials || ["EXEMPLE", "EXEMPLE", "EXEMPLE"]).map((name, i) => `
            <div class="flex flex-col items-center">
              <img src="icons/Potential Abilities/${name}.png" 
                   class="w-8 h-8 mb-1 object-contain" 
                   title="${name}"
                   onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
              <span class="manager-label truncate w-full text-center text-xs" style="display:none;">${name}</span>
              <div class="relative w-full">
                <input type="number" id="mgr_pot${i+1}" value="${s[`pot${i+1}`] || 1}" min="1" max="5" ${onInputMax(5)} style="color: ${getMaxColor(s[`pot${i+1}`]||1, 5)}" class="manager-input pr-12">
              </div>
            </div>
          `).join('')}
        </div>

        <h3 class="text-indigo-400 font-bold mb-2 text-sm uppercase mt-4">Limit Break</h3>
        <div class="bg-gray-900 p-3 rounded border border-gray-700 mb-4">
          <div class="flex justify-between items-center mb-2">
            <span class="manager-label text-indigo-400 font-bold uppercase text-sm">Niveau Limit Break</span>
            <span id="lb_level_display" class="font-bold" style="color: ${(s.lbLevel || 0) >= 31 ? '#ff0000' : 'white'}">${(s.lbLevel || 0) === 40 ? "MAX" : "Lv. " + (s.lbLevel || 0)}</span>
          </div>
          <div class="relative h-24 mt-6"> <!-- Main container for slider and milestones -->
            <!-- Slider -->
            <input type="range" id="mgr_lbLevel" min="0" max="40" value="${s.lbLevel || 0}" 
                   class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer absolute bottom-0" 
                   style="background: linear-gradient(to right, ${(s.lbLevel || 0) >= 31 ? '#ff0000' : '#ffa500'} 0%, ${(s.lbLevel || 0) >= 31 ? '#ff0000' : '#ffa500'} ${(s.lbLevel || 0)/40*100}%, #374151 ${(s.lbLevel || 0)/40*100}%, #374151 100%); accent-color: ${(s.lbLevel || 0) >= 31 ? '#ff0000' : '#ffa500'}"
                   oninput="updateLBUI(this.value)">
            
            <!-- Milestones (icons and dots) -->
            ${lbMilestones.map(m => {
              // This calc formula aligns the milestones with the slider's thumb position, assuming a 16px thumb width.
              const posCalc = `calc((100% - 16px) * ${m.level / 40} + 8px)`;
              // Decaler la clé (Lv 31) vers le haut pour éviter le chevauchement
              const bottomClass = m.level === 31 ? "bottom-16" : "bottom-6";
              return `
              <div class="absolute ${bottomClass} transform -translate-x-1/2" style="left: ${posCalc}" title="${m.label} (Lv.${m.level})">
                <img src="icons/Limit Break/${m.icon}" 
                     id="lb_icon_${m.level}" 
                     onclick="setLBSlider(${m.level})"
                     class="w-8 h-8 object-cover rounded-md transition-all duration-200 cursor-pointer ${(s.lbLevel || 0) >= m.level ? '' : 'opacity-30 grayscale hover:opacity-60'}">
              </div>
              <div class="absolute bottom-0 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full cursor-pointer z-10" 
                   style="left: ${posCalc}"
                   onclick="setLBSlider(${m.level})">
              </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <div id="tab-pvp" class="manager-tab-content hidden">
        <h3 class="text-blue-400 font-bold mb-2 text-sm uppercase">Pirate Rumble</h3>
        <div class="space-y-3">
          <div><span class="manager-label">Coup spécial de la Fête des pirates</span><div class="relative"><input type="number" id="mgr_rumbleSpec" value="${s.rumbleSpec || 1}" min="1" max="10" ${onInputMax(10)} style="color: ${getMaxColor(s.rumbleSpec||1, 10)}" class="manager-input pr-12"></div></div>
          <div><span class="manager-label">Capacité de la Fête des pirates</span><div class="relative"><input type="number" id="mgr_rumbleAb" value="${s.rumbleAb || 1}" min="1" max="5" ${onInputMax(5)} style="color: ${getMaxColor(s.rumbleAb||1, 5)}" class="manager-input pr-12"></div></div>
          <div><span class="manager-label">Déchainement Grande Fête</span><div class="relative"><input type="number" id="mgr_rumbleRes" value="${s.rumbleRes || 1}" min="1" max="5" ${onInputMax(5)} style="color: ${getMaxColor(s.rumbleRes||1, 5)}" class="manager-input pr-12"></div></div>
        </div>
      </div>
    `;
  } else {
    // --- SHIP VIEW ---
    const shipLv = s.level || (s.max ? 12 : 1);
    const isSpecial = SPECIAL_SHIP_IDS.includes(id);
    
    // Parsing des stats (Number ou String "X/X/X")
    let statsArr = [0, 0, 0];
    if (typeof s.stats === 'number') statsArr = [s.stats, s.stats, s.stats];
    else if (typeof s.stats === 'string') {
      const parts = s.stats.split('/');
      if (parts.length === 3) statsArr = parts.map(p => parseInt(p) || 0);
    }

    // Helper pour générer un input de stat
    const renderStatInput = (idx, val) => {
      const isRainbow = val === 5;
      const colorStyle = isRainbow ? '' : `color: ${getColaColor(val)}`;
      const rainbowClass = isRainbow ? 'text-rainbow' : '';
      return `
        <input type="text" inputmode="numeric" id="mgr_ship_stat${idx}" value="${val}" 
               class="bg-transparent w-4 font-bold outline-none ${rainbowClass}" 
               style="${colorStyle}" 
               onfocus="this.select()"
               onclick="this.select()"
               oninput="updateShipStatInput(this, ${idx < 3 ? idx + 1 : 0})">
      `;
    };

    if (isSpecial) {
      html += `
        <div class="grid grid-cols-2 gap-6">
          <div>
            <span class="manager-label text-lg mb-2">Niveau du Bateau</span>
            <input type="text" value="MAX" disabled class="manager-input text-xl p-2 text-center font-bold" style="color: #ff0000; border-color: #ff0000;">
            <p class="text-xs text-gray-500 mt-1">Niveau Unique</p>
          </div>
          <div>
            <span class="manager-label text-lg mb-2">Stats (Cola)</span>
            <div class="manager-input flex items-center justify-center text-xl p-2 text-gray-500 italic">
              Non disponible
            </div>
          </div>
        </div>
      `;
    } else {
      const statsDisabled = shipLv < 12;
      html += `
        <div class="grid grid-cols-2 gap-6">
          <div>
            <span class="manager-label text-lg mb-2">Niveau du Bateau</span>
            <input type="number" id="mgr_ship_level" value="${shipLv}" min="1" max="12" class="manager-input text-xl p-2" style="color: ${shipLv >= 11 ? '#ff0000' : (shipLv === 10 ? '#ffa500' : 'white')}" oninput="handleShipLevelChange(this)">
            <p class="text-xs text-gray-500 mt-1">Max: 12</p>
          </div>
          <div id="shipStatsContainer" class="transition-opacity duration-300" style="opacity: ${statsDisabled ? '0.5' : '1'}; pointer-events: ${statsDisabled ? 'none' : 'auto'};">
            <span class="manager-label text-lg mb-2">Stats (Cola)</span>
            <div class="manager-input flex items-center justify-start text-xl p-2">
              ${renderStatInput(1, statsArr[0])}
              <span class="text-white -ml-1">/</span>
              ${renderStatInput(2, statsArr[1])}
              <span class="text-white -ml-1">/</span>
              ${renderStatInput(3, statsArr[2])}
            </div>
            <p class="text-xs text-gray-500 mt-1">${statsDisabled ? 'Niveau 12 requis' : 'Max: 5 par stat'}</p>
          </div>
        </div>
      `;
    }
  }

  // Footer Save
  html += `
    <div class="mt-6 pt-4 border-t border-gray-600 flex justify-end">
      <button onclick="saveManagerData(${id})" class="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-bold shadow-lg transition">Enregistrer</button>
    </div>
  `;

  managerContent.innerHTML = html;
  managerModal.classList.remove("hidden");
  document.body.classList.add("no-scroll");
}

function closeManagerModal() {
  managerModal.classList.add("hidden");
  document.body.classList.remove("no-scroll");
}

function switchManagerTab(tabName) {
  document.querySelectorAll('.manager-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.manager-tab-content').forEach(c => c.classList.add('hidden'));
  
  // Trouver le bouton cliqué (event.target est plus sûr si passé, mais ici on simplifie)
  const buttons = document.querySelectorAll('.manager-tab');
  if(tabName === 'stats') buttons[0].classList.add('active');
  if(tabName === 'skills') buttons[1].classList.add('active');
  if(tabName === 'pvp') buttons[2].classList.add('active');

  document.getElementById(`tab-${tabName}`).classList.remove('hidden');
}

function saveManagerData(id) {
  // Validation : Si des stats sont modifiées mais "Possédé" non coché
  const isOwnedChecked = document.getElementById("mgr_owned").checked;
  
  if (!isOwnedChecked) {
    let isModified = false;
    
    if (currentView === "units") {
      // Vérification des champs Unités (si > valeur par défaut)
      if ((parseInt(document.getElementById("mgr_level").value) || 1) > 1) isModified = true;
      if ((parseInt(document.getElementById("mgr_llb").value) || 0) > 0) isModified = true;
      if ((parseInt(document.getElementById("mgr_lb").value) || 0) > 0) isModified = true;
      
      if ((parseInt(document.getElementById("mgr_ccHp").value) || 0) > 0) isModified = true;
      if ((parseInt(document.getElementById("mgr_ccAtk").value) || 0) > 0) isModified = true;
      if ((parseInt(document.getElementById("mgr_ccRcv").value) || 0) > 0) isModified = true;
      
      if ((parseInt(document.getElementById("mgr_spec").value) || 0) > 0) isModified = true;
      if ((parseInt(document.getElementById("mgr_support").value) || 0) > 0) isModified = true;
      
      if ((parseInt(document.getElementById("mgr_lbLevel").value) || 0) > 0) isModified = true;
      
      if ((parseInt(document.getElementById("mgr_rumbleSpec").value) || 1) > 1) isModified = true;
      if ((parseInt(document.getElementById("mgr_rumbleAb").value) || 1) > 1) isModified = true;
      if ((parseInt(document.getElementById("mgr_rumbleRes").value) || 1) > 1) isModified = true;

      // Sockets et Potentiels
      for(let i=1; i<=5; i++) { const el = document.getElementById(`mgr_sockType${i}`); if (el && el.value) isModified = true; }
      for(let i=1; i<=3; i++) { const el = document.getElementById(`mgr_pot${i}`); if (el && (parseInt(el.value) || 0) > 0) isModified = true; }

    } else {
      // Vérification des champs Bateaux
      if (!SPECIAL_SHIP_IDS.includes(id)) {
        if ((parseInt(document.getElementById("mgr_ship_level").value) || 1) > 1) isModified = true;
        if ((parseInt(document.getElementById("mgr_ship_stat1").value) || 0) > 0) isModified = true;
        if ((parseInt(document.getElementById("mgr_ship_stat2").value) || 0) > 0) isModified = true;
        if ((parseInt(document.getElementById("mgr_ship_stat3").value) || 0) > 0) isModified = true;
      }
    }

    if (isModified) {
      const label = document.getElementById("mgr_owned_label");
      if (label) {
        label.classList.remove("shake");
        void label.offsetWidth; // Trigger reflow pour relancer l'animation
        label.classList.add("border-red-500", "bg-red-500", "bg-opacity-20", "shake");
        setTimeout(() => label.classList.remove("shake"), 500);
      }
      return; // Bloque l'enregistrement
    }
  }

  const currentState = currentView === "units" ? state : shipState;
  // On s'assure que l'objet existe
  if (!currentState[id]) currentState[id] = {};
  const s = currentState[id];

  // Common
  s.owned = isOwnedChecked;

  if (currentView === "units") {
    s.level = parseInt(document.getElementById("mgr_level").value) || 1;
    s.llb = parseInt(document.getElementById("mgr_llb").value) || 0;
    s.lb = parseInt(document.getElementById("mgr_lb").value) || 0;
    
    // Sync visuel Rainbow/Super Rainbow selon LB ET Potentiels
    let maxPots = true;
    const inp1 = document.getElementById("mgr_pot1");
    const inp2 = document.getElementById("mgr_pot2");
    const inp3 = document.getElementById("mgr_pot3");

    if (!inp1) maxPots = false; // Pas de potentiels = pas de rainbow
    else {
      if ((parseInt(inp1.value) || 0) < 5) maxPots = false;
      if (inp2 && (parseInt(inp2.value) || 0) < 5) maxPots = false;
      if (inp3 && (parseInt(inp3.value) || 0) < 5) maxPots = false;
    }

    if (s.lb === 1 && maxPots) { s.ft = true; s.sft = false; }
    else if (s.lb === 2 && maxPots) { s.ft = false; s.sft = true; }
    else { s.ft = false; s.sft = false; }

    s.ccHp = parseInt(document.getElementById("mgr_ccHp").value) || 0;
    s.ccAtk = parseInt(document.getElementById("mgr_ccAtk").value) || 0;
    s.ccRcv = parseInt(document.getElementById("mgr_ccRcv").value) || 0;
    
    s.spec = parseInt(document.getElementById("mgr_spec").value) || 0;
    s.support = parseInt(document.getElementById("mgr_support").value) || 0;
    
    // Sauvegarde des Sockets
    for(let i=1; i<=5; i++) {
      const t = document.getElementById(`mgr_sockType${i}`);
      const l = document.getElementById(`mgr_sockLv${i}`);
      if(t) s[`socket${i}Type`] = t.value;
      if(l) s[`socket${i}Lv`] = parseInt(l.value) || 0;
    }

    s.pot1 = document.getElementById("mgr_pot1") ? (parseInt(document.getElementById("mgr_pot1").value) || 0) : (s.pot1 || 0);
    s.pot2 = document.getElementById("mgr_pot2") ? (parseInt(document.getElementById("mgr_pot2").value) || 0) : (s.pot2 || 0);
    s.pot3 = document.getElementById("mgr_pot3") ? (parseInt(document.getElementById("mgr_pot3").value) || 0) : (s.pot3 || 0);
    
    s.rumbleSpec = parseInt(document.getElementById("mgr_rumbleSpec").value) || 1;
    s.rumbleAb = parseInt(document.getElementById("mgr_rumbleAb").value) || 1;
    s.rumbleRes = parseInt(document.getElementById("mgr_rumbleRes").value) || 1;

    s.lbLevel = parseInt(document.getElementById("mgr_lbLevel").value) || 0;
  } else {
    if (SPECIAL_SHIP_IDS.includes(id)) {
      s.level = 1;
      s.stats = 0;
      s.max = true;
    } else {
      s.level = parseInt(document.getElementById("mgr_ship_level").value) || 1;
      const st1 = document.getElementById("mgr_ship_stat1").value || 0;
      const st2 = document.getElementById("mgr_ship_stat2").value || 0;
      const st3 = document.getElementById("mgr_ship_stat3").value || 0;
      s.stats = `${st1}/${st2}/${st3}`;
      s.max = (s.level === 12);
    }
  }

  saveState();
  updateCardUI(id);
  updateProgress();
  closeManagerModal();
}

// ✅ Modal de Filtres (Grand Format)
function openFilterModal() {
  const modal = document.getElementById("filterModal");
  const container = document.getElementById("filterContent");
  if (!container) return;

  // --- Helper pour créer une section de filtre ---
  const createFilterSection = (title, items, filterType, currentFilterValue) => {
    let sectionHTML = `<h4 class="filter-section-title text-lg text-gray-300 border-gray-600 mt-4 mb-2">${title}</h4>`;
    
    if (filterType === 'owned') {
      sectionHTML += `<div class="flex gap-4 mb-4">
        <button data-filter-type="owned" data-value="all" class="flex-1 header-btn text-base py-2 !bg-blue-600 hover:!bg-blue-500 text-white transition-all ${currentFilterValue === 'all' ? 'ring-2 ring-white font-bold scale-105' : 'opacity-60 hover:opacity-100'}">Tous</button>
        <button data-filter-type="owned" data-value="owned" class="flex-1 header-btn text-base py-2 !bg-green-600 hover:!bg-green-500 text-white transition-all ${currentFilterValue === 'owned' ? 'ring-2 ring-white font-bold scale-105' : 'opacity-60 hover:opacity-100'}">Possédés</button>
        <button data-filter-type="owned" data-value="not-owned" class="flex-1 header-btn text-base py-2 !bg-red-600 hover:!bg-red-500 text-white transition-all ${currentFilterValue === 'not-owned' ? 'ring-2 ring-white font-bold scale-105' : 'opacity-60 hover:opacity-100'}">Non-Possédés</button>
      </div>`;
      return sectionHTML;
    }

    sectionHTML += '<div class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-3">';
    // Bouton "Tous"
    sectionHTML += `
      <button data-filter-type="${filterType}" data-value="all" class="filter-icon-btn p-2 flex flex-col items-center justify-center gap-1 h-20 ${currentFilterValue.includes('all') ? 'active ring-2 ring-blue-500 bg-gray-700' : ''}" title="Tous">
        <img src="icons/types/TOUTES.png" class="w-10 h-10 object-contain">
        <span class="text-xs text-gray-300">Tous</span>
      </button>`;
    
    // Boutons pour chaque item
    items.forEach(item => {
      const iconPath = filterType === 'attribute' ? `icons/types/${item}.png`
                     : filterType === 'class' ? `icons/Classes/${item}.png`
                     : filterType === 'category' ? `icons/categories/${item}.png`
                     : `icons/Potential Abilities/${item}.png`;
      
      let customClass = "";
      let activeRing = "ring-yellow-400";
      
      if (filterType === 'attribute') {
        if (item === 'STR') { customClass = "!border-red-600"; activeRing = "ring-red-600"; }
        if (item === 'DEX') { customClass = "!border-green-600"; activeRing = "ring-green-600"; }
        if (item === 'QCK') { customClass = "!border-blue-600"; activeRing = "ring-blue-600"; }
        if (item === 'PSY') { customClass = "!border-yellow-500"; activeRing = "ring-yellow-500"; }
        if (item === 'INT') { customClass = "!border-purple-600"; activeRing = "ring-purple-600"; }
      }

      const isSelected = (filterType === 'attribute') 
        ? currentFilterValue.includes(item.toLowerCase()) 
        : currentFilterValue.includes(item);

      sectionHTML += `
        <button data-filter-type="${filterType}" data-value="${item}" class="filter-icon-btn p-2 flex flex-col items-center justify-center gap-1 h-20 ${customClass} ${isSelected ? `active ring-2 ${activeRing} bg-gray-700` : ''}" title="${item}">
          <img src="${iconPath}" class="w-10 h-10 object-contain" onerror="this.style.display='none'; this.parentElement.innerHTML += '<span class=\'text-xs\'>${item.substring(0,5)}</span>'">
        </button>`;
    });
    sectionHTML += '</div>';
    return sectionHTML;
  };

  // --- Récupération des données uniques ---
  const attributes = ["STR", "DEX", "QCK", "PSY", "INT"];
  const classes = ["Cogneur","Sabreur","Ravageur","Tireur","Libre","Ambitieux","Intellectuel","Tenace"];
  const categories = [
    "Sugo Fest - Super",
    "Sugo Fest - Anniversaire",
    "Sugo Fest - PvP",
    "Sugo Fest - TM",
    "Sugo Fest - Kizuna",
    "Sugo Fest - Bazar",
    "Sugo Fest - Premium"
  ];
  
  // Liste statique complète des Potentiels pour garantir l'affichage de toutes les icônes
  const potentials = [
    "Reduction des degats STR", 
    "Reduction des degats DEX", 
    "Reduction des degats QCK", 
    "Reduction des degats PSY", 
    "Reduction des degats INT", 
    "Attaque critique", 
    "Augmentation d'ATK en cas de degats subis et de resistance au augmentations de degats", 
    "Soin d'urgence", 
    "Transpercement des barrieres", 
    "Lien des cercles", 
    "Resistance a reduction des soins", 
    "Double utilisation du coup special", 
    "Reduction du temps de chargement du coup special du personnage", 
    "Resistance a aptitude du bateau annulee",
    "Rush",
    "Super Tandem - Last Tap",
    "Super Tandem",
    "Resistance a changement de cercles impossible",
    "Resistance a limitation d'utilisations des coups speciaux",
    "Resistance a desespoir des coequipiers",
    "Resistance a augmentations de l'ATK lors de soins - Affamé",
    "Last Tap",
    "Soin impossible",
    "Triple utilisation du coup special",
    "Super Tandem Boost",
    "Depassement de limite de Degats - Type",
    "Depassement de limite de Degats - Classe"
  ].sort();

  // --- Construction du HTML complet ---
  let fullHTML = `
    <div class="relative flex justify-between items-center bg-gray-800 z-50 border-2 border-black p-3 rounded-lg m-2 md:m-6 md:mb-0 md:border-0 md:border-b md:border-gray-600 md:p-0 md:pb-4 md:rounded-none shadow-lg shrink-0">
      <h2 class="text-3xl font-bold text-white flex items-center gap-3">
        <img src="icons/ui/Filtres.png" class="w-10 h-10 object-contain"> Filtres
      </h2>
      <button onclick="closeFilterModal()" class="text-gray-400 hover:text-white text-4xl">&times;</button>
    </div>
    <div class="space-y-6 overflow-y-auto p-2 md:p-6 flex-1 min-h-0 custom-scrollbar" style="overscroll-behavior: contain;">
  `;

  fullHTML += createFilterSection('Possession', [], 'owned', ownedFilter);
  if (currentView === "units") {
    fullHTML += createFilterSection('Affinités', attributes, 'attribute', attributeFilter);
    fullHTML += createFilterSection('Classes', classes, 'class', classFilter);
    fullHTML += createFilterSection('Catégories', categories, 'category', categoryFilter);
    fullHTML += createFilterSection('Potentiels', potentials, 'potential', potentialFilter);
  }

  fullHTML += `</div>`; // Fin du contenu défilant

  // Footer avec Reset
  fullHTML += `
    <div class="relative bg-gray-800 z-50 border-2 border-black p-3 rounded-lg m-2 md:m-6 md:mt-0 flex justify-center gap-4 md:border-0 md:border-t md:border-gray-600 md:pt-4 md:pb-6 md:p-0 md:rounded-none shadow-lg shrink-0">
      <button id="resetFiltersBtn" class="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-bold transition shadow-lg">Réinitialiser tout</button>
      <button onclick="closeFilterModal()" class="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded font-bold transition shadow-lg">Fermer</button>
    </div>
  `;

  container.innerHTML = fullHTML;

  // --- Ajout des Event Listeners ---
  container.querySelectorAll('button[data-filter-type]').forEach(button => {
    button.addEventListener('click', () => {
      // Récupération des valeurs
      const type = button.dataset.filterType;
      const value = button.dataset.value;

      if (type === 'owned') {
         ownedFilter = value;
         // Mise à jour UI pour Owned (Single Select)
         container.querySelectorAll(`button[data-filter-type="owned"]`).forEach(btn => {
            btn.classList.remove('active', 'ring-2', 'ring-white', 'font-bold', 'scale-105', 'border-blue-500', 'bg-blue-900', 'border-green-500', 'bg-green-900', 'border-red-500', 'bg-red-900');
            btn.classList.add('opacity-60');
         });
         button.classList.remove('opacity-60');
         button.classList.add('ring-2', 'ring-white', 'font-bold', 'scale-105');
      } else {
         // Gestion Multi-Select (3 Max, FIFO)
         const updateSelection = (currentArr, val) => {
            if (val === 'all') return ['all'];
            let newArr = currentArr.filter(x => x !== 'all');
            if (newArr.includes(val)) {
               newArr = newArr.filter(x => x !== val); // Désélectionner
            } else {
               newArr.push(val); // Sélectionner
               if (newArr.length > 3) newArr.shift(); // FIFO: retire le premier si > 3
            }
            if (newArr.length === 0) return ['all'];
            return newArr;
         };

         if (type === 'attribute') attributeFilter = updateSelection(attributeFilter, value.toLowerCase());
         if (type === 'class') classFilter = updateSelection(classFilter, value);
         if (type === 'category') categoryFilter = updateSelection(categoryFilter, value);
         if (type === 'potential') potentialFilter = updateSelection(potentialFilter, value);

         // Mise à jour UI pour Multi-Select
         const currentArr = (type === 'attribute') ? attributeFilter : (type === 'class' ? classFilter : (type === 'category' ? categoryFilter : potentialFilter));
         
         container.querySelectorAll(`button[data-filter-type="${type}"]`).forEach(btn => {
            const btnVal = btn.dataset.value;
            const isActive = (type === 'attribute') ? currentArr.includes(btnVal.toLowerCase()) : currentArr.includes(btnVal);
            
            btn.classList.remove('active', 'ring-2', 'ring-blue-500', 'bg-gray-700', 'ring-yellow-400', 'ring-red-600', 'ring-green-600', 'ring-purple-600', 'ring-yellow-500');
            
            if (isActive) {
               let ringClass = 'ring-yellow-400';
               if (btnVal === 'all') ringClass = 'ring-blue-500';
               if (type === 'attribute') {
                  if (btnVal === 'STR') ringClass = 'ring-red-600';
                  if (btnVal === 'DEX') ringClass = 'ring-green-600';
                  if (btnVal === 'QCK') ringClass = 'ring-blue-600';
                  if (btnVal === 'PSY') ringClass = 'ring-yellow-500';
                  if (btnVal === 'INT') ringClass = 'ring-purple-600';
               }
               btn.classList.add('active', 'ring-2', ringClass, 'bg-gray-700');
            }
         });
      }

      applyFilters();
    });
  });
  
  document.getElementById('resetFiltersBtn').addEventListener('click', () => {
    ownedFilter = "all";
    attributeFilter = ["all"];
    classFilter = ["all"];
    categoryFilter = ["all"];
    potentialFilter = ["all"];
    applyFilters();
    openFilterModal(); // Re-render
  });

  if (modal) modal.classList.remove("hidden");
  document.body.classList.add('no-scroll'); // 🔒 Bloque le scroll du site
}

function closeFilterModal() {
  const modal = document.getElementById("filterModal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove('no-scroll'); // 🔓 Débloque le scroll du site
}

// Fermer le modal si on clique en dehors
window.addEventListener('click', (e) => {
  const modal = document.getElementById("filterModal");
  if (e.target === modal) closeFilterModal();

  const mgrModal = document.getElementById("managerModal");
  if (e.target === mgrModal) closeManagerModal();
});

// 🚀 Initialisation
window.addEventListener("DOMContentLoaded", () => {
  // 0. Switch View Button
  const switchBtn = document.getElementById("viewSwitchBtn");
  if (switchBtn) switchBtn.addEventListener("click", toggleView);

  const toggleArtworkBtn = document.getElementById("toggleArtworkBtn");

  // 1. Artwork - Initialisation
  if (toggleArtworkBtn) {
    toggleArtworkBtn.classList.add('rounded-lg', 'flex', 'items-center', 'justify-center');
    toggleArtworkBtn.innerHTML = '<img src="icons/ui/OFF.png" class="w-5 h-5 mr-2"> Artwork OFF';
    
    toggleArtworkBtn.addEventListener("click", () => {
      artworkEnabled = !artworkEnabled;
      toggleArtworkBtn.innerHTML = artworkEnabled 
        ? '<img src="icons/ui/ON.png" class="w-5 h-5 mr-2"> Artwork ON' 
        : '<img src="icons/ui/OFF.png" class="w-5 h-5 mr-2"> Artwork OFF';
      toggleArtworkBtn.classList.toggle("active", artworkEnabled);

      document.querySelectorAll('button[onclick*="setMode"]').forEach(btn => {
        btn.disabled = artworkEnabled;
        btn.style.opacity = artworkEnabled ? "0.5" : "1";
        btn.style.cursor = artworkEnabled ? "not-allowed" : "pointer";
      });
      applyFilters();
    });
  }

  // 2. Modes avec icônes
  if (currentView === "ships") {
    const btn = document.getElementById("viewSwitchBtn");
    const iconUnits = document.getElementById("icon-units");
    const iconShip = document.getElementById("icon-ship");
    const filterBtn = document.getElementById("masterFilterBtn");

    if (btn) btn.innerHTML = '<img src="icons/ui/units.png" class="w-5 h-5 object-contain"> Unités';
    if (iconUnits) iconUnits.classList.add("hidden");
    if (iconShip) iconShip.classList.remove("hidden");
  }
  updateModeButtons();

  // 4. Recherche
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      searchTerm = e.target.value;
      applyFilters();
    });
  }

  // 5. Système
  const systemBtns = { 'exportCollection()': exportCollection, 'importCollection()': importCollection, 'resetAll()': resetAll };
  document.querySelectorAll('button[onclick]').forEach(btn => {
    const attr = btn.getAttribute('onclick');
    if (systemBtns[attr]) {
      btn.onclick = null;
      btn.addEventListener('click', (e) => { e.preventDefault(); systemBtns[attr](); });
    }
  });

  buildCards();
  setMode('manager');
  updateProgress();
});
