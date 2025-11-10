const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusBar = document.getElementById('statusBar');

// --- Game Configuration ---
let TILE_SIZE = 40; // This will be dynamically calculated
const GRID_WIDTH = 15; // Width of the grid in tiles
const GRID_HEIGHT = 13; // Height of the grid in tiles

// --- Game State ---
const TILE = {
    EMPTY: 0,
    INDESTRUCTIBLE: 1,
    DESTRUCTIBLE: 2
};

const COLORS = {
    [TILE.EMPTY]: '#3a3a3a',
    [TILE.INDESTRUCTIBLE]: '#808080',
    [TILE.DESTRUCTIBLE]: '#c0c0c0',
    PLAYER: '#ff4136',
    BOMB: '#001f3f',
    EXPLOSION: '#FFDC00',
    ENEMY: '#8E44AD' // Purple color for enemies
};

// --- Game State ---
const BOMB_TIMER = 3000; // 3 seconds
const EXPLOSION_DURATION = 500; // 0.5 seconds
const EXPLOSION_RADIUS = 2;

let gameState = 'playing'; // 'playing', 'won', 'lost'
let score = 0;

// Simple grid layout
let grid = [];
const bombs = [];
const explosions = [];
const enemies = [];

// Player object
const player = {
    x: 1, // Initial X position (in grid units)
    y: 1, // Initial Y position (in grid units)
    speed: 4, // Player speed in tiles per second
    lives: 3
};

// --- UI Functions ---
function updateUI() {
    const hearts = player.lives > 0 ? '❤️'.repeat(player.lives) : 'BRAK';
    statusBar.innerHTML = `ŻYCIA: ${hearts}&nbsp;&nbsp;|&nbsp;&nbsp;PUNKTY: ${score}`;
}

// --- Responsive Sizing ---
function resizeGame() {
    const container = canvas.parentElement;
    // Calculate available space, leaving some padding
    const availableWidth = container.clientWidth * 0.95;
    const availableHeight = container.clientHeight - statusBar.offsetHeight - document.querySelector('h1').offsetHeight - 50;

    // Calculate the best tile size to fit the grid
    const tileW = Math.floor(availableWidth / GRID_WIDTH);
    const tileH = Math.floor(availableHeight / GRID_HEIGHT);
    TILE_SIZE = Math.min(tileW, tileH);

    // Set new canvas dimensions
    canvas.width = GRID_WIDTH * TILE_SIZE;
    canvas.height = GRID_HEIGHT * TILE_SIZE;

    // Redraw the game with the new size
    draw();
}


// --- Initialization ---
function initializeGrid() {
    grid = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(TILE.DESTRUCTIBLE));

    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (y === 0 || y === GRID_HEIGHT - 1 || x === 0 || x === GRID_WIDTH - 1) {
                grid[y][x] = TILE.INDESTRUCTIBLE;
            } else if (y % 2 === 0 && x % 2 === 0) {
                grid[y][x] = TILE.INDESTRUCTIBLE;
            }
        }
    }
    grid[1][1] = TILE.EMPTY;
    grid[1][2] = TILE.EMPTY;
    grid[2][1] = TILE.EMPTY;
}

function initializeEnemies() {
    enemies.length = 0;
    const enemyPositions = [
        { x: 13, y: 1 }, { x: 1, y: 11 }, { x: 13, y: 11 }, { x: 7, y: 5 }
    ];

    enemyPositions.forEach(pos => {
        if (grid[pos.y][pos.x] === TILE.DESTRUCTIBLE) {
            grid[pos.y][pos.x] = TILE.EMPTY;
        }
        enemies.push({
            x: pos.x, y: pos.y, speed: 2, dx: 1, dy: 0 // Speed in tiles per second
        });
    });
}

function restartGame() {
    gameState = 'playing';
    score = 0;
    player.lives = 3;
    bombs.forEach(bomb => clearTimeout(bomb.timer));
    bombs.length = 0;
    explosions.length = 0;
    
    initializeGrid();
    initializeEnemies();
    resetPlayer();
    updateUI();
}

// --- Input Handling ---
const keys = {};

