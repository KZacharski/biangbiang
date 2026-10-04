#!/bin/sh
set -eu

# The image ships /app/data owned by `node` (uid 1000), but a bind mount hides
# that directory and exposes the host's ownership instead - which is usually
# root, or whatever uid happened to create it. The container runs as an
# unprivileged user, so without this it would fail with EACCES on the very first
# write (state.json, mirrored artifacts, generated PWA icons).
#
# Fix the ownership while we still have the privileges to do so, then hand the
# process over to `node`. This makes a plain `./data:/app/data` bind mount work
# on any host, with no manual chown.
if [ "$(id -u)" = "0" ]; then
  data_dir="${DATA_DIR:-/app/data}"
  mkdir -p "$data_dir"
  chown -R node:node "$data_dir"
  exec su-exec node "$@"
fi

# Already unprivileged (e.g. `user:` in the Compose file, or `docker run
# --user`), so there is nothing we can or should change.
exec "$@"
