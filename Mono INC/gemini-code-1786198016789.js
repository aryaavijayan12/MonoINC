const PROPERTY_GROUPS = {
    Azure: '#38bdf8',
    Rose: '#f43f5e',
    Amber: '#f59e0b',
    Emerald: '#10b981',
    Ruby: '#dc2626',
    Violet: '#8b5cf6'
};

const BOARD_LAYOUT = [
    { id: 0, name: "START", type: "start", price: 0, rent: 0 },
    { id: 1, name: "Harbor Walk", type: "property", group: "Azure", price: 100, rent: 15 },
    { id: 2, name: "Maple Street", type: "property", group: "Azure", price: 120, rent: 20 },
    { id: 3, name: "Rest Oasis", type: "rest", price: 0, rent: 0 },
    { id: 4, name: "Cedar Avenue", type: "property", group: "Rose", price: 140, rent: 25 },
    { id: 5, name: "Orchid Lane", type: "property", group: "Rose", price: 160, rent: 30 },

    { id: 6, name: "Market Hub", type: "market_hub", price: 0, rent: 0 },
    { id: 7, name: "Riverfront", type: "property", group: "Amber", price: 180, rent: 35 },
    { id: 8, name: "Sunset Road", type: "property", group: "Amber", price: 200, rent: 40 },
    { id: 9, name: "Free Exchange", type: "rest", price: 0, rent: 0 },
    { id: 10, name: "Central Plaza", type: "property", group: "Emerald", price: 220, rent: 45 },
    { id: 11, name: "Lakeside Drive", type: "property", group: "Emerald", price: 240, rent: 50 },

    { id: 12, name: "Credit Hall", type: "rest", price: 0, rent: 0 },
    { id: 13, name: "Grand Market", type: "property", group: "Ruby", price: 260, rent: 55 },
    { id: 14, name: "Kingsway", type: "property", group: "Ruby", price: 280, rent: 60 },
    { id: 15, name: "Audit Station", type: "rest", price: 0, rent: 0 },
    { id: 16, name: "Skyline", type: "property", group: "Violet", price: 320, rent: 70 },

    { id: 17, name: "Garden District", type: "property", group: "Violet", price: 350, rent: 80 },
    { id: 18, name: "Trade Square", type: "rest", price: 0, rent: 0 },
    { id: 19, name: "Apex Heights", type: "property", group: "Violet", price: 400, rent: 100 }
];

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

let db = null;
let isRealtime = false;
let roomCode = null;
let playerId = null;
let playerName = "";
let gameState = null;

window.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    renderBoard();
    loadLocalName();
    checkUrlForRoomCode();
});

function initFirebase() {
    const banner = document.getElementById('connection-status');
    if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY") {
        try {
            firebase.initializeApp(window.FIREBASE_CONFIG);
            db = firebase.database();
            isRealtime = true;
            banner.className = "status-banner live";
            banner.innerText = "🟢 Realtime Multiplayer Active";
        } catch (e) {
            console.error("Firebase init failed:", e);
        }
    }
}

function loadLocalName() {
    const savedName = localStorage.getItem('trustopoly_player_name');
    if (savedName) document.getElementById('player-name').value = savedName;
}

function checkUrlForRoomCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('room');
    if (code) {
        switchHomeTab('join');
        document.getElementById('join-code').value = code.toUpperCase();
    }
}

function switchHomeTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    if (tab === 'create') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('tab-create').classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('tab-join').classList.add('active');
    }
}

function getValidatedName() {
    const nameInput = document.getElementById('player-name').value.trim();
    if (!nameInput) {
        alert("Please enter your name before proceeding.");
        return null;
    }
    localStorage.setItem('trustopoly_player_name', nameInput);
    return nameInput;
}

function createGame() {
    const name = getValidatedName();
    if (!name) return;
    playerName = name;
    playerId = 'p_' + Math.random().toString(36).substr(2, 9);
    roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const maxP = parseInt(document.getElementById('max-players').value, 10);

    const initialState = {
        roomId: roomCode,
        hostId: playerId,
        status: 'lobby',
        maxPlayers: maxP,
        phase: 'setup',
        round: 1,
        currentTurnIndex: 0,
        players: {
            [playerId]: { id: playerId, name: playerName, money: 1250, position: 0, color: PLAYER_COLORS[0], setupFinished: false, bankrupt: false }
        },
        properties: initializePropertiesState(),
        trusts: {},
        loans: {},
        auction: null,
        trades: {},
        logs: [`Room created by ${playerName}`]
    };

    saveGameState(initialState);
    enterLobby();
}

