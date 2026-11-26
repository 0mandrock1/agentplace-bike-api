import { openDatabase } from "./db/sqlite.js"
import { initializeSchema } from "./db/schema.js"
import { buildApp } from "./app.js"

const db = openDatabase("agentplace.db")
initializeSchema(db)
const enableFaultInjection =
    process.env.ENABLE_FAULT_INJECTION === 'true';
const app = buildApp(db,{enableFaultInjection})

app.listen({ port: 3000}, function(err,address){
    if (err) {
        app.log.error(err)
        process.exit(1)
    }
})
