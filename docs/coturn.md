# TURN for WebRTC join-without-VPN (optional)

STUN is enough when at least one side has a friendly NAT. Behind two strict (symmetric) NATs, typical for a phone on a mobile carrier, you need a TURN relay. OpenAg never hosts one for you. Run your own coturn on a machine with a public address and give the daemon the shared secret.

## Where to run it

The relay must be reachable from the internet on its ports.
- **VPS:** the simplest option. It has a public IP, so no router changes are needed.
- **Home or office machine:** this works only if its router forwards the ports below to it. For a machine on a private LAN, set `external-ip` (below) to the router's public address. Without port forwarding, the relay works only on that LAN, which is still useful for the relay-only lab check.

## coturn example (`/etc/turnserver.conf`)
```
listening-port=3478
tls-listening-port=5349
realm=turn.example.com
use-auth-secret
static-auth-secret=<a long random secret, 32+ chars>
fingerprint
no-multicast-peers
no-cli
# Behind NAT (home/office): public address, then the machine's private one. Omit on a VPS with a public interface.
# external-ip=203.0.113.10/10.0.0.5
# TLS for turns: on 5349 (any certificate the phone trusts, e.g. Let's Encrypt for realm's name)
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
# Never let the relay reach your own or special networks:
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
# Data channels need only UDP relaying; keep usage bounded.
no-tcp-relay
total-quota=20
user-quota=4
max-bps=2000000
```
Open UDP/TCP 3478, TCP 5349, and the relay port range (UDP 49152-65535 by default; narrow it with `min-port`/`max-port` and forward the same range).

If the daemon and the relay share a LAN, the deny list blocks the relay from reaching the daemon's private address. That is intended for a public relay. For a LAN-only lab check, run a separate config without the private-range lines.

## Daemon environment (never in the DB or the API)
```
OPENAG_RTC_TURN_URLS=turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349
OPENAG_RTC_TURN_SECRET=<the same static-auth-secret>
```
- **Order matters.** The daemon's WebRTC library (werift) uses only the **first** TURN URL, so list the UDP `turn:` URL first. Browsers use them all.
- **The secret stays in the daemon environment.** It is stripped from bot processes and registered with the redactor.
- **Short-lived credentials.** The daemon derives them from the secret using the coturn REST scheme: username `<expiry>:openag`, credential `base64(HMAC-SHA1(secret, username))`.
  - Its own peer and each phone invite (`POST /rtc/invite`, field `turn`) get **1 hour**.
  - A paired phone fetches **7-day** credentials after every successful connection, so it can still reach the relay after up to a week offline. Longer than that, it has to re-pair.

## Check that the relay is used
- Settings → Server → Connection → Direct join shows whether **Relay (TURN)** is configured and how the **last connection** was routed: Direct, Direct through NAT, or Through the relay. `GET /rtc` reports the same as `turn`, `icePolicy` and `lastCandidateType`, and the audit event `rtc_peer` with `state: "connected"` records the route. Addresses are never recorded.
- On a host with Tailscale, a VPN or Docker bridges, `OPENAG_RTC_BIND_IPV4=<the LAN address>` keeps those interfaces out of the daemon's candidates, so a test shows real NAT traversal rather than a VPN path.
- To prove the relay works without leaving your network, start the daemon with `OPENAG_RTC_ICE_POLICY=relay`. Its peers then use only relay candidates. A join that succeeds and shows "Through the relay" proves the relay path. Remove the variable afterwards. It is a test aid and makes every connection slower.
