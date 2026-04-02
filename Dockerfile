FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun build --compile --target=bun-linux-x64 ./src/cli.ts --outfile /deerflow-launcher

FROM scratch AS artifact
COPY --from=builder /deerflow-launcher /deerflow-launcher