function joinGame() {
    const name = getValidatedName();
    if (!name) return;
    playerName = name;
    const codeInput = document.getElementById('join-code').value.trim().toUpperCase();
    if (!codeInput) { alert("Please enter a game code."); return; }
    
    roomCode = codeInput;
    playerId = 'p_' + Math.random().toString(36).substr(2, 9);

    if (isRealtime) {
        db.ref('games/' + roomCode).once('value', snapshot => {
            if (!snapshot.exists()) { alert("Game room not found!"); return; }
            const state = snapshot.val();
            const pKeys = Object.keys(state.players || {});
            if (pKeys.length >= state.maxPlayers) { alert("Game room is full!"); return; }

            const color = PLAYER_COLORS[pKeys.length % PLAYER_COLORS.length];
            db.ref(`games/${roomCode}/players/${playerId}`).set({
                id: playerId, name: playerName, money: 1250, position: 0, color: color, setupFinished: false, bankrupt: false
            });
            addLog(`${playerName} joined the room.`);
            enterLobby();
        });
    } else {
        alert("Running in Demo Mode. Simulating instant join.");
        enterLobby();
    }
}

function initializePropertiesState() {
    const props = {};
    BOARD_LAYOUT.forEach(cell => {
        if (cell.type === 'property') {
            props[cell.id] = {
                id: cell.id, name: cell.name, group: cell.group, price: cell.price, rent: cell.rent,
                ownerId: null, trustId: null, market: false
            };
        }
    });
    return props;
}

function enterLobby() {
    switchScreen('screen-lobby');
    document.getElementById('lobby-code-val').innerText = roomCode;
    listenToGameState();
}

function copyGameLink() {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(url);
    alert("Shareable game link copied to clipboard!");
}

function saveGameState(newState) {
    gameState = newState;
    if (isRealtime && roomCode) {
        db.ref('games/' + roomCode).set(newState);
    } else {
        renderApp();
    }
}

function listenToGameState() {
    if (isRealtime && roomCode) {
        db.ref('games/' + roomCode).on('value', snapshot => {
            if (snapshot.exists()) {
                gameState = snapshot.val();
                renderApp();
            }
        });
    } else {
        renderApp();
    }
}

function updateState(path, value) {
    if (isRealtime && roomCode) {
        db.ref(`games/${roomCode}/${path}`).set(value);
    } else {
        const parts = path.split('/');
        let curr = gameState;
        for (let i = 0; i < parts.length - 1; i++) curr = curr[parts[i]];
        curr[parts[parts.length - 1]] = value;
        renderApp();
    }
}

function addLog(msg) {
    const logs = gameState.logs || [];
    logs.unshift(`[R${gameState.round || 1}] ${msg}`);
    if (logs.length > 40) logs.pop();
    updateState('logs', logs);
}

function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function renderApp() {
    if (!gameState) return;

    if (gameState.status === 'lobby') {
        renderLobby();
    } else if (gameState.status === 'active' || gameState.status === 'setup') {
        if (!document.getElementById('screen-game').classList.contains('active')) {
            switchScreen('screen-game');
        }
        renderGameScreen();
    }
}

function renderLobby() {
    const playerList = document.getElementById('lobby-player-list');
    playerList.innerHTML = '';
    const players = Object.values(gameState.players || {});
    
    players.forEach(p => {
        const li = document.createElement('li');
        const isHost = p.id === gameState.hostId;
        li.innerHTML = `<span>${isHost ? '👑 ' : ''}${p.name}</span> <span style="color:${p.color}">●</span>`;
        playerList.appendChild(li);
    });

    if (playerId === gameState.hostId) {
        document.getElementById('lobby-host-controls').style.display = 'block';
        document.getElementById('lobby-guest-msg').style.display = 'none';
    } else {
        document.getElementById('lobby-host-controls').style.display = 'none';
        document.getElementById('lobby-guest-msg').style.display = 'block';
    }
}

