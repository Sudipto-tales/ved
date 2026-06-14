# Multi-stage build for the two VED binaries. docker-compose.yml builds this with
# `target: node` and `target: controlplane` (both from one cached build stage).
FROM golang:1.22-alpine AS build
WORKDIR /src

# Cache deps first.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/node ./cmd/node
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/controlplane ./cmd/controlplane

# --- node: the per-school tenant-plane binary ---
FROM alpine:3.20 AS node
RUN apk add --no-cache ca-certificates
COPY --from=build /out/node /usr/local/bin/node
EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/node"]

# --- controlplane: the central cloud binary ---
FROM alpine:3.20 AS controlplane
RUN apk add --no-cache ca-certificates
COPY --from=build /out/controlplane /usr/local/bin/controlplane
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/controlplane"]
