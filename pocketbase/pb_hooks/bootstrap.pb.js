onBootstrap((event) => {
    event.next()

    const email = $os.getenv("PB_SUPERUSER_EMAIL")
    const password = $os.getenv("PB_SUPERUSER_PASSWORD")
    if (!email || !password) {
        throw new Error("PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD are required")
    }

    const collection = event.app.findCollectionByNameOrId("_superusers")
    let superuser
    try {
        superuser = event.app.findAuthRecordByEmail("_superusers", email)
    } catch {
        superuser = new Record(collection)
    }

    superuser.set("email", email)
    superuser.set("password", password)
    event.app.save(superuser)
})