function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';

    const positions = [
        { r: 6, c: 6 }, { r: 6, c: 5 }, { r: 6, c: 4 }, { r: 6, c: 3 }, { r: 6, c: 2 }, { r: 6, c: 1 },
        { r: 5, c: 1 }, { r: 4, c: 1 }, { r: 3, c: 1 }, { r: 2, c: 1 }, { r: 1, c: 1 },
        { r: 1, c: 2 }, { r: 1, c: 3 }, { r: 1, c: 4 }, { r: 1, c: 5 }, { r: 1, c: 6 },
        { r: 2, c: 6 }, { r: 3, c: 6 }, { r: 4, c: 6 }, { r: 5, c: 6 }
    ];

    BOARD_LAYOUT.forEach((cell, idx) => {
        const cellEl = document.createElement('div');
        cellEl.className = 'cell';
        cellEl.id = `cell-${cell.id}`;
        cellEl.style.gridRow = positions[idx].r;
        cellEl.style.gridColumn = positions[idx].c;

        if (cell.type === 'property') {
            cellEl.innerHTML = `
                <div class="cell-header" style="background:${PROPERTY_GROUPS[cell.group]}">${cell.group}</div>
                <div class="cell-title">${cell.name}</div>
                <div class="cell-price">$${cell.price}</div>
                <div class="cell-owner" id="owner-label-${cell.id}"></div>
                <div class="tokens-container" id="tokens-${cell.id}"></div>
            `;
        } else {
            cellEl.innerHTML = `
                <div class="cell-title" style="margin-auto">${cell.name}</div>
                <div class="tokens-container" id="tokens-${cell.id}"></div>
            `;
        }
        board.appendChild(cellEl);
    });

    const center = document.createElement('div');
    center.className = 'center-square';
    center.innerHTML = `<h2>TRUSTOPOLY</h2><p style="font-size:0.8rem; color:#94a3b8;">Strategic Realtime Board</p>`;
    board.appendChild(center);
}

function renderGameScreen() {
    const pKeys = Object.keys(gameState.players);
    const activePlayerId = pKeys[gameState.currentTurnIndex % pKeys.length];
    const activePlayer = gameState.players[activePlayerId];

    document.getElementById('turn-indicator').innerText = `Round ${gameState.round} | Active: ${activePlayer.name}`;
    document.getElementById('my-identity').innerText = `Me: ${playerName} ($${gameState.players[playerId]?.money || 0})`;
    document.getElementById('current-turn-player-name').innerText = activePlayer.name;

    const isMyTurn = (playerId === activePlayerId) && gameState.status === 'active';
    document.getElementById('btn-roll-dice').disabled = !isMyTurn || gameState.hasRolled;
    document.getElementById('btn-end-turn').disabled = !isMyTurn || !gameState.hasRolled;

    document.getElementById('setup-banner').style.display = (gameState.status === 'setup') ? 'block' : 'none';

    BOARD_LAYOUT.forEach(cell => {
        const tokenBox = document.getElementById(`tokens-${cell.id}`);
        if (tokenBox) tokenBox.innerHTML = '';

        if (cell.type === 'property') {
            const pState = gameState.properties[cell.id];
            const ownerLabel = document.getElementById(`owner-label-${cell.id}`);
            if (pState.trustId) {
                const trust = gameState.trusts[pState.trustId];
                ownerLabel.innerText = `🏛️ ${trust ? trust.name : 'Trust'}`;
            } else if (pState.ownerId) {
                const owner = gameState.players[pState.ownerId];
                ownerLabel.innerText = `👤 ${owner ? owner.name : 'Owned'}`;
            } else if (pState.market) {
                ownerLabel.innerText = `🏷️ Market`;
            } else {
                ownerLabel.innerText = ``;
            }
        }
    });

    Object.values(gameState.players).forEach(p => {
        const tokenBox = document.getElementById(`tokens-${p.position}`);
        if (tokenBox) {
            const token = document.createElement('div');
            token.className = 'token';
            token.style.backgroundColor = p.color;
            token.title = p.name;
            tokenBox.appendChild(token);
        }
    });

    const grid = document.getElementById('players-overview');
    grid.innerHTML = '';
    Object.values(gameState.players).forEach(p => {
        const card = document.createElement('div');
        card.className = 'player-card-mini';
        card.style.borderLeftColor = p.color;
        
        const myProps = Object.values(gameState.properties).filter(pr => pr.ownerId === p.id).length;
        
        card.innerHTML = `
            <strong>${p.name} ${p.id === playerId ? '(You)' : ''}</strong>
            <div>Cash: <strong>$${p.money}</strong></div>
            <div>Position: Sq ${p.position}</div>
            <div>Properties: ${myProps}</div>
        `;
        grid.appendChild(card);
    });

    const logBox = document.getElementById('game-log');
    logBox.innerHTML = (gameState.logs || []).map(l => `<div class="log-entry">${l}</div>`).join('');

    if (gameState.auction && gameState.auction.active) {
        openAuctionModal();
    } else {
        closeModal('modal-auction');
    }
}

