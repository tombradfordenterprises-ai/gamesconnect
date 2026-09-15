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

```
res.end("QuickPlay backend is running!");
```

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

```
if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
}
```

}

function generatePlayerName() {

```
return (
    "Player" +
    Math.floor(1000 + Math.random() * 9000)
);
```

}

function generateRoomId() {

```
return Math.random()
    .toString(36)
    .substring(2, 10);
```

}

// ========================================
// REMOVE FROM QUEUES
// ========================================

function removeFromQueues(ws) {

```
for (const game of Object.keys(queues)) {

    queues[game] =
        queues[game].filter(
            player => player !== ws
        );
}
```

}

// ========================================
// FIND MATCH
// ========================================

function findMatch(ws, game) {

```
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
```

}

// ========================================
// CREATE ROOM
// ========================================

function createRoom(player1, player2, game) {

```
const roomId = generateRoomId();

const room = {

    id: roomId,

    game: game,

    players: [
        player1,
        player2
    ],

    // ================================
    // TIC-TAC-TOE
    // ================================

    board: [
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ""
    ],

    currentTurn:
        Math.random() < 0.5
            ? 0
            : 1,

    gameOver: false,

    winner: null,

    rematchRequests: new Set(),

    // ================================
    // CHECKERS
    // ================================

    checkersBoard: null,

    checkersSelected: null,

    checkersMustContinue: null
};

rooms.set(
    roomId,
    room
);

players.get(player1).room =
    roomId;

players.get(player2).room =
    roomId;

players.get(player1).playerIndex = 0;
players.get(player2).playerIndex = 1;

console.log(
    `Match created: ${game} | ${roomId}`
);

// ====================================
// PLAYER 1
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
// PLAYER 2
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
// START GAME
// ====================================

if (game === "tictactoe") {

    startTicTacToe(room);

}

if (game === "checkers") {

    startCheckers(room);

}
```

}

// ============================================================
//                         TIC-TAC-TOE
// ============================================================

function startTicTacToe(room) {

```
room.board = [
    "",
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

send(player1, {

    type:
        "tictactoe_start",

    board:
        room.board,

    yourSymbol:
        "X",

    currentTurn:
        room.currentTurn,

    playerIndex:
        0

});

send(player2, {

    type:
        "tictactoe_start",

    board:
        room.board,

    yourSymbol:
        "O",

    currentTurn:
        room.currentTurn,

    playerIndex:
        1

});

console.log(
    `Tic-Tac-Toe started: ${room.id}`
);
```

}

// ========================================
// CHECK TIC-TAC-TOE WINNER
// ========================================

function checkWinner(board) {

```
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

for (const line of winningLines) {

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
```

}

// ========================================
// BROADCAST TIC-TAC-TOE
// ========================================

function broadcastBoard(room) {

```
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
```

}

// ========================================
// TIC-TAC-TOE MOVE
// ========================================

function handleTicTacToeMove(
ws,
message
) {

```
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

if (room.gameOver) {
    return;
}

const playerIndex =
    player.playerIndex;

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

if (
    !Number.isInteger(position) ||
    position < 0 ||
    position > 8
) {

    return;
}

if (
    room.board[position] !== ""
) {

    return;
}

const symbol =
    playerIndex === 0
        ? "X"
        : "O";

room.board[position] =
    symbol;

const result =
    checkWinner(room.board);

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

    return;
}

room.currentTurn =
    playerIndex === 0
        ? 1
        : 0;

broadcastBoard(room);
```

}

// ========================================
// TIC-TAC-TOE REMATCH
// ========================================

function handleRematch(ws) {

```
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

room.rematchRequests.add(ws);

send(ws, {

    type:
        "rematch_waiting"

});

if (
    room.rematchRequests.size === 2
) {

    room.currentTurn =
        Math.random() < 0.5
            ? 0
            : 1;

    startTicTacToe(room);

}
```

}

// ============================================================
//                         CHECKERS
// ============================================================

