migrate((app) => {
    const games = app.findCollectionByNameOrId("games")
    games.fields.add(new JSONField({
        name: "round_results",
        maxSize: 1048576,
    }))
    app.save(games)
}, (app) => {
    const games = app.findCollectionByNameOrId("games")
    games.fields.removeByName("round_results")
    app.save(games)
})