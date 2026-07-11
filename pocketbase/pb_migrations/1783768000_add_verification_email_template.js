migrate((app) => {
    const players = app.findCollectionByNameOrId("players")
    players.verificationTemplate.subject = "Verify your {APP_NAME} email"
    players.verificationTemplate.body = `<p>Hello,</p>
<p>Thank you for joining {APP_NAME}.</p>
<p>Confirm your email address to finish setting up your player account.</p>
<p><a class="btn" href="{APP_URL}/verify-email?token={TOKEN}" target="_blank" rel="noopener">Verify email</a></p>
<p><i>If you did not create this account, you can ignore this email.</i></p>
<p>Thanks,<br>{APP_NAME}</p>`
    app.save(players)
}, (app) => {
    const players = app.findCollectionByNameOrId("players")
    players.verificationTemplate.subject = "Verify your {APP_NAME} email"
    players.verificationTemplate.body = `<p>Hello,</p>
<p>Thank you for joining us at {APP_NAME}.</p>
<p>Click on the button below to verify your email address.</p>
<p>
  <a class="btn" href="{APP_URL}/_/#/auth/confirm-verification/{TOKEN}" target="_blank" rel="noopener">Verify</a>
</p>
<p><i>If you didn't recently register, please ignore this email.</i></p>
<p>
  Thanks,<br/>
  {APP_NAME} team
</p>`
    app.save(players)
})