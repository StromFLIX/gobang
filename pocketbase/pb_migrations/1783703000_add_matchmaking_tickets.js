migrate((app) => {
    const players = app.findCollectionByNameOrId("players")
    const games = app.findCollectionByNameOrId("games")
    const ownerRule = '@request.auth.id != "" && player = @request.auth.id'
    const tickets = new Collection({
        type: "base",
        name: "matchmaking_tickets",
        listRule: ownerRule,
        viewRule: ownerRule,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
            {
                type: "relation",
                name: "player",
                required: true,
                collectionId: players.id,
                cascadeDelete: true,
                maxSelect: 1,
            },
            {
                type: "json",
                name: "player_profile",
                required: true,
                maxSize: 4096,
            },
            {
                type: "select",
                name: "status",
                required: true,
                maxSelect: 1,
                values: ["waiting", "matched", "consumed", "cancelled", "expired"],
            },
            {
                type: "relation",
                name: "game",
                collectionId: games.id,
                maxSelect: 1,
            },
            {
                type: "text",
                name: "game_invite_code",
                max: 32,
            },
            {
                type: "date",
                name: "expires_at",
                required: true,
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
            "CREATE INDEX idx_matchmaking_player ON matchmaking_tickets (player)",
            "CREATE INDEX idx_matchmaking_status_created ON matchmaking_tickets (status, created)",
            "CREATE UNIQUE INDEX idx_matchmaking_waiting_player ON matchmaking_tickets (player) WHERE status = 'waiting'",
        ],
    })
    app.save(tickets)
}, (app) => {
    app.delete(app.findCollectionByNameOrId("matchmaking_tickets"))
})