FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3900

# MCP mode (stdio)
# CMD ["node", "src/mcp.js"]

# HTTP server mode (default)
CMD ["node", "src/server.js"]
