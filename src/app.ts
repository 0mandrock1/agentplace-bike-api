import Fastify from "fastify"
import { SERVICES } from "./domain/services.js";
import type Database from "better-sqlite3";
import  {  requestSchema } from "./domain/request-validation.js";
import { registerRequest } from "./db/request-repository.js";

type AppOptions = {
    enableFaultInjection?: boolean;
}

export function buildApp(db: Database.Database, {enableFaultInjection}: AppOptions = {}) {

    const app = Fastify({
        logger:true
    })

    app.get('/health', function(request, reply) {
        reply.send({"status":"ok"})
    })

    app.get(('/v1/services'),function(request,reply) {
        reply.send(SERVICES)
    })

    app.post('/v1/requests', async function(request, reply) {
        const parsedRequest = requestSchema.safeParse(request.body)
        if(!parsedRequest.success) {
            return reply.code(422).send({"error":"invalid_request"})
        }
        if (request.headers['x-test-fault'] === 'prewrite') {
            if (enableFaultInjection) {
                request.log.warn(
                    { fault: "prewrite", idempotency_key: parsedRequest.data.idempotency_key },
                    "Simulated failure before write"
                )
                return reply.code(503).send({"error": "service_unavailable"})
            }
        }

        const result =  registerRequest(db, parsedRequest.data)
        request.log.info({ decision: result.kind, idempotency_key: parsedRequest.data.idempotency_key, ...('request_id' in result ? { request_id: result.request_id } : {}) }, 'Request registration');
        if (request.headers['x-test-fault'] === 'lost_ack' && result.kind === 'created') {
            if(enableFaultInjection) {
                request.log.warn(
                    { fault: "lost_ack", idempotency_key: parsedRequest.data.idempotency_key, request_id: result.request_id },
                    "Simulated acknowledgement loss after commit"
                )
                return reply.code(503).send({"error": "service_unavailable"})
            }
        }
        switch (result.kind) {
            case "created":
                return reply.code(201).send({
                    "request_id": result.request_id,
                    "status": "received",
                    "replayed": false,
                    "test_only": true
                })
            case "replayed":
                return reply.code(200).send({
                    "request_id": result.request_id,
                    "status": "received",
                    "replayed": true,
                    "test_only": true
                })
            case "conflict":
                return reply.code(409).send({
                    "error": "idempotency_conflict",
                })
            default: {
            throw new Error('Unhandled result');
        }
        }



    })

    app.setErrorHandler((error, request, reply) => {
        if (
            typeof error === 'object' &&
            error !== null &&
            'statusCode' in error
        ) {

            const status = error.statusCode;

            if (
                typeof status === 'number' &&
                Number.isInteger(status) &&
                status >= 400 &&
                status < 500
            ) {

                return reply.code(status).send({
                    error: 'invalid_request'
                });
            }


    }
    request.log.error(
        { error: "Internal server error" },
        'Internal server error'
    );
    return reply.code(500).send({
                error: 'internal_error'
    });
});
    app.addHook('onClose', async () => {
        db.close()
    });
    return app

}