function startGame() {
    if (playerId !== gameState.hostId) return;

    const players = Object.keys(gameState.players);
    const properties = Object.keys(gameState.properties);

    properties.sort(() => Math.random() - 0.5);

    properties.forEach((propId, index) => {
        const assignedPlayerId = players[index % players.length];
        gameState.properties[propId].setupAssignedTo = assignedPlayerId;
    });

    gameState.status = 'setup';
    addLog("Property setup negotiation phase started! Trade and form Trusts before playing.");
    saveGameState(gameState);
}

function finishSetupPhase() {
    gameState.players[playerId].setupFinished = true;
    
    const allFinished = Object.values(gameState.players).every(p => p.setupFinished);
    if (allFinished) {
        Object.values(gameState.properties).forEach(pr => {
            if (!pr.ownerId && !pr.trustId) {
                pr.market = true;
            }
        });
        gameState.status = 'active';
        gameState.currentTurnIndex = 0;
        addLog("All players completed setup. Main game turns begin!");
    } else {
        addLog(`${playerName} finished their setup decisions.`);
    }
    saveGameState(gameState);
}

function rollDice() {
    const pKeys = Object.keys(gameState.players);
    const activePlayerId = pKeys[gameState.currentTurnIndex % pKeys.length];
    if (playerId !== activePlayerId || gameState.hasRolled) return;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const total = d1 + d2;

    document.getElementById('dice-display').innerText = `🎲 ${d1} + ${d2} = ${total}`;

    const player = gameState.players[playerId];
    let newPos = player.position + total;

    if (newPos >= BOARD_LAYOUT.length) {
        newPos = newPos % BOARD_LAYOUT.length;
        player.money += 200;
        addLog(`${player.name} passed Start and collected $200.`);
    }

    player.position = newPos;
    gameState.hasRolled = true;

    addLog(`${player.name} rolled ${total} and landed on ${BOARD_LAYOUT[newPos].name}.`);

    handleSquareLanding(newPos);
    saveGameState(gameState);
}

function handleSquareLanding(sqId) {
    const square = BOARD_LAYOUT[sqId];
    if (square.type === 'property') {
        const propState = gameState.properties[sqId];

        if (!propState.ownerId && !propState.trustId) {
            document.getElementById('prop-modal-title').innerText = `Landed on: ${square.name}`;
            document.getElementById('prop-modal-details').innerHTML = `
                <p>Colour Group: <strong>${square.group}</strong></p>
                <p>Purchase Price: <strong>$${square.price}</strong></p>
                <p>Standard Rent: <strong>$${square.rent}</strong></p>
            `;
            openModal('modal-property-action');
        } 
        else {
            const visitor = gameState.players[playerId];
            if (propState.trustId) {
                const trust = gameState.trusts[propState.trustId];
                if (trust) {
                    visitor.money -= square.rent;
                    trust.balance += square.rent;
                    addLog(`${visitor.name} paid $${square.rent} rent to ${trust.name}.`);
                }
            } else if (propState.ownerId && propState.ownerId !== playerId) {
                const owner = gameState.players[propState.ownerId];
                visitor.money -= square.rent;
                owner.money += square.rent;
                addLog(`${visitor.name} paid $${square.rent} rent to ${owner.name}.`);
            }
        }
    }
}

