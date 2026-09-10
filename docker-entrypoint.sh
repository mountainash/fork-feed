#!/bin/sh
set -eu

if [ -z "${TUNNEL_TOKEN:-}" ]; then
	if [ "${REQUIRE_TUNNEL:-false}" = "true" ]; then
		echo "TUNNEL_TOKEN must be set when REQUIRE_TUNNEL is true" >&2
		exit 1
	fi
	exec kontrolplane-feed
fi

kontrolplane-feed &
app_pid=$!

# cloudflared's ICMP proxy needs its GID inside ping_group_range, which defaults to
# the empty range "1 0". The proxy is unused for HTTP tunnels; widening it just
# silences the startup warning. Ignore failures where the host disallows it.
echo "0 2147483647" > /proc/sys/net/ipv4/ping_group_range 2>/dev/null || true

cloudflared tunnel --no-autoupdate run --token "$TUNNEL_TOKEN" &
tunnel_pid=$!

shutdown() {
	kill -TERM "$app_pid" "$tunnel_pid" 2>/dev/null || true
	wait "$app_pid" "$tunnel_pid" 2>/dev/null || true
	exit 0
}

trap shutdown INT TERM

while kill -0 "$app_pid" 2>/dev/null && kill -0 "$tunnel_pid" 2>/dev/null; do
	sleep 1
done

set +e
if kill -0 "$app_pid" 2>/dev/null; then
	wait "$tunnel_pid"
	status=$?
else
	wait "$app_pid"
	status=$?
fi
set -e

kill -TERM "$app_pid" "$tunnel_pid" 2>/dev/null || true
wait "$app_pid" "$tunnel_pid" 2>/dev/null || true
exit "$status"
