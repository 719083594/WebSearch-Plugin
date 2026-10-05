FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pil fonts-wqy-microhei ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONUTF8=1 TZ=Asia/Shanghai SEARCH_PORT=3080
WORKDIR /app
COPY --chown=node:node package.json api.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node renderer ./renderer
COPY --chown=node:node service/server.mjs ./service/server.mjs
USER node
EXPOSE 3080
CMD ["node", "service/server.mjs"]