function endTurn() {
    const pKeys = Object.keys(gameState.players);
    const activePlayerId = pKeys[gameState.currentTurnIndex % pKeys.length];
    if (playerId !== activePlayerId || !gameState.hasRolled) return;

    gameState.hasRolled = false;
    gameState.currentTurnIndex = (gameState.currentTurnIndex + 1) % pKeys.length;

    if (gameState.currentTurnIndex === 0) {
        gameState.round += 1;
        addLog(`--- Starting Round ${gameState.round} ---`);
        processRoundEndTimers();
    }

    saveGameState(gameState);
}

function processRoundEndTimers() {
    Object.values(gameState.loans || {}).forEach(loan => {
        if (loan.status === 'ACTIVE') {
            const elapsedRounds = gameState.round - loan.startRound;
            if (elapsedRounds >= 20) {
                loan.status = 'OVERDUE';
                addLog(`⚠️ LOAN OVERDUE: Loan #${loan.id} (Owed: $${loan.totalOwed}) requires collateral settlement!`);
            }
        }
    });
}

function buyCurrentProperty() {
    const player = gameState.players[playerId];
    const sqId = player.position;
    const prop = gameState.properties[sqId];

    if (player.money < prop.price) {
        alert("Insufficient cash reserves to purchase this property.");
        return;
    }

    player.money -= prop.price;
    prop.ownerId = playerId;
    prop.market = false;

    addLog(`${player.name} bought ${prop.name} for $${prop.price}.`);
    closeModal('modal-property-action');
    saveGameState(gameState);
}

function sendCurrentPropertyToAuction() {
    const player = gameState.players[playerId];
    const sqId = player.position;
    const prop = gameState.properties[sqId];

    closeModal('modal-property-action');

    gameState.auction = {
        active: true,
        propertyId: prop.id,
        propertyName: prop.name,
        highestBid: prop.price / 2,
        highestBidderId: null,
        highestBidderName: 'None'
    };

    addLog(`Auction started for ${prop.name}! Starting bid: $${gameState.auction.highestBid}`);
    saveGameState(gameState);
}

function openAuctionModal() {
    const auc = gameState.auction;
    if (!auc || !auc.active) return;
    document.getElementById('auction-prop-name').innerText = auc.propertyName;
    document.getElementById('auction-high-bid').innerText = `$${auc.highestBid}`;
    document.getElementById('auction-high-bidder').innerText = auc.highestBidderName;
    openModal('modal-auction');
}

function placeBid() {
    const auc = gameState.auction;
    const bidVal = parseInt(document.getElementById('auction-bid-input').value, 10);
    const myMoney = gameState.players[playerId].money;

    if (isNaN(bidVal) || bidVal <= auc.highestBid) {
        alert("Bid must be strictly higher than current top bid.");
        return;
    }
    if (bidVal > myMoney) {
        alert("You cannot bid more money than you hold!");
        return;
    }

    auc.highestBid = bidVal;
    auc.highestBidderId = playerId;
    auc.highestBidderName = playerName;

    addLog(`${playerName} placed top bid of $${bidVal} on ${auc.propertyName}`);
    saveGameState(gameState);
}

function concludeAuction() {
    const auc = gameState.auction;
    if (!auc.highestBidderId) {
        alert("No valid bids placed yet.");
        return;
    }

    const winner = gameState.players[auc.highestBidderId];
    const prop = gameState.properties[auc.propertyId];

    winner.money -= auc.highestBid;
    prop.ownerId = auc.highestBidderId;
    prop.market = false;

    addLog(`Auction won! ${winner.name} acquired ${prop.name} for $${auc.highestBid}.`);
    gameState.auction = null;
    saveGameState(gameState);
}

