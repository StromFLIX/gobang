migrate((app) => {
    const games = app.findCollectionByNameOrId("games")
    games.fields.getByName("moves").required = false
    app.save(games)
}, (app) => {
    const games = app.findCollectionByNameOrId("games")
    games.fields.getByName("moves").required = true
    app.save(games)
})
