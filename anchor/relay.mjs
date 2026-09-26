#!/usr/bin/env node
/**
 * Optional self-hosted signaling relay (instead of public Nostr relays).
 *   node anchor/relay.mjs [--port 8787]
 * Put it behind TLS (e.g. Caddy) and use wss://your-host in Settings > Network.
 */
import { createWsRelayServer } from '@trystero-p2p/ws-relay/server'
const i = process.argv.indexOf('--port')
const port = i > 0 ? Number(process.argv[i + 1]) : 8787
createWsRelayServer({ port })
console.log(`relay listening on ws://0.0.0.0:${port}`)
