# Use Node.js 20 (required by @supabase/supabase-js)
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
COPY backend/package*.json ./backend/

# Clear npm cache and install dependencies with all optional dependencies
RUN npm cache clean --force
RUN npm install
RUN cd backend && npm install

# Copy source code
COPY . .

# Build frontend (with explicit rollup platform support)
ENV npm_config_target_platform=linux
ENV npm_config_target_arch=x64
RUN npm run build

# Build backend
RUN cd backend && npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production
RUN cd backend && npm prune --production

# Expose port
EXPOSE 3001

# Set NODE_ENV to production
ENV NODE_ENV=production

# Start the application
CMD ["sh", "-c", "cd backend && npm start"]