// Board coordinates:
//
// row 0 = top
// row 7 = bottom
//
// Player 0 starts at the top and moves downward.
// Player 1 starts at the bottom and moves upward.
//
// Pieces:
//
// "r" = player 0 regular
// "R" = player 0 king
// "b" = player 1 regular
// "B" = player 1 king

function createCheckersBoard() {

```
const board =
    Array.from(
        { length: 8 },
        () =>
            Array(8).fill(null)
    );

// Player 0
for (let row = 0; row < 3; row++) {

    for (let col = 0; col < 8; col++) {

        if (
            (row + col) % 2 === 1
        ) {

            board[row][col] = "r";

        }

    }

}

// Player 1
for (let row = 5; row < 8; row++) {

    for (let col = 0; col < 8; col++) {

        if (
            (row + col) % 2 === 1
        ) {

            board[row][col] = "b";

        }

    }

}

return board;
```

}

// ========================================
// CHECK PIECE OWNER
// ========================================

function pieceOwner(piece) {

```
if (!piece) {
    return null;
}

if (
    piece === "r" ||
    piece === "R"
) {
    return 0;
}

if (
    piece === "b" ||
    piece === "B"
) {
    return 1;
}

return null;
```

}

// ========================================
// IS KING
// ========================================

function isKing(piece) {

```
return (
    piece === "R" ||
    piece === "B"
);
```

}

// ========================================
// GET DIRECTIONS
// ========================================

function getCheckersDirections(piece) {

```
if (isKing(piece)) {

    return [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1]
    ];

}

const owner =
    pieceOwner(piece);

// Player 0 moves downward
if (owner === 0) {

    return [
        [1, -1],
        [1, 1]
    ];

}

// Player 1 moves upward
return [
    [-1, -1],
    [-1, 1]
];
```

}

// ========================================
// VALID COORDINATE
// ========================================

function validCheckersSquare(row, col) {

```
return (
    row >= 0 &&
    row < 8 &&
    col >= 0 &&
    col < 8
);
```

}

// ========================================
// GET CAPTURE MOVES
// ========================================

function getCaptureMoves(
board,
row,
col
) {

```
const piece =
    board[row][col];

if (!piece) {
    return [];
}

const moves = [];

const directions =
    getCheckersDirections(piece);

for (
    const [dr, dc]
    of directions
) {

    const middleRow =
        row + dr;

    const middleCol =
        col + dc;

    const landingRow =
        row + dr * 2;

    const landingCol =
        col + dc * 2;

    if (
        !validCheckersSquare(
            landingRow,
            landingCol
        )
    ) {
        continue;
    }

    if (
        !validCheckersSquare(
            middleRow,
            middleCol
        )
    ) {
        continue;
    }

    const middlePiece =
        board[middleRow][middleCol];

    const landingPiece =
        board[landingRow][landingCol];

    if (
        middlePiece &&
        pieceOwner(middlePiece) !==
            pieceOwner(piece) &&
        !landingPiece
    ) {

        moves.push({

            fromRow: row,
            fromCol: col,

            toRow: landingRow,
            toCol: landingCol,

            captureRow: middleRow,
            captureCol: middleCol

        });

    }

}

return moves;
```

}

// ========================================
// GET NORMAL MOVES
// ========================================

function getNormalMoves(
board,
row,
col
) {

```
const piece =
    board[row][col];

if (!piece) {
    return [];
}

const moves = [];

const directions =
    getCheckersDirections(piece);

for (
    const [dr, dc]
    of directions
) {

    const newRow =
        row + dr;

    const newCol =
        col + dc;

    if (
        !validCheckersSquare(
            newRow,
            newCol
        )
    ) {
        continue;
    }

    if (
        !board[newRow][newCol]
    ) {

        moves.push({

            fromRow: row,
            fromCol: col,

            toRow: newRow,
            toCol: newCol,

            captureRow: null,
            captureCol: null

        });

    }

}

return moves;
```

}

// ========================================
// DOES PLAYER HAVE A CAPTURE?
// ========================================

