// Función para sanitizar entradas de usuario
const xss = require('xss');

function sanitizeInput(input) {
  if (typeof input === 'string') return xss(input);
  if (Array.isArray(input)) return input.map(sanitizeInput);
  if (typeof input === 'object' && input !== null) {
    const out = {};
    for (const k in input) out[k] = sanitizeInput(input[k]);
    return out;
  }
  return input;
}

module.exports = sanitizeInput;
