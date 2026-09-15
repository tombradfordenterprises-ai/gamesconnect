const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

// ========================================
// HTTP SERVER
// ========================================

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    res.end("QuickPlay backend is running!");
});

// ========================================
// WEBSOCKET SERVER
// ========================================

const wss = new WebSocket.Server({
    server
});

// ========================================
// PLAYER DATA
// ========================================

const players = new Map();

// Separate matchmaking queues
const queues = {
    checkers: [],
    tictactoe: [],
    battleship: []
};

// Active game rooms
const rooms = new Map();

// ========================================
// HELPERS
// ========================================

function send(ws, message) {

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function generatePlayerName() {

    return (
        "Player" +
        Math.floor(1000 + Math.random() * 9000)
    );
}

function generateRoomId() {

    return Math.random()
        .toString(36)
        .substring(2, 10);
}

// ========================================
// REMOVE PLAYER FROM ALL QUEUES
// ========================================

function removeFromQueues(ws) {

    for (const game of Object.keys(queues)) {

        queues[game] =
            queues[game].filter(
                player => player !== ws
            );
    }
}

// ========================================
// FIND MATCH
// ========================================

function findMatch(ws, game) {

    removeFromQueues(ws);

    const queue = queues[game];

    // Is somebody already waiting?
    if (queue.length > 0) {

        const opponent = queue.shift();

        createRoom(
            opponent,
            ws,
            game
        );

        return;
    }

    // Nobody waiting
    queue.push(ws);

    send(ws, {
        type: "searching",
        game
    });

    console.log(
        `${players.get(ws).name} is searching for ${game}`
    );
}

// ========================================
// CREATE GAME ROOM
// ========================================

function createRoom(player1, player2, game) {

    const roomId = generateRoomId();

    const room = {
        id: roomId,
        game: game,
        players: [
            player1,
            player2
        ]
    };

    rooms.set(roomId, room);

    players.get(player1).room = roomId;
    players.get(player2).room = roomId;

    console.log(
        `Match created: ${game} | ${roomId}`
    );

    send(player1, {

        type: "match_found",

        game: game,

        roomId: roomId,

        playerIndex: 0,

        opponent:
            players.get(player2).name
    });

    send(player2, {

        type: "match_found",

        game: game,

        roomId: roomId,

        playerIndex: 1,

        opponent:
            players.get(player1).name
    });
}

// ========================================
// WEBSOCKET CONNECTION
// ========================================

wss.on("connection", ws => {

    const player = {

        name: generatePlayerName(),

        room: null

    };

    players.set(ws, player);

    console.log(
        `${player.name} connected`
    );

    // Tell frontend that connection worked
    send(ws, {

        type: "connected",

        name: player.name

    });

    // ====================================
    // RECEIVE MESSAGE
    // ====================================

    ws.on("message", rawMessage => {

        let message;

        try {

            message =
                JSON.parse(rawMessage);

        } catch (error) {

            console.log(
                "Invalid message received"
            );

            return;
        }

        // =================================
        // FIND MATCH
        // =================================

        if (
            message.type === "find_match"
        ) {

            const allowedGames = [
                "checkers",
                "tictactoe",
                "battleship"
            ];

            if (
                !allowedGames.includes(
                    message.game
                )
            ) {

                return;
            }

            findMatch(
                ws,
                message.game
            );

            return;
        }

        // =================================
        // CANCEL SEARCH
        // =================================

        if (
            message.type === "cancel_search"
        ) {

            removeFromQueues(ws);

            send(ws, {

                type: "search_cancelled"

            });

            return;
        }

        // =================================
        // LEAVE GAME
        // =================================

        if (
            message.type === "leave_game"
        ) {

            leaveGame(ws);

            return;
        }

    });

    // ====================================
    // DISCONNECT
    // ====================================

    ws.on("close", () => {

        console.log(
            `${player.name} disconnected`
        );

        removeFromQueues(ws);

        leaveGame(ws);

        players.delete(ws);

    });

});

// ========================================
// LEAVE GAME
// ========================================

function leaveGame(ws) {

    const player = players.get(ws);

    if (!player) {
        return;
    }

    if (!player.room) {
        return;
    }

    const room =
        rooms.get(player.room);

    if (!room) {

        player.room = null;

        return;
    }

    // Find opponent
    const opponent =
        room.players.find(
            other => other !== ws
        );

    if (opponent) {

        send(opponent, {

            type: "opponent_left"

        });

        const opponentData =
            players.get(opponent);

        if (opponentData) {

            opponentData.room = null;

        }
    }

    rooms.delete(room.id);

    player.room = null;

    console.log(
        `Room ${room.id} closed`
    );
}

// ========================================
// START SERVER
// ========================================

server.listen(PORT, () => {

    console.log(
        `QuickPlay backend running on port ${PORT}`
    );

});