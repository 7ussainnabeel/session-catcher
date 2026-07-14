# --- Stage 1: Build the React frontend ---
FROM node:20-alpine AS build-stage

WORKDIR /app

# Copy package files and install dependencies
COPY frontend/package.json frontend/tsconfig.json frontend/vite.config.ts frontend/tailwind.config.js frontend/postcss.config.js frontend/index.html ./
RUN npm install

# Copy source code and build production bundle
COPY frontend/src ./src
RUN npm run build

# --- Stage 2: Serve the application via Nginx ---
FROM nginx:alpine

# Copy custom nginx configuration
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Copy build artifacts from stage 1
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
