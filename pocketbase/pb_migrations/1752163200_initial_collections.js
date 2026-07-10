migrate((app) => {
    const players = new Collection({
        type: "auth",
        name: "players",
        listRule: "id = @request.auth.id",
        viewRule: "id = @request.auth.id",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
            {
                type: "text",
                name: "display_name",
                required: true,
                min: 1,
                max: 32,
            },
            {
                type: "text",
                name: "avatar_seed",
                required: true,
                min: 1,
                max: 64,
            },
            {
                type: "bool",
                name: "is_guest",
            },
        ],
        passwordAuth: {
            enabled: true,
        },
    })
    app.save(players)

    const participantRule =
        '@request.auth.id != "" && (host = @request.auth.id || guest = @request.auth.id)'
    const games = new Collection({
        type: "base",
        name: "games",
        listRule: participantRule,
        viewRule: participantRule,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
            {
                type: "text",
                name: "invite_code",
                required: true,
                min: 8,
                max: 32,
            },
            {
                type: "relation",
                name: "host",
                required: true,
                collectionId: players.id,
                cascadeDelete: true,
                maxSelect: 1,
            },
            {
                type: "relation",
                name: "guest",
                collectionId: players.id,
                maxSelect: 1,
            },
            {
                type: "relation",
                name: "black_player",
                collectionId: players.id,
                maxSelect: 1,
            },
            {
                type: "relation",
                name: "white_player",
                collectionId: players.id,
                maxSelect: 1,
            },
            {
                type: "relation",
                name: "winner",
                collectionId: players.id,
                maxSelect: 1,
            },
            {
                type: "relation",
                name: "resigned_by",
                collectionId: players.id,
                maxSelect: 1,
            },
            {
                type: "json",
                name: "host_profile",
                required: true,
                maxSize: 4096,
            },
            {
                type: "json",
                name: "guest_profile",
                maxSize: 4096,
            },
            {
                type: "select",
                name: "status",
                required: true,
                maxSelect: 1,
                values: ["waiting", "active", "won", "draw", "resigned", "cancelled"],
            },
            {
                type: "json",
                name: "board",
                required: true,
                maxSize: 32768,
            },
            {
                type: "json",
                name: "moves",
                maxSize: 262144,
            },
            {
                type: "select",
                name: "turn",
                required: true,
                maxSelect: 1,
                values: ["black", "white"],
            },
            { type: "number", name: "black_captures", min: 0, onlyInt: true },
            { type: "number", name: "white_captures", min: 0, onlyInt: true },
            { type: "number", name: "revision", min: 0, onlyInt: true },
            { type: "number", name: "round", min: 1, onlyInt: true },
            { type: "number", name: "host_score", min: 0, onlyInt: true },
            { type: "number", name: "guest_score", min: 0, onlyInt: true },
            { type: "bool", name: "host_rematch" },
            { type: "bool", name: "guest_rematch" },
        ],
        indexes: [
            "CREATE UNIQUE INDEX idx_games_invite_code ON games (invite_code)",
            "CREATE INDEX idx_games_host ON games (host)",
            "CREATE INDEX idx_games_guest ON games (guest)",
        ],
    })
    app.save(games)
}, (app) => {
    try {
        app.delete(app.findCollectionByNameOrId("games"))
    } catch {
        // Collection may already be absent during a partial rollback.
    }
    try {
        app.delete(app.findCollectionByNameOrId("players"))
    } catch {
        // Collection may already be absent during a partial rollback.
    }
})
