migrate((app) => {
    const players = app.findCollectionByNameOrId("players")
    const games = app.findCollectionByNameOrId("games")
    const participantRule =
        '@request.auth.id != "" && (challenger = @request.auth.id || recipient = @request.auth.id)'
    const invitations = new Collection({
        type: "base",
        name: "invitations",
        listRule: participantRule,
        viewRule: participantRule,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
            {
                type: "relation",
                name: "challenger",
                required: true,
                collectionId: players.id,
                cascadeDelete: true,
                maxSelect: 1,
            },
            {
                type: "relation",
                name: "recipient",
                required: true,
                collectionId: players.id,
                cascadeDelete: true,
                maxSelect: 1,
            },
            {
                type: "json",
                name: "challenger_profile",
                required: true,
                maxSize: 4096,
            },
            {
                type: "json",
                name: "recipient_profile",
                required: true,
                maxSize: 4096,
            },
            {
                type: "select",
                name: "status",
                required: true,
                maxSelect: 1,
                values: ["pending", "accepted", "dismissed", "cancelled", "expired"],
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
            "CREATE INDEX idx_invitations_challenger ON invitations (challenger)",
            "CREATE INDEX idx_invitations_recipient ON invitations (recipient)",
            "CREATE INDEX idx_invitations_status ON invitations (status)",
            "CREATE UNIQUE INDEX idx_invitations_pending_pair ON invitations (challenger, recipient) WHERE status = 'pending'",
        ],
    })
    app.save(invitations)
}, (app) => {
    app.delete(app.findCollectionByNameOrId("invitations"))
})