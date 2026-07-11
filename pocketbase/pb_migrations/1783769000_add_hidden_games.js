migrate((app) => {
    const games = app.findCollectionByNameOrId("games")
    games.fields.add(new JSONField({
        name: "hidden_by",
        maxSize: 1024,
    }))
    app.save(games)
}, (app) => {
    const games = app.findCollectionByNameOrId("games")
    games.fields.removeByName("hidden_by")
    app.save(games)
})
