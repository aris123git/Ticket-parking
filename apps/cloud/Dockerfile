FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps ./apps
RUN npm install
RUN npm run build -w apps/cloud
ENV NODE_ENV=production
ENV CLOUD_PORT=3200
EXPOSE 3200
CMD ["npm", "run", "start", "-w", "apps/cloud"]
