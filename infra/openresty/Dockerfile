FROM openresty/openresty:1.27.1.2-0-alpine

RUN apk add --no-cache openssl

COPY infra/openresty/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf
COPY infra/openresty/locations.conf /usr/local/openresty/nginx/conf/locations.conf

# Generate a self-signed certificate so HTTPS (port 443) works out of the box.
# The application also keeps serving plain HTTP on port 80, so providing a
# certificate is never strictly required. Mount/override real certificates to
# use your own in production.
RUN mkdir -p /etc/nginx/certs && \
    openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
      -keyout /etc/nginx/certs/privkey.pem \
      -out /etc/nginx/certs/fullchain.pem \
      -subj "/CN=phrolova.local" \
      -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