function playerHasCapture(
board,
playerIndex
) {

```
for (let row = 0; row < 8; row++) {

    for (let col = 0; col < 8; col++) {

        const piece =
            board[row][col];

        if (
            piece &&
            pieceOwner(piece) ===
                playerIndex
        ) {

            if (
                getCaptureMoves(
                    board,
                    row,
                    col
                ).length > 0
            ) {

                return true;

            }

        }

    }

}

return false;
```

}

// ========================================
// GET ALL LEGAL MOVES
// ========================================

function getAllLegalMoves(
board,
playerIndex
) {

```
const mustCapture =
    playerHasCapture(
        board,
        playerIndex
    );

const moves = [];

for (let row = 0; row < 8; row++) {

    for (let col = 0; col < 8; col++) {

        const piece =
            board[row][col];

        if (
            !piece ||
            pieceOwner(piece) !==
                playerIndex
        ) {
            continue;
        }

        let pieceMoves;

        if (mustCapture) {

            pieceMoves =
                getCaptureMoves(
                    board,
                    row,
                    col
                );

        } else {

            pieceMoves =
                getNormalMoves(
                    board,
                    row,
                    col
                );

        }

        moves.push(
            ...pieceMoves
        );

    }

}

return moves;
```

}

// ========================================
// PROMOTE PIECE
// ========================================

function promoteCheckersPiece(
board,
row,
col
) {

```
const piece =
    board[row][col];

if (
    piece === "r" &&
    row === 7
) {

    board[row][col] = "R";

}

if (
    piece === "b" &&
    row === 0
) {

    board[row][col] = "B";

}
```

}

// ========================================
// BROADCAST CHECKERS BOARD
// ========================================

function broadcastCheckers(
room
) {

```
room.players.forEach(
    (player, index) => {

        send(player, {

            type:
                "checkers_update",

            board:
                room.checkersBoard,

            currentTurn:
                room.currentTurn,

            playerIndex:
                index,

            mustContinue:
                room.checkersMustContinue

        });

    }
);
```

}

// ========================================
// START CHECKERS
// ========================================

function startCheckers(room) {

```
room.checkersBoard =
    createCheckersBoard();

room.currentTurn =
    Math.random() < 0.5
        ? 0
        : 1;

room.gameOver = false;

room.winner = null;

room.checkersMustContinue =
    null;

room.rematchRequests =
    new Set();

broadcastCheckers(room);

console.log(
    `Checkers started: ${room.id}`
);
```

}

// ========================================
// CHECKERS MOVE
// ========================================

