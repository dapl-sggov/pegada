# ============================================================
# FPL Ponte — Backend (Node.js + Express)
# Imagem multi-stage para produção no CEGER.
#
# IMPORTANTE: o contexto de build é o diretório `app/` (não `app/backend/`),
# para que o frontend estático possa ser copiado para a imagem.
# Build: docker build -f backend/Dockerfile -t fpl-app ./app
# (o docker-compose já faz isto automaticamente)
# ============================================================

# ---- Stage 1: dependências ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# ---- Stage 2: runtime ----
FROM node:22-bookworm-slim AS runtime
# Segurança: utilizador não-root
RUN groupadd --system fpl && useradd --system --gid fpl --create-home fpl
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3717

# Dependências de produção
COPY --from=deps /app/node_modules ./node_modules
# Código do backend
COPY backend/package.json ./
COPY backend/src ./src
# Frontend estático servido pelo backend
COPY frontend ./frontend

# Diretório de dados (volume montado em produção; usado apenas
# em modo legado fs — em produção os anexos vão para MinIO)
RUN mkdir -p /app/data && chown -R fpl:fpl /app
USER fpl

EXPOSE 3717

# Healthcheck nativo — o orquestrador do CEGER usa este sinal
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3717)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