document.addEventListener('keydown', (e) => {
    if (gameState !== 'playing') {
        if (e.key === 'Enter') {
            restartGame();
        }
        return;
    }
    keys[e.key] = true;
    if (e.key === ' ') {
        e.preventDefault();
        placeBomb();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// --- Game Logic Functions ---

function placeBomb() {
    const gridX = Math.round(player.x);
    const gridY = Math.round(player.y);

    if (bombs.some(bomb => bomb.x === gridX && bomb.y === gridY)) {
        return;
    }

    const bomb = {
        x: gridX,
        y: gridY,
        timer: setTimeout(() => explodeBomb(bomb), BOMB_TIMER)
    };
    bombs.push(bomb);
}

function explodeBomb(bomb) {
    const bombIndex = bombs.indexOf(bomb);
    if (bombIndex > -1) {
        bombs.splice(bombIndex, 1);
    }

    createExplosion(bomb.x, bomb.y);
    for (let i = 1; i <= EXPLOSION_RADIUS; i++) { if (!createExplosion(bomb.x + i, bomb.y)) break; }
    for (let i = 1; i <= EXPLOSION_RADIUS; i++) { if (!createExplosion(bomb.x - i, bomb.y)) break; }
    for (let i = 1; i <= EXPLOSION_RADIUS; i++) { if (!createExplosion(bomb.x, bomb.y + i)) break; }
    for (let i = 1; i <= EXPLOSION_RADIUS; i++) { if (!createExplosion(bomb.x, bomb.y - i)) break; }
}

function createExplosion(x, y) {
    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return false;

    const tile = grid[y][x];
    if (tile === TILE.INDESTRUCTIBLE) return false;

    explosions.push({ x: x, y: y, createdAt: Date.now() });

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (Math.floor(enemy.x) === x && Math.floor(enemy.y) === y) {
            enemies.splice(i, 1);
            score += 100;
            updateUI();
        }
    }
    
    if (tile === TILE.DESTRUCTIBLE) {
        grid[y][x] = TILE.EMPTY;
        score += 10;
        updateUI();
        return false;
    }
    return true;
}

function updatePlayer(deltaTime) {
    let dx = 0, dy = 0;
    if (keys['ArrowUp']) dy = -1;
    if (keys['ArrowDown']) dy = 1;
    if (keys['ArrowLeft']) dx = -1;
    if (keys['ArrowRight']) dx = 1;

    if (dx === 0 && dy === 0) return;

    const moveAmount = player.speed * deltaTime;
    const newPlayerX = player.x + dx * moveAmount;
    const newPlayerY = player.y + dy * moveAmount;
    
    const targetGridX = Math.floor(newPlayerX + (dx > 0 ? 0.8 : (dx < 0 ? 0.2 : 0.5)));
    const targetGridY = Math.floor(newPlayerY + (dy > 0 ? 0.8 : (dy < 0 ? 0.2 : 0.5)));

    if (grid[targetGridY] && grid[targetGridY][targetGridX] === TILE.EMPTY) {
        player.x = newPlayerX;
        player.y = newPlayerY;
    }
}

function updateEnemies(deltaTime) {
    enemies.forEach(enemy => {
        const moveAmount = enemy.speed * deltaTime;
        const newX = enemy.x + enemy.dx * moveAmount;
        const newY = enemy.y + enemy.dy * moveAmount;

        const targetGridX = Math.floor(newX + (enemy.dx > 0 ? 1 : 0));
        const targetGridY = Math.floor(newY + (enemy.dy > 0 ? 1 : 0));

        if (grid[targetGridY] && grid[targetGridY][targetGridX] === TILE.EMPTY) {
            enemy.x = newX;
            enemy.y = newY;
        } else {
            if (enemy.dx !== 0) { enemy.dx *= -1; enemy.x = Math.round(enemy.x); }
            if (enemy.dy !== 0) { enemy.dy *= -1; enemy.y = Math.round(enemy.y); }
        }
    });
}

function handlePlayerDeath() {
    if (gameState !== 'playing') return;

    player.lives--;
    updateUI();

    if (player.lives <= 0) {
        gameState = 'lost';
    } else {
        resetPlayer();
    }
}

function checkCollisions() {
    const playerGridX = Math.floor(player.x + 0.5);
    const playerGridY = Math.floor(player.y + 0.5);

    if (explosions.some(ex => ex.x === playerGridX && ex.y === playerGridY)) {
        handlePlayerDeath();
    }
    if (enemies.some(en => Math.floor(en.x + 0.5) === playerGridX && Math.floor(en.y + 0.5) === playerGridY)) {
        handlePlayerDeath();
    }
}

function resetPlayer() {
    player.x = 1;
    player.y = 1;
}

function update(deltaTime) {
    if (gameState !== 'playing') return;

    updatePlayer(deltaTime);
    updateEnemies(deltaTime);
    checkCollisions();

    if (enemies.length === 0) {
        gameState = 'won';
    }

    const now = Date.now();
    for (let i = explosions.length - 1; i >= 0; i--) {
        if (now - explosions[i].createdAt > EXPLOSION_DURATION) {
            explosions.splice(i, 1);
        }
    }
}

// --- Drawing Functions ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            ctx.fillStyle = COLORS[grid[y][x]];
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    bombs.forEach(bomb => {
        ctx.fillStyle = COLORS.BOMB;
        ctx.beginPath();
        ctx.arc(bomb.x * TILE_SIZE + TILE_SIZE / 2, bomb.y * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 2.5, 0, Math.PI * 2);
        ctx.fill();
    });

    explosions.forEach(explosion => {
        ctx.fillStyle = COLORS.EXPLOSION;
        ctx.fillRect(explosion.x * TILE_SIZE, explosion.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    });

    enemies.forEach(enemy => {
        ctx.fillStyle = COLORS.ENEMY;
        ctx.fillRect(enemy.x * TILE_SIZE, enemy.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    });

    ctx.fillStyle = COLORS.PLAYER;
    const playerDrawSize = TILE_SIZE * 0.8;
    const playerOffset = (TILE_SIZE - playerDrawSize) / 2;
    ctx.fillRect(player.x * TILE_SIZE + playerOffset, player.y * TILE_SIZE + playerOffset, playerDrawSize, playerDrawSize);

    if (gameState !== 'playing') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'white';
        ctx.font = `${TILE_SIZE * 1.5}px "Courier New", Courier, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const message = gameState === 'won' ? 'WYGRANA!' : 'KONIEC GRY';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2 - TILE_SIZE);

        ctx.font = `${TILE_SIZE * 0.5}px "Courier New", Courier, monospace`;
        ctx.fillText('Naciśnij Enter, aby zagrać ponownie', canvas.width / 2, canvas.height / 2 + TILE_SIZE * 0.5);
    }
}

// --- Game Loop ---
let lastTime = 0;
function gameLoop(timestamp) {
    const deltaTime = (timestamp - lastTime) / 1000; // Time in seconds
    lastTime = timestamp;

    update(deltaTime || 0); // Pass deltaTime to update functions
    draw();
    requestAnimationFrame(gameLoop);
}

// --- Start Game ---
window.addEventListener('resize', resizeGame);
initializeGrid();
initializeEnemies();
updateUI();
resizeGame(); // Initial size calculation
gameLoop(0);
