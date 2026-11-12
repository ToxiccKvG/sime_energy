# Front SIMEE : build Vite, puis Caddy (fichiers statiques + HTTPS + proxy /api vers l'API).
FROM oven/bun:1.3.9 AS build
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
# Valeurs publiques intégrées au bundle (clé anon Supabase : publique, protégée par la RLS)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=/api/V1
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" \
    && bun run build

# Caddy recompilé avec golang.org/x/net corrigé (CVE-2026-78661, 2.11.9 embarque v0.60.0).
# À retirer quand une version officielle de Caddy embarque x/net >= 0.62.0.
FROM caddy:2.11.9-builder-alpine AS caddy
RUN xcaddy build v2.11.9 --replace golang.org/x/net=golang.org/x/net@v0.62.0

FROM caddy:2.11.9-alpine
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