function bankTransaction(type) {
    const amt = parseInt(document.getElementById('bank-amount').value, 10);
    if (isNaN(amt) || amt <= 0) return;

    const player = gameState.players[playerId];
    if (type === 'draw') {
        player.money += amt;
        addLog(`${player.name} drew $${amt} from Infinite Bank reserves.`);
    } else {
        if (player.money < amt) { alert("Insufficient funds."); return; }
        player.money -= amt;
        addLog(`${player.name} paid $${amt} to Bank.`);
    }
    closeModal('modal-bank');
    saveGameState(gameState);
}

function executePlayerTransfer() {
    const targetId = document.getElementById('transfer-target').value;
    const amt = parseInt(document.getElementById('transfer-amount').value, 10);
    if (!targetId || isNaN(amt) || amt <= 0) return;

    const sender = gameState.players[playerId];
    const recipient = gameState.players[targetId];

    if (sender.money < amt) { alert("Insufficient funds!"); return; }

    sender.money -= amt;
    recipient.money += amt;

    addLog(`${sender.name} transferred $${amt} directly to ${recipient.name}.`);
    closeModal('modal-bank');
    saveGameState(gameState);
}

function openTrustModal() {
    const propBox = document.getElementById('trust-properties-selector');
    propBox.innerHTML = '';
    Object.values(gameState.properties).forEach(p => {
        if (!p.trustId) {
            propBox.innerHTML += `
                <div class="checkbox-item">
                    <input type="checkbox" value="${p.id}" class="trust-prop-check">
                    <span>${p.name} (${p.group})</span>
                </div>
            `;
        }
    });

    const memBox = document.getElementById('trust-members-selector');
    memBox.innerHTML = '';
    Object.values(gameState.players).forEach(p => {
        memBox.innerHTML += `
            <div class="form-group" style="margin-bottom:6px;">
                <label>${p.name} Ownership (%)</label>
                <input type="number" class="trust-share-input" data-pid="${p.id}" value="0" min="0" max="100">
            </div>
        `;
    });

    renderActiveTrustsList();
    openModal('modal-trusts');
}

function createTrust() {
    const name = document.getElementById('trust-name').value.trim();
    if (!name) { alert("Enter trust name."); return; }

    const selectedProps = Array.from(document.querySelectorAll('.trust-prop-check:checked')).map(cb => parseInt(cb.value, 10));
    if (selectedProps.length < 2) {
        alert("A Trust must contain at least 2 properties.");
        return;
    }

    let totalPct = 0;
    const members = [];
    document.querySelectorAll('.trust-share-input').forEach(inp => {
        const pct = parseInt(inp.value, 10) || 0;
        if (pct > 0) {
            totalPct += pct;
            members.push({
                playerId: inp.dataset.pid,
                percentage: pct,
                withdrawnAmount: 0
            });
        }
    });

    if (members.length < 2) {
        alert("A Trust must contain at least 2 member players.");
        return;
    }
    if (totalPct !== 100) {
        alert(`Member equity percentages must sum exactly to 100%. (Current total: ${totalPct}%)`);
        return;
    }

    const trustId = 't_' + Math.random().toString(36).substr(2, 9);
    const newTrust = {
        id: trustId,
        name: name,
        balance: 0,
        properties: selectedProps,
        members: members
    };

    selectedProps.forEach(pId => {
        gameState.properties[pId].trustId = trustId;
        gameState.properties[pId].ownerId = null;
    });

    gameState.trusts[trustId] = newTrust;
    addLog(`Trust created: "${name}" with ${selectedProps.length} properties.`);
    closeModal('modal-trusts');
    saveGameState(gameState);
}

function renderActiveTrustsList() {
    const list = document.getElementById('active-trusts-list');
    list.innerHTML = '';
    Object.values(gameState.trusts || {}).forEach(t => {
        const myMem = t.members.find(m => m.playerId === playerId);
        let availWithdrawal = 0;
        if (myMem) {
            const maxEntitlement = (t.balance + (myMem.withdrawnAmount || 0)) * (myMem.percentage / 100);
            availWithdrawal = Math.max(0, Math.floor(maxEntitlement - (myMem.withdrawnAmount || 0)));
        }

        const div = document.createElement('div');
        div.className = 'card-inner';
        div.style.marginBottom = '8px';
        div.innerHTML = `
            <strong>${t.name}</strong>
            <div>Balance: <strong>$${t.balance}</strong></div>
            <div class="small-text">Members: ${t.members.map(m => `${gameState.players[m.playerId]?.name} (${m.percentage}%)`).join(', ')}</div>
            ${myMem ? `
                <div style="margin-top:5px;">Your Available Equity Draw: <strong>$${availWithdrawal}</strong></div>
                <button class="btn btn-sm btn-success" style="margin-top:4px;" onclick="withdrawFromTrust('${t.id}', ${availWithdrawal})">Withdraw Max Share</button>
            ` : ''}
        `;
        list.appendChild(div);
    });
}

