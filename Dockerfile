# Stage 1: Install all dependencies (development + production)
FROM node:22-alpine AS deps
WORKDIR /usr/src/app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Stage 2: Build the NestJS application
FROM node:22-alpine AS builder
WORKDIR /usr/src/app
RUN apk add --no-cache openssl
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Install only production dependencies
FROM node:22-alpine AS prod-deps
WORKDIR /usr/src/app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production
RUN npx prisma generate

# Stage 4: Production runner
FROM node:22-alpine AS runner
WORKDIR /usr/src/app
RUN apk add --no-cache openssl

COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY package*.json ./

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/src/main"]
