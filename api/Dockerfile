# Etapa de pruebas: el Jenkinsfile la usa con `docker build --target test`
# y luego la corre contra un Postgres (necesita DATABASE_URL).
FROM node:22-alpine AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "test"]

# Imagen de producción (etapa final: es la que se construye por defecto)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY db ./db
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
