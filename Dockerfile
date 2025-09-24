FROM node:22-alpine

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./
COPY tsconfig.json ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY src/ ./src/

RUN yarn build
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node dist/health-check.js

CMD ["yarn", "start"]
