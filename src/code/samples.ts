import type { RoomCode } from './host'

/** Starter programs shown in the office code editor. */
export const SAMPLES: { id: string; label: string; code: RoomCode }[] = [
  {
    id: 'welcome', label: 'Welcome + visitor counter',
    code: {
      perms: ['state', 'ui', 'players'],
      src: `// Greets everyone who walks in and counts visits (shared by everyone).
room.on('enter', (p) => {
  if (p.id === room.me.id) {
    const n = (room.state.get('visits') || 0) + 1
    room.state.set('visits', n)
    room.ui.toast('Welcome to ' + room.info.name + '! Visitor #' + n)
  }
})
`,
    },
  },
  {
    id: 'tictactoe', label: 'Tic-tac-toe (press E at the desk)',
    code: {
      perms: ['state', 'ui', 'players'],
      src: `// A shared tic-tac-toe board. Press E next to any furniture in this office to play.
const empty = () => Array(9).fill('')
if (!room.state.get('board')) room.state.set('board', empty())
const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
const winner = (b) => (lines.find(([a,c,d]) => b[a] && b[a] === b[c] && b[a] === b[d]) || [])[0]
const turn = (b) => b.filter(Boolean).length % 2 ? 'O' : 'X'
function html(b) {
  const w = winner(b) !== undefined ? b[winner(b)] : null
  const cells = b.map((v, i) => '<button data-i="' + i + '" style="width:64px;height:64px;font-size:28px">' + (v || '&nbsp;') + '</button>')
  return '<div style="display:grid;grid-template-columns:repeat(3,64px);gap:4px">' + cells.join('') + '</div>' +
    '<p>' + (w ? w + ' wins!' : b.every(Boolean) ? 'Draw.' : turn(b) + ' to play') + '</p><button id="reset">New game</button>' +
    '<script>document.onclick=(e)=>{const i=e.target.dataset.i; if(i!==undefined) room.post({move:+i}); if(e.target.id==="reset") room.post({reset:1})}<\/script>'
}
let open = false
room.on('interact', () => { open = true; room.ui.panel(html(room.state.get('board'))) })
room.on('state', (k, v) => { if (k === 'board' && open) room.ui.panel(html(v)) })
room.on('panel', (m) => {
  const b = room.state.get('board').slice()
  if (m.reset) return room.state.set('board', empty())
  if (winner(b) === undefined && !b[m.move]) { b[m.move] = turn(b); room.state.set('board', b) }
})
`,
    },
  },
  {
    id: 'confetti', label: 'Confetti party (events + sprites)',
    code: {
      perms: ['events', 'sprites', 'ui'],
      src: `// Press E at any furniture: everyone in the office sees plants pop up for 3 seconds.
room.on('interact', () => room.broadcast('party', { at: Date.now() }))
function party() {
  room.ui.toast('🎉 Party!')
  for (let i = 0; i < 6; i++) room.sprites.spawn('c' + i, 'arcade/plant', 1 + i * 2 % (room.info.w - 1), 1 + (i * 5) % (room.info.h - 2))
  setTimeout(() => { for (let i = 0; i < 6; i++) room.sprites.remove('c' + i) }, 3000)
}
room.on('message', (from, ev) => { if (ev === 'party') party() })
`,
    },
  },
]
