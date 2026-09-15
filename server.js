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

const queues = {
    checkers: [],
    tictactoe: [],
    battleship: []
};

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
// REMOVE FROM QUEUES
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

    if (queue.length > 0) {

        const opponent = queue.shift();

        createRoom(
            opponent,
            ws,
            game
        );

        return;
    }

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
// CREATE ROOM
// ========================================

function createRoom(player1, player2, game) {

    const roomId = generateRoomId();

    const room = {
        id: roomId,
        game: game,

        players: [
            player1,
            player2
        ],

        // Tic-Tac-Toe data
       board: [
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
],

        currentTurn: 0,

        gameOver: false,

        winner: null,

        rematchRequests: new Set()
    };

    // Randomly decide who starts
    room.currentTurn =
        Math.random() < 0.5 ? 0 : 1;

    rooms.set(
        roomId,
        room
    );

    players.get(player1).room =
        roomId;

    players.get(player2).room =
        roomId;

    // Player indexes
    players.get(player1).playerIndex = 0;
    players.get(player2).playerIndex = 1;

    console.log(
        `Match created: ${game} | ${roomId}`
    );

    // ====================================
    // TELL PLAYER 1
    // ====================================

    send(player1, {

        type: "match_found",

        game: game,

        roomId: roomId,

        playerIndex: 0,

        symbol:
            game === "tictactoe"
                ? "X"
                : null,

        opponent:
            players.get(player2).name

    });

    // ====================================
    // TELL PLAYER 2
    // ====================================

    send(player2, {

        type: "match_found",

        game: game,

        roomId: roomId,

        playerIndex: 1,

        symbol:
            game === "tictactoe"
                ? "O"
                : null,

        opponent:
            players.get(player1).name

    });

    // ====================================
    // START TIC-TAC-TOE
    // ====================================

    if (game === "tictactoe") {

        startTicTacToe(
            room
        );

    }
}

// ========================================
// START TIC-TAC-TOE
// ========================================

function startTicTacToe(room) {

    room.board = [
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
    ];

    room.gameOver = false;

    room.winner = null;

    room.rematchRequests =
        new Set();

    const player1 =
        room.players[0];

    const player2 =
        room.players[1];

    // Send initial board to both players
    send(player1, {

        type: "tictactoe_start",

        board: room.board,

        yourSymbol: "X",

        currentTurn:
            room.currentTurn,

        playerIndex: 0

    });

    send(player2, {

        type: "tictactoe_start",

        board: room.board,

        yourSymbol: "O",

        currentTurn:
            room.currentTurn,

        playerIndex: 1

    });

    console.log(
        `Tic-Tac-Toe started: ${room.id}`
    );
}

// ========================================
// CHECK WINNER
// ========================================

function checkWinner(board) {

    const winningLines = [

        [0, 1, 2],

        [3, 4, 5],

        [6, 7, 8],

        [0, 3, 6],

        [1, 4, 7],

        [2, 5, 8],

        [0, 4, 8],

        [2, 4, 6]

    ];

    for (
        const line
        of winningLines
    ) {

        const [a, b, c] =
            line;

        if (
            board[a] &&
            board[a] === board[b] &&
            board[a] === board[c]
        ) {

            return {
                winner: board[a],
                line: line
            };

        }
    }

    if (
        board.every(
            cell => cell !== ""
        )
    ) {

        return {
            winner: "draw",
            line: []
        };

    }

    return null;
}

// ========================================
// SEND BOARD TO BOTH PLAYERS
// ========================================

function broadcastBoard(room) {

    room.players.forEach(
        (player, index) => {

            send(player, {

                type:
                    "tictactoe_update",

                board:
                    room.board,

                currentTurn:
                    room.currentTurn,

                playerIndex:
                    index

            });

        }
    );
}

// ========================================
// HANDLE TIC-TAC-TOE MOVE
// ========================================

