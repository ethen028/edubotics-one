# Image for running agent code. No packages, no shell tools beyond Node, runs as an unprivileged user.
# The container itself is started with --network none --read-only (see src/lib/agent/sandbox.ts).
FROM node:22-alpine
WORKDIR /sandbox
COPY runner.mjs /sandbox/runner.mjs
USER 65534:65534
ENTRYPOINT ["node", "/sandbox/runner.mjs"]
