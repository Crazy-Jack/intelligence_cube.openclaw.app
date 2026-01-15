# Single-stage build (simpler, easier to debug)
# Using Node.js 20 because Vite 7.1.3 requires Node.js 20.19+ or 22.12+
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install

# Copy application files
COPY . .

# Build the frontend (creates dist/ folder)
RUN npm run build

# Expose port 8080 (Cloud Run requirement)
EXPOSE 8080

# Set environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Start the Express server
CMD ["node", "serve.js"]