function handleTicTacToeMove(
    ws,
    message
) {

    const player =
        players.get(ws);

    if (!player) {
        return;
    }

    if (!player.room) {
        return;
    }

    const room =
        rooms.get(player.room);

    if (!room) {
        return;
    }

    if (
        room.game !==
        "tictactoe"
    ) {

        return;
    }

    // Game already finished
    if (room.gameOver) {
        return;
    }

    const playerIndex =
        player.playerIndex;

    // Not this player's turn
    if (
        room.currentTurn !==
        playerIndex
    ) {

        send(ws, {

            type:
                "invalid_move",

            reason:
                "It is not your turn."

        });

        return;
    }

    const position =
        Number(message.position);

    // Invalid board position
    if (
        !Number.isInteger(position) ||
        position < 0 ||
        position > 8
    ) {

        send(ws, {

            type:
                "invalid_move",

            reason:
                "Invalid board position."

        });

        return;
    }

    // Square already occupied
    if (
        room.board[position] !== ""
    ) {

        send(ws, {

            type:
                "invalid_move",

            reason:
                "That square is already occupied."

        });

        return;
    }

    const symbol =
        playerIndex === 0
            ? "X"
            : "O";

    room.board[position] =
        symbol;

    // Check for winner/draw
    const result =
        checkWinner(
            room.board
        );

    if (result) {

        room.gameOver = true;

        room.winner =
            result.winner;

        room.players.forEach(
            (playerSocket, index) => {

                let resultType;

                if (
                    result.winner ===
                    "draw"
                ) {

                    resultType =
                        "draw";

                } else if (
                    index ===
                    playerIndex
                ) {

                    resultType =
                        "win";

                } else {

                    resultType =
                        "loss";

                }

                send(
                    playerSocket,
                    {

                        type:
                            "tictactoe_result",

                        board:
                            room.board,

                        result:
                            resultType,

                        winner:
                            result.winner,

                        winningLine:
                            result.line

                    }
                );

            }
        );

        console.log(
            `Tic-Tac-Toe finished: ${room.id} | ${result.winner}`
        );

        return;
    }

    // Switch turns
    room.currentTurn =
        playerIndex === 0
            ? 1
            : 0;

    broadcastBoard(
        room
    );
}

// ========================================
// HANDLE REMATCH
// ========================================

function handleRematch(ws) {

    const player =
        players.get(ws);

    if (!player || !player.room) {
        return;
    }

    const room =
        rooms.get(player.room);

    if (!room) {
        return;
    }

    if (
        room.game !==
        "tictactoe"
    ) {
        return;
    }

    room.rematchRequests.add(
        ws
    );

    // Tell the player their request was received
    send(ws, {

        type:
            "rematch_waiting"

    });

    // Both players requested rematch
    if (
        room.rematchRequests.size === 2
    ) {

        room.currentTurn =
            Math.random() < 0.5
                ? 0
                : 1;

        startTicTacToe(
            room
        );

    }
}

// ========================================
// WEBSOCKET CONNECTION
// ========================================

wss.on(
    "connection",
    ws => {

        const player = {

            name:
                generatePlayerName(),

            room:
                null,

            playerIndex:
                null

        };

        players.set(
            ws,
            player
        );

        console.log(
            `${player.name} connected`
        );

        send(ws, {

            type:
                "connected",

            name:
                player.name

        });

        // =================================
        // RECEIVE MESSAGE
        // =================================

        ws.on(
            "message",
            rawMessage => {

                let message;

                try {

                    message =
                        JSON.parse(
                            rawMessage
                        );

                } catch (error) {

                    console.log(
                        "Invalid message received"
                    );

                    return;
                }

                // =========================
                // FIND MATCH
                // =========================

                if (
                    message.type ===
                    "find_match"
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

                // =========================
                // CANCEL SEARCH
                // =========================

                if (
                    message.type ===
                    "cancel_search"
                ) {

                    removeFromQueues(ws);

                    send(ws, {

                        type:
                            "search_cancelled"

                    });

                    return;
                }

                // =========================
                // TIC-TAC-TOE MOVE
                // =========================

                if (
                    message.type ===
                    "tictactoe_move"
                ) {

                    handleTicTacToeMove(
                        ws,
                        message
                    );

                    return;
                }

                // =========================
                // REMATCH
                // =========================

                if (
                    message.type ===
                    "tictactoe_rematch"
                ) {

                    handleRematch(
                        ws
                    );

                    return;
                }

                // =========================
                // LEAVE GAME
                // =========================

                if (
                    message.type ===
                    "leave_game"
                ) {

                    leaveGame(ws);

                    return;
                }

            }
        );

        // =================================
        // DISCONNECT
        // =================================

        ws.on(
            "close",
            () => {

                console.log(
                    `${player.name} disconnected`
                );

                removeFromQueues(
                    ws
                );

                leaveGame(
                    ws
                );

                players.delete(
                    ws
                );

            }
        );

    }
);

// ========================================
// LEAVE GAME
// ========================================

function leaveGame(ws) {

    const player =
        players.get(ws);

    if (!player) {
        return;
    }

    if (!player.room) {
        return;
    }

    const room =
        rooms.get(
            player.room
        );

    if (!room) {

        player.room = null;

        return;
    }

    const opponent =
        room.players.find(
            other =>
                other !== ws
        );

    if (opponent) {

        send(opponent, {

            type:
                "opponent_left"

        });

        const opponentData =
            players.get(
                opponent
            );

        if (opponentData) {

            opponentData.room = null;

            opponentData.playerIndex =
                null;

        }

    }

    rooms.delete(
        room.id
    );

    player.room = null;

    player.playerIndex =
        null;

    console.log(
        `Room ${room.id} closed`
    );
}

// ========================================
// START SERVER
// ========================================

server.listen(
    PORT,
    () => {

        console.log(
            `QuickPlay backend running on port ${PORT}`
        );

    }
);
   

