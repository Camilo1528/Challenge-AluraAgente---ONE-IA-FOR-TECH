FROM node:18-alpine

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer el puerto de Vite
EXPOSE 5173

# Correr en modo dev, o `npm run preview` para producción rápida
CMD ["npm", "run", "dev", "--", "--host"]
