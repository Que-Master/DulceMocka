// print-server.js
// Servidor local de impresión para Xprinter 80mm ESC/POS USB

const express = require('express');
const cors = require('cors');
const escpos = require('escpos');

// Configuración de encoding para caracteres en español
escpos.USB = require('escpos-usb');
const deviceEncoding = 'CP858'; // Compatible con español y €

const app = express();
const PORT = 3002;

// Middleware
app.use(cors()); // Habilita CORS para todas las rutas
app.use(express.json()); // Parseo de JSON

// Helper para alinear texto izquierda-derecha (48 caracteres)
function line(left, right) {
  const max = 48;
  left = left.toString();
  right = right.toString();
  const spaces = max - left.length - right.length;
  return left + ' '.repeat(spaces > 0 ? spaces : 1) + right;
}

// Helper para formatear fecha y hora actual
function fechaHora() {
  const now = new Date();
  return now.toLocaleString('es-CL', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

// Genera el contenido del ticket como array de líneas
function generarTicket(order) {
  const lines = [];
  lines.push('='.repeat(48));
  lines.push('DULCE MOCKA'.padStart(24 + 5));
  lines.push('RUT: 77.777.777-7'.padStart(24 + 5));
  lines.push('='.repeat(48));
  lines.push(`PEDIDO: ${order.pedido}`);
  lines.push(`CLIENTE: ${order.cliente}`);
  lines.push(`ENTREGA: ${order.tipoEntrega}`);
  if (order.direccion) lines.push(`DIRECCIÓN: ${order.direccion}`);
  if (order.telefono) lines.push(`TEL: ${order.telefono}`);
  lines.push('-'.repeat(48));
  lines.push(line('Producto', 'Total'));
  lines.push('-'.repeat(48));
  let subtotal = 0;
  for (const item of order.items) {
    const total = item.cantidad * item.precio;
    subtotal += total;
    let nombre = `${item.cantidad} x ${item.nombre}`;
    if (nombre.length > 38) nombre = nombre.slice(0, 38) + '…';
    lines.push(line(nombre, `$${total}`));
  }
  lines.push('-'.repeat(48));
  lines.push(line('SUBTOTAL', `$${subtotal}`));
  if (order.envio) lines.push(line('ENVÍO', `$${order.envio}`));
  const totalFinal = subtotal + (order.envio || 0);
  lines.push('='.repeat(48));
  lines.push(line('TOTAL', `$${totalFinal}`));
  lines.push('='.repeat(48));
  lines.push('');
  lines.push(`Pago: ${order.metodoPago}`);
  lines.push('');
  lines.push(fechaHora());
  lines.push('');
  lines.push('¡Gracias por tu compra!'.padStart(30));
  lines.push('');
  return lines;
}

// Lógica de impresión
async function imprimir(order) {
  // Busca la impresora USB
  const devices = escpos.USB.findPrinter();
  if (!devices || devices.length === 0) {
    throw new Error('No se detectó ninguna impresora USB conectada');
  }
  const device = new escpos.USB();
  const printer = new escpos.Printer(device, { encoding: deviceEncoding });

  return new Promise((resolve, reject) => {
    device.open(function (err) {
      if (err) {
        return reject(new Error('No se pudo abrir la impresora: ' + err.message));
      }
      // Imprime el ticket
      const lines = generarTicket(order);
      printer
        .align('LT')
        .font('A')
        .style('NORMAL')
        .size(1, 1);
      for (const line of lines) {
        if (line.startsWith('TOTAL')) {
          printer.style('B').size(2, 2).text(line).size(1, 1).style('NORMAL');
        } else {
          printer.text(line);
        }
      }
      // Abrir cajón si corresponde
      if (order.metodoPago && order.metodoPago.toLowerCase() === 'efectivo') {
        printer.cashdraw(2);
      }
      printer.cut();
      printer.close(() => {
        resolve();
      });
    });
  });
}

// Endpoint principal
app.post('/print', async (req, res) => {
  const order = req.body;
  console.log('[PRINT-SERVER] Pedido recibido:', order);
  try {
    await imprimir(order);
    console.log('[PRINT-SERVER] Impresión exitosa');
    res.json({ ok: true });
  } catch (err) {
    console.error('[PRINT-SERVER] Error:', err.message);
    res.json({ ok: false, error: err.message });
  }
});

// Inicio del servidor
app.listen(PORT, () => {
  console.log(`[PRINT-SERVER] Servidor de impresión listo en http://localhost:${PORT}`);
});
