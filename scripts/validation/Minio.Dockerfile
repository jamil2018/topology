# Community MinIO is source-only; build the pinned upstream release.
# https://github.com/minio/minio/tree/RELEASE.2025-10-15T17-29-55Z
FROM golang:1.24.8-alpine AS build
ENV CGO_ENABLED=0
RUN go install github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z
FROM alpine:3.22
RUN apk add --no-cache ca-certificates curl
COPY --from=build /go/bin/minio /usr/local/bin/minio
ENTRYPOINT ["minio"]
