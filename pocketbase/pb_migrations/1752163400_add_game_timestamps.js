migrate((app) => {
    const games = app.findCollectionByNameOrId("games")
    games.fields.add(new AutodateField({
        name: "created",
        onCreate: true,
        onUpdate: false,
    }))
    games.fields.add(new AutodateField({
        name: "updated",
        onCreate: true,
        onUpdate: true,
    }))
    app.save(games)
})