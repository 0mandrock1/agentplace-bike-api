import Fastify from "fastify"
import { SERVICES } from "./domain/services.js"

const fastify = Fastify({
    logger:true
})

fastify.get('/health', function(request, reply) {
    reply.send({"status":"ok"})
}) 


fastify.get(('/v1/services'),function(request,reply) {
    reply.send(SERVICES)
})

fastify.listen({ port: 3000}, function(err,address){
    if (err) {
        fastify.log.error(err)
        process.exit(1)
    }
})
