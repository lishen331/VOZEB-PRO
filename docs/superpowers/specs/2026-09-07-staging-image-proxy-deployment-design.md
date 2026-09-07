# Staging Image Proxy Deployment Design

## Goal

Keep GitHub Actions as the sole builder and GHCR as the source of immutable
`sha-<commit>` images. Speed up staging deployment by pulling through a
verified GHCR proxy before falling back to GHCR.

## Verified facts

- The staging server is in `cn-guangzhou`.
- Direct GHCR egress can make deploys wait many minutes for new layers.
- `ghcr.nju.edu.cn/lishen331/vozeb-pro:sha-66b7aeb380389a51ec6d4384ef344659fb1e3e70`
  returned the expected OCI manifest and pulled successfully on the staging
  server in about 1.2 seconds with cached layers.
- The account is enterprise-certified, so the free ACR Personal Edition is not
  available. No paid ACR resource will be created.

## Deployment flow

1. GitHub Actions runs the existing checks, builds `linux/amd64`, and publishes
   both `develop` and `sha-<commit>` tags to GHCR.
2. The deployment job connects to staging over its existing SSH secret.
3. It sets `VOZEB_PRO_IMAGE` to the GHCR proxy URL and runs `docker compose pull`.
4. If the proxy pull fails, it switches to the original GHCR URL and retries.
5. Compose starts the application and generation worker, then the existing
   readiness check confirms deployment success.

## Boundaries

- No registry credentials, cloud AccessKeys, or new paid cloud resources.
- No changes to application code, data volumes, database, OSS, or port 3001.
- The original GHCR image remains the automatic recovery path.

## Acceptance criteria

1. A `develop` push still completes all quality gates before deployment.
2. The deployment pulls a matching immutable SHA image through the proxy when
   it is reachable.
3. An unavailable proxy causes one automatic official-GHCR retry.
4. `/api/health/ready` succeeds and both application containers use the same
   selected SHA image.
