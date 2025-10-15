# Fidelite Test - Dockerfile
FROM node:18-alpine
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY . .

# Runtime
ENV PORT=4000
EXPOSE 4000
CMD ["node", "server.js"]