function handleCheckersMove(
ws,
message
) {

```
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
    "checkers"
) {
    return;
}

if (room.gameOver) {
    return;
}

const playerIndex =
    player.playerIndex;

// ==================================
// WRONG TURN
// ==================================

if (
    room.currentTurn !==
    playerIndex
) {

    send(ws, {

        type:
            "checkers_invalid_move",

        reason:
            "It is not your turn."

    });

    return;
}

const fromRow =
    Number(message.fromRow);

const fromCol =
    Number(message.fromCol);

const toRow =
    Number(message.toRow);

const toCol =
    Number(message.toCol);

if (
    !validCheckersSquare(
        fromRow,
        fromCol
    ) ||
    !validCheckersSquare(
        toRow,
        toCol
    )
) {

    return;
}

const piece =
    room.checkersBoard[
        fromRow
    ][
        fromCol
    ];

// ==================================
// CHECK PIECE
// ==================================

if (
    !piece ||
    pieceOwner(piece) !==
        playerIndex
) {

    send(ws, {

        type:
            "checkers_invalid_move",

        reason:
            "That is not your piece."

    });

    return;
}

// ==================================
// CONTINUING MULTI-JUMP
// ==================================

if (
    room.checkersMustContinue
) {

    if (
        room.checkersMustContinue.row !==
            fromRow ||
        room.checkersMustContinue.col !==
            fromCol
    ) {

        send(ws, {

            type:
                "checkers_invalid_move",

            reason:
                "You must continue your capture."

        });

        return;
    }

}

// ==================================
// FIND LEGAL MOVE
// ==================================

const allMoves =
    getAllLegalMoves(
        room.checkersBoard,
        playerIndex
    );

const matchingMove =
    allMoves.find(
        move =>
            move.fromRow === fromRow &&
            move.fromCol === fromCol &&
            move.toRow === toRow &&
            move.toCol === toCol
    );

if (!matchingMove) {

    send(ws, {

        type:
            "checkers_invalid_move",

        reason:
            "That move is not legal."

    });

    return;
}

// ==================================
// MAKE MOVE
// ==================================

room.checkersBoard[
    toRow
][
    toCol
] = piece;

room.checkersBoard[
    fromRow
][
    fromCol
] = null;

// ==================================
// CAPTURE
// ==================================

const wasCapture =
    matchingMove.captureRow !== null;

if (wasCapture) {

    room.checkersBoard[
        matchingMove.captureRow
    ][
        matchingMove.captureCol
    ] = null;

}

// ==================================
// PROMOTION
// ==================================

promoteCheckersPiece(
    room.checkersBoard,
    toRow,
    toCol
);

// ==================================
// MULTI-JUMP
// ==================================

if (wasCapture) {

    const nextCaptures =
        getCaptureMoves(
            room.checkersBoard,
            toRow,
            toCol
        );

    if (
        nextCaptures.length > 0
    ) {

        room.checkersMustContinue = {

            row: toRow,
            col: toCol

        };

        broadcastCheckers(room);

        return;
    }

}

// ==================================
// END MULTI-JUMP
// ==================================

room.checkersMustContinue =
    null;

// ==================================
// SWITCH TURN
// ==================================

room.currentTurn =
    playerIndex === 0
        ? 1
        : 0;

// ==================================
// CHECK WIN
// ==================================

const opponent =
    playerIndex === 0
        ? 1
        : 0;

const opponentMoves =
    getAllLegalMoves(
        room.checkersBoard,
        opponent
    );

if (
    opponentMoves.length === 0
) {

    room.gameOver = true;

    room.winner =
        playerIndex;

    room.players.forEach(
        (playerSocket, index) => {

            send(
                playerSocket,
                {

                    type:
                        "checkers_result",

                    board:
                        room.checkersBoard,

                    result:
                        index ===
                        playerIndex
                            ? "win"
                            : "loss",

                    winner:
                        playerIndex

                }
            );

        }
    );

    console.log(
        `Checkers finished: ${room.id} | Player ${playerIndex} wins`
    );

    return;
}

broadcastCheckers(room);
```

}

// ========================================
// CHECKERS REMATCH
// ========================================

function handleCheckersRematch(ws) {

```
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
    "checkers"
) {
    return;
}

room.rematchRequests.add(ws);

send(ws, {

    type:
        "checkers_rematch_waiting"

});

if (
    room.rematchRequests.size === 2
) {

    startCheckers(room);

}
```

}

// ============================================================
//                         WEBSOCKET
// ============================================================

wss.on(
"connection",
ws => {

```
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
            // TIC-TAC-TOE
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

            if (
                message.type ===
                "tictactoe_rematch"
            ) {

                handleRematch(ws);

                return;
            }

            // =========================
            // CHECKERS
            // =========================

            if (
                message.type ===
                "checkers_move"
            ) {

                handleCheckersMove(
                    ws,
                    message
                );

                return;
            }

            if (
                message.type ===
                "checkers_rematch"
            ) {

                handleCheckersRematch(
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

            removeFromQueues(ws);

            leaveGame(ws);

            players.delete(ws);

        }
    );

}
```

);

// ========================================
// LEAVE GAME
// ========================================

function leaveGame(ws) {

```
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
```

}

// ========================================
// START SERVER
// ========================================

server.listen(
PORT,
() => {

```
    console.log(
        `QuickPlay backend running on port ${PORT}`
    );

}
```

);
