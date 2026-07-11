onBootstrap((event) => {
    function environmentFlag(name, fallback) {
        const value = $os.getenv(name)
        if (!value) return fallback
        if (value === "true") return true
        if (value === "false") return false
        throw new Error(name + " must be true or false")
    }

    function environmentPort(name, fallback) {
        const value = $os.getenv(name)
        if (!value) return fallback
        const port = Number(value)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error(name + " must be an integer between 1 and 65535")
        }
        return port
    }

    function requiredEnvironment(name) {
        const value = $os.getenv(name)
        if (!value) throw new Error(name + " is required when PB_SMTP_ENABLED=true")
        return value
    }

    function configureMail() {
        const settings = event.app.settings()
        const smtpEnabled = environmentFlag("PB_SMTP_ENABLED", false)

        settings.meta.appName = $os.getenv("PB_APP_NAME") || "Gobang"
        settings.smtp.enabled = smtpEnabled

        if (smtpEnabled) {
            const username = $os.getenv("PB_SMTP_USERNAME")
            const password = $os.getenv("PB_SMTP_PASSWORD")
            const authMethod = $os.getenv("PB_SMTP_AUTH_METHOD") || "PLAIN"
            if ((username && !password) || (!username && password)) {
                throw new Error("PB_SMTP_USERNAME and PB_SMTP_PASSWORD must be set together")
            }
            if (authMethod !== "PLAIN" && authMethod !== "LOGIN") {
                throw new Error("PB_SMTP_AUTH_METHOD must be PLAIN or LOGIN")
            }

            settings.meta.appURL = requiredEnvironment("PB_APP_URL").replace(/\/$/, "")
            settings.meta.senderName = $os.getenv("PB_MAIL_SENDER_NAME") || settings.meta.appName
            settings.meta.senderAddress = requiredEnvironment("PB_MAIL_SENDER_ADDRESS")
            settings.smtp.host = requiredEnvironment("PB_SMTP_HOST")
            settings.smtp.port = environmentPort("PB_SMTP_PORT", 587)
            settings.smtp.username = username
            settings.smtp.password = password
            settings.smtp.authMethod = authMethod
            settings.smtp.tls = environmentFlag("PB_SMTP_TLS", false)
            settings.smtp.localName = $os.getenv("PB_SMTP_LOCAL_NAME")
        }

        event.app.save(settings)
    }

    event.next()

    configureMail()

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
