ARG ARCH=
FROM ${ARCH}node:17

# Move to working directory /app
WORKDIR /app

# Copy the code into the container
COPY --chown=node:node . .

# Build the application
RUN npm install && \
    npx tsc

# Export necessary port
EXPOSE 8000

# Command to run when starting the container
ENTRYPOINT [ "su", "node", "-c", "/usr/local/bin/node dist/index.js" ]
