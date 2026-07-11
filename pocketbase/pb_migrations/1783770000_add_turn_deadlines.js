migrate((app) => {
    const games = app.findCollectionByNameOrId("games")
    games.fields.add(new DateField({
        name: "turn_started_at",
    }))
    games.fields.add(new BoolField({
        name: "turn_reminder_sent",
    }))
    app.save(games)
}, (app) => {
    const games = app.findCollectionByNameOrId("games")
    games.fields.removeByName("turn_started_at")
    games.fields.removeByName("turn_reminder_sent")
    app.save(games)
})
