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

    function requiredEnvironment(name, feature) {
        const value = $os.getenv(name)
        if (!value) throw new Error(name + " is required when " + feature + "=true")
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

            settings.meta.appURL = requiredEnvironment("PB_APP_URL", "PB_SMTP_ENABLED").replace(/\/$/, "")
            settings.meta.senderName = $os.getenv("PB_MAIL_SENDER_NAME") || settings.meta.appName
            settings.meta.senderAddress = requiredEnvironment("PB_MAIL_SENDER_ADDRESS", "PB_SMTP_ENABLED")
            settings.smtp.host = requiredEnvironment("PB_SMTP_HOST", "PB_SMTP_ENABLED")
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

function configureGoogleAuth(app) {
    const enabledValue = $os.getenv("PB_GOOGLE_AUTH_ENABLED") || "false"
    if (enabledValue !== "true" && enabledValue !== "false") {
        throw new Error("PB_GOOGLE_AUTH_ENABLED must be true or false")
    }

    const enabled = enabledValue === "true"
    const clientId = $os.getenv("PB_GOOGLE_CLIENT_ID")
    const clientSecret = $os.getenv("PB_GOOGLE_CLIENT_SECRET")
    if (enabled && (!clientId || !clientSecret)) {
        throw new Error(
            "PB_GOOGLE_CLIENT_ID and PB_GOOGLE_CLIENT_SECRET are required when PB_GOOGLE_AUTH_ENABLED=true",
        )
    }

    const players = app.findCollectionByNameOrId("players")
    players.oauth2.enabled = enabled
    players.oauth2.providers = enabled
        ? [{ name: "google", clientId, clientSecret }]
        : []
    app.save(players)
}

$app.rootCmd.addCommand(new Command({
    use: "configure-google-auth",
    run: () => {
        configureGoogleAuth($app)
    },
}))
