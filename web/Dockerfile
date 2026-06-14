# Dev-mode image for the Vite app (matches docker-compose.yml `web` service).
# A production build would add a `build` stage + nginx; the skeleton ships the dev
# server for fast iteration.
FROM node:22-alpine
WORKDIR /app

# Install deps first for layer caching.
COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
