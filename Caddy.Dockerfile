FROM caddy:2.10.0-alpine

COPY Caddyfile /etc/caddy/Caddyfile

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --start-interval=1s --retries=5 \
	CMD ["wget", "-q", "--spider", "http://127.0.0.1/health"]
