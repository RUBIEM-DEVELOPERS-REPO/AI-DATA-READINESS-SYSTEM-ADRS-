# ─── BUILDER STAGE ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies if needed (e.g. native addons)
RUN apk add --no-cache python3 make g++

# Copy package config and lockfiles
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install all dependencies including devDependencies for building
RUN npm ci

# Copy full application source
COPY . .

# Build frontend and backend
RUN npm run build

# Prune dev dependencies (only keep prod runtime dependencies)
RUN npm prune --production

# ─── RUNTIME STAGE ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy runtime node_modules, compiled assets, and package configurations
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Expose server port
EXPOSE 5000

# Run as non-root 'node' user for security hardening
USER node

# Healthcheck to verify service availability
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
