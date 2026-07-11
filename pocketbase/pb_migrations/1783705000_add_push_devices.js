migrate((app) => {
    const players = app.findCollectionByNameOrId("players")
    const devices = new Collection({
        type: "base",
        name: "push_devices",
        listRule: null,
        viewRule: null,
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
                type: "text",
                name: "token",
                required: true,
                max: 4096,
            },
            {
                type: "select",
                name: "platform",
                required: true,
                maxSelect: 1,
                values: ["android"],
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
            "CREATE UNIQUE INDEX idx_push_devices_token ON push_devices (token)",
            "CREATE INDEX idx_push_devices_player ON push_devices (player)",
        ],
    })
    app.save(devices)
}, (app) => {
    app.delete(app.findCollectionByNameOrId("push_devices"))
})
