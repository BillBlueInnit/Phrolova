# HTTPS & HTTP for the OpenResty reverse proxy

The reverse proxy exposes both **port 80 (HTTP)** and **port 443 (HTTPS)**:

- **Port 80 (HTTP)** serves the full application and **never requires a
  certificate** — this is the default, always-available access path.
- **Port 443 (HTTPS)** is served **optionally**, as an add-on. It works out of
  the box with a **self-signed certificate generated during the Docker build**,
  so no manual certificate setup is needed for HTTPS to respond.

You can access the app with either `http://host/` or `https://host/`.

## Certificates

The container generates a temporary self-signed certificate at build time and
places it at:

- `/etc/nginx/certs/fullchain.pem`
- `/etc/nginx/certs/privkey.pem`

The 443 server block reads these files. This means HTTPS is always available
without any user-provided certificate, while HTTP never depends on them.

### Using your own (real/production) certificate

To use a real certificate, override the generated files. The simplest approach
is to build your own image or mount real certs over `/etc/nginx/certs`, for
example:

```yaml
openresty:
  volumes:
    - /host/path/to/my-certs:/etc/nginx/certs:ro
```

where `my-certs/` contains `fullchain.pem` and `privkey.pem`. Never commit real
private keys to the repository.

## Switching on HTTPS-aware URL generation

When served behind this proxy over HTTPS, tell Flask to generate `https://`
absolute URLs and mark the session cookie `Secure` by setting:

```bash
USE_HTTPS=1
```

(in `docker-compose.yml`, mapped to `PHROLOVA_USE_HTTPS`). The default is `0`
(plain HTTP), since HTTP is the supported, non-forced path. `ProxyFix`
reads `X-Forwarded-Proto` from the proxy so both `http://` and `https://`
requests are handled correctly.
