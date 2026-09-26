/**
 * The `room` object available to office code. This source is prepended to the
 * owner's code and runs inside a Web Worker inside a sandboxed, opaque-origin
 * iframe. It only talks to the game through postMessage, and the host checks
 * every call against the permissions the visitor approved.
 *
 *   room.me                         { id, name }
 *   room.players()                  people in this office: [{ id, name, x, y }]
 *   room.isHost()                   true on exactly one peer in the office (run shared logic there)
 *   room.state.get(k) / set(k, v) / delete(k) / all()   shared, synced, per office (perm: state)
 *   room.broadcast(event, data)     to everyone in the office running this code (perm: events)
 *   room.on(event, fn)              'enter' 'leave' 'state' 'message' 'panel' 'interact' 'host' 'tick'
 *   room.sprites.spawn(id, item, x, y, facing?) / move(id, x, y, facing?) / remove(id)   (perm: sprites)
 *   room.ui.toast(text) / panel(html) / post(data) / close()                         (perm: ui)
 *   room.embed(url)                 open an allowed site in a panel (perm: embed)
 *   fetch(url)                      only to domains in the manifest (perm: network)
 */
export const SDK_SOURCE = String.raw`
(() => {
  const handlers = {}
  const mirror = { state: {}, players: [], me: { id: '', name: '' }, host: false, info: {} }
  const emit = (ev, ...a) => (handlers[ev] || []).forEach((f) => { try { f(...a) } catch (e) { post({ t: 'error', message: String(e && e.stack || e) }) } })
  const post = (m) => self.postMessage(m)
  const call = (fn, ...args) => post({ t: 'call', fn, args })
  const room = {
    get me() { return mirror.me },
    get info() { return mirror.info },
    players: () => mirror.players.slice(),
    isHost: () => mirror.host,
    on: (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn) },
    state: {
      get: (k) => mirror.state[k],
      all: () => ({ ...mirror.state }),
      set: (k, v) => { mirror.state[k] = v; call('state.set', k, v) },
      delete: (k) => { delete mirror.state[k]; call('state.delete', k) },
    },
    broadcast: (event, data) => call('broadcast', event, data),
    sprites: {
      spawn: (id, item, x, y, f) => call('sprites.spawn', id, item, x, y, f || 'S'),
      move: (id, x, y, f) => call('sprites.move', id, x, y, f),
      remove: (id) => call('sprites.remove', id),
    },
    ui: {
      toast: (text) => call('ui.toast', String(text)),
      panel: (html) => call('ui.panel', String(html)),
      post: (data) => call('ui.post', data),
      close: () => call('ui.close'),
    },
    embed: (url) => call('embed', String(url)),
    log: (...a) => post({ t: 'log', args: a.map(String) }),
  }
  self.room = room
  self.console = { log: room.log, warn: room.log, error: room.log, info: room.log }
  self.onmessage = (e) => {
    const m = e.data || {}
    switch (m.t) {
      case 'ping': post({ t: 'pong', n: m.n }); break
      case 'init': Object.assign(mirror, m.mirror); break
      case 'players': mirror.players = m.players; break
      case 'host': if (mirror.host !== m.host) { mirror.host = m.host; emit('host', m.host) } break
      case 'state': if (m.v === undefined) delete mirror.state[m.k]; else mirror.state[m.k] = m.v; emit('state', m.k, m.v); break
      case 'event': emit(m.ev, ...(m.args || [])); break
    }
  }
})();
`
