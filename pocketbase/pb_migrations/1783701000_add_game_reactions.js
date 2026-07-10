migrate((app) => {
    const players = app.findCollectionByNameOrId("players")
    const games = app.findCollectionByNameOrId("games")
    const participantRule =
        '@request.auth.id != "" && (host = @request.auth.id || guest = @request.auth.id)'
    const reactions = new Collection({
        type: "base",
        name: "game_reactions",
        listRule: participantRule,
        viewRule: participantRule,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
            {
                type: "relation",
                name: "game",
                required: true,
                collectionId: games.id,
                cascadeDelete: true,
                maxSelect: 1,
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
                required: true,
                collectionId: players.id,
                cascadeDelete: true,
                maxSelect: 1,
            },
            {
                type: "relation",
                name: "sender",
                required: true,
                collectionId: players.id,
                cascadeDelete: true,
                maxSelect: 1,
            },
            {
                type: "select",
                name: "kind",
                required: true,
                maxSelect: 1,
                values: ["wow", "plus_one", "poop", "mind_blown", "facepalm", "heart", "gg"],
            },
            {
                type: "text",
                name: "nonce",
                required: true,
                max: 32,
            },
            {
                type: "autodate",
                name: "created",
                onCreate: true,
                onUpdate: false,
            },
            {
                type: "autodate",
                name: "updated",
                onCreate: true,
                onUpdate: true,
            },
        ],
        indexes: [
            "CREATE UNIQUE INDEX idx_game_reactions_game ON game_reactions (game)",
            "CREATE INDEX idx_game_reactions_host ON game_reactions (host)",
            "CREATE INDEX idx_game_reactions_guest ON game_reactions (guest)",
        ],
    })
    app.save(reactions)
}, (app) => {
    app.delete(app.findCollectionByNameOrId("game_reactions"))
})