function withdrawFromTrust(trustId, maxAmt) {
    if (maxAmt <= 0) { alert("No equity drawdown available."); return; }
    const trust = gameState.trusts[trustId];
    const member = trust.members.find(m => m.playerId === playerId);
    const player = gameState.players[playerId];

    trust.balance -= maxAmt;
    player.money += maxAmt;
    member.withdrawnAmount = (member.withdrawnAmount || 0) + maxAmt;

    addLog(`${player.name} withdrew $${maxAmt} equity from ${trust.name}.`);
    saveGameState(gameState);
}

function openLoansModal() {
    const bSel = document.getElementById('loan-borrower-select');
    const lSel = document.getElementById('loan-lender-select');
    bSel.innerHTML = ''; lSel.innerHTML = '';

    Object.values(gameState.players).forEach(p => {
        bSel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        lSel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });

    Object.values(gameState.trusts || {}).forEach(t => {
        lSel.innerHTML += `<option value="trust_${t.id}">🏛️ Trust: ${t.name}</option>`;
    });

    renderActiveLoansList();
    openModal('modal-loans');
}

function issueLoan() {
    const borrowerId = document.getElementById('loan-borrower-select').value;
    const lenderVal = document.getElementById('loan-lender-select').value;
    const principal = parseInt(document.getElementById('loan-principal').value, 10);
    const interest = parseInt(document.getElementById('loan-interest').value, 10);

    if (isNaN(principal) || principal <= 0 || isNaN(interest)) return;

    const borrower = gameState.players[borrowerId];
    const totalOwed = Math.floor(principal * (1 + (interest / 100)));

    let lenderName = "";
    let lenderType = "PLAYER";
    let lenderId = lenderVal;

    if (lenderVal.startsWith('trust_')) {
        lenderType = "TRUST";
        lenderId = lenderVal.replace('trust_', '');
        const trust = gameState.trusts[lenderId];
        if (trust.balance < principal) { alert("Trust lacks sufficient capital reserves."); return; }
        trust.balance -= principal;
        lenderName = trust.name;
    } else {
        const lender = gameState.players[lenderId];
        if (lender.money < principal) { alert("Lender lacks sufficient cash."); return; }
        lender.money -= principal;
        lenderName = lender.name;
    }

    borrower.money += principal;

    const loanId = 'l_' + Math.random().toString(36).substr(2, 9);
    gameState.loans[loanId] = {
        id: loanId,
        borrowerId: borrowerId,
        lenderType: lenderType,
        lenderId: lenderId,
        principal: principal,
        interestRate: interest,
        totalOwed: totalOwed,
        startRound: gameState.round,
        dueRound: gameState.round + 20,
        status: 'ACTIVE'
    };

    addLog(`Loan issued: ${borrower.name} borrowed $${principal} from ${lenderName} @ ${interest}% interest. (Due: Round ${gameState.round + 20})`);
    closeModal('modal-loans');
    saveGameState(gameState);
}

