#!/usr/bin/env bash
# Install janki as a standalone systemd *user* service.
#
# After this, janki runs without VS Code, without a terminal, and comes back
# after a reboot — the Docker stack via `restart: unless-stopped`, the Next
# server via this unit.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
# Machine-specific settings (not in git), e.g. JANKI_AUTH_URL=https://my-host.ts.net:8443
[[ -f "$REPO/deploy/local.env" ]] && . "$REPO/deploy/local.env"
JANKI_AUTH_URL="${JANKI_AUTH_URL:-}"

echo "==> Building production bundle"
( cd "$REPO/app" && npm run build:prod )

echo "==> Installing unit to $UNIT_DIR"
mkdir -p "$UNIT_DIR"
sed -e "s|@REPO@|$REPO|g" -e "s|@AUTH_URL@|$JANKI_AUTH_URL|g" "$REPO/deploy/janki.service" \
  | { if [[ -z "$JANKI_AUTH_URL" ]]; then grep -v '^Environment=AUTH_URL='; else cat; fi; } \
  > "$UNIT_DIR/janki.service"
chmod 644 "$UNIT_DIR/janki.service"

echo "==> Enabling"
systemctl --user daemon-reload
systemctl --user enable --now janki.service

echo "==> Installing desktop launcher"
mkdir -p "$HOME/.local/bin" \
         "$HOME/.local/share/applications" \
         "$HOME/.local/share/icons/hicolor/scalable/apps"
chmod +x "$REPO/deploy/janki-ctl" "$REPO/deploy/dev-servers" "$REPO/deploy/phone-access"
# Symlink rather than copy so edits in the repo take effect immediately.
ln -sf "$REPO/deploy/janki-ctl" "$HOME/.local/bin/janki-ctl"
ln -sf "$REPO/deploy/dev-servers" "$HOME/.local/bin/dev-servers"
ln -sf "$REPO/deploy/janki.svg" "$HOME/.local/share/icons/hicolor/scalable/apps/janki.svg"
sed "s|@HOME@|$HOME|g" "$REPO/deploy/janki.desktop" > "$HOME/.local/share/applications/janki.desktop"
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

if command -v gsettings >/dev/null 2>&1; then
  fav=$(gsettings get org.gnome.shell favorite-apps 2>/dev/null || echo "")
  if [[ -n "$fav" && "$fav" != *"janki.desktop"* ]]; then
    gsettings set org.gnome.shell favorite-apps \
      "$(printf '%s' "$fav" | sed "s/]$/, 'janki.desktop']/")"
    echo "    pinned to dock"
  fi
fi

echo
echo "Done. janki is on http://localhost:3001"
echo
if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]]; then
  cat <<'EOF'
NOTE: user lingering is off, so this service stops when you log out and does
not start until you log in. To make it survive logout and start at boot:

    sudo loginctl enable-linger $USER

EOF
fi
