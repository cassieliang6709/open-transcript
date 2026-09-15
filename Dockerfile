FROM rust:1.98-bookworm AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/open-transcript /usr/local/bin/open-transcript
ENV BIND_ADDR=0.0.0.0:4242
EXPOSE 4242
CMD ["open-transcript"]