function renderActiveLoansList() {
    const list = document.getElementById('active-loans-list');
    list.innerHTML = '';
    Object.values(gameState.loans || {}).forEach(l => {
        const borrower = gameState.players[l.borrowerId];
        const remainingRounds = Math.max(0, l.dueRound - gameState.round);

        let lenderName = "";
        if (l.lenderType === "TRUST") lenderName = gameState.trusts[l.lenderId]?.name || "Trust";
        else lenderName = gameState.players[l.lenderId]?.name || "Player";

        const div = document.createElement('div');
        div.className = 'card-inner';
        div.style.marginBottom = '8px';
        div.innerHTML = `
            <strong>Loan Contract #${l.id.substr(0, 5)}</strong>
            <div>Borrower: ${borrower?.name} | Lender: ${lenderName}</div>
            <div>Owed: <strong>$${l.totalOwed}</strong> | Status: <span class="badge">${l.status}</span></div>
            <div class="small-text">Remaining Term: ${remainingRounds} Rounds</div>
            ${(l.borrowerId === playerId && l.status === 'ACTIVE') ? `
                <button class="btn btn-sm btn-primary" onclick="closeLoan('${l.id}')">Repay & Close Loan</button>
            ` : ''}
            ${l.status === 'OVERDUE' ? `<div style="color:var(--accent-red); font-weight:bold;">⚠️ Overdue: Provide Collateral</div>` : ''}
        `;
        list.appendChild(div);
    });
}

function closeLoan(loanId) {
    const loan = gameState.loans[loanId];
    const borrower = gameState.players[loan.borrowerId];

    if (borrower.money < loan.totalOwed) { alert("Insufficient cash to close loan!"); return; }

    borrower.money -= loan.totalOwed;

    if (loan.lenderType === 'TRUST') {
        const trust = gameState.trusts[loan.lenderId];
        if (trust) trust.balance += loan.totalOwed;
    } else {
        const lender = gameState.players[loan.lenderId];
        if (lender) lender.money += loan.totalOwed;
    }

    loan.status = 'CLOSED';
    addLog(`Loan #${loan.id.substr(0, 5)} fully repaid and closed by ${borrower.name}.`);
    saveGameState(gameState);
}

function openTradeModal() {
    const partnerSel = document.getElementById('trade-partner-select');
    partnerSel.innerHTML = '';
    Object.values(gameState.players).forEach(p => {
        if (p.id !== playerId) {
            partnerSel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        }
    });

    updateTradeFormUI();
    openModal('modal-trade');
}

function updateTradeFormUI() {
    const partnerId = document.getElementById('trade-partner-select').value;
    const myPropsBox = document.getElementById('trade-my-props');
    const theirPropsBox = document.getElementById('trade-their-props');

    myPropsBox.innerHTML = '';
    theirPropsBox.innerHTML = '';

    Object.values(gameState.properties).forEach(p => {
        if (p.ownerId === playerId) {
            myPropsBox.innerHTML += `
                <div class="checkbox-item"><input type="checkbox" value="${p.id}" class="trade-my-pcheck"> ${p.name}</div>
            `;
        }
        if (partnerId && p.ownerId === partnerId) {
            theirPropsBox.innerHTML += `
                <div class="checkbox-item"><input type="checkbox" value="${p.id}" class="trade-their-pcheck"> ${p.name}</div>
            `;
        }
    });
}

function proposeTrade() {
    const partnerId = document.getElementById('trade-partner-select').value;
    if (!partnerId) return;

    const myCash = parseInt(document.getElementById('trade-my-cash').value, 10) || 0;
    const theirCash = parseInt(document.getElementById('trade-their-cash').value, 10) || 0;

    const myProps = Array.from(document.querySelectorAll('.trade-my-pcheck:checked')).map(cb => parseInt(cb.value, 10));
    const theirProps = Array.from(document.querySelectorAll('.trade-their-pcheck:checked')).map(cb => parseInt(cb.value, 10));

    const tradeId = 'tr_' + Math.random().toString(36).substr(2, 9);
    gameState.trades[tradeId] = {
        id: tradeId,
        proposerId: playerId,
        partnerId: partnerId,
        myCash, myProps,
        theirCash, theirProps,
        status: 'PENDING'
    };

    addLog(`Trade proposal submitted from ${playerName} to ${gameState.players[partnerId]?.name}.`);
    closeModal('modal-trade');
    saveGameState(gameState);
}

function openModal(id) {
    if (id === 'modal-bank') {
        const sel = document.getElementById('transfer-target');
        sel.innerHTML = '';
        Object.values(gameState.players).forEach(p => {
            if (p.id !== playerId) sel.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });
    } else if (id === 'modal-trusts') openTrustModal();
      else if (id === 'modal-loans') openLoansModal();
      else if (id === 'modal-trade') openTradeModal();

    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}