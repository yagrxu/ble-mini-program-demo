function ab2hex(buffer) {
  return Array.prototype.map
    .call(new Uint8Array(buffer), (x) => ('00' + x.toString(16)).slice(-2))
    .join('')
}

function hex2ab(hex) {
  const clean = hex.replace(/\s+/g, '')
  const buf = new ArrayBuffer(clean.length / 2)
  const view = new Uint8Array(buf)
  for (let i = 0; i < clean.length; i += 2) {
    view[i / 2] = parseInt(clean.substr(i, 2), 16)
  }
  return buf
}

module.exports = { ab2hex, hex2ab }
