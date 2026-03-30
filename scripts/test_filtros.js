// scripts/test_filtros.js — Verificar que los filtros de pedidos funcionan correctamente
const db = require('../src/models/db');

async function q(sql, params) {
  return new Promise((resolve, reject) => {
    db.query(sql, params || [], (err, rows) => {
      err ? reject(err) : resolve(rows);
    });
  });
}

async function run() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 VERIFICACIÓN DE FILTROS DE PEDIDOS');
    console.log('='.repeat(60) + '\n');

    // Obtener estados
    const estados = await q('SELECT * FROM estadopedido ORDER BY orden');
    console.log('📊 ESTADOS CONFIGURADOS:');
    estados.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.nombre} (orden: ${e.orden})`);
    });

    // Estados "En proceso"
    const estadosEnProceso = ['Pendiente', 'En Preparación', 'Listo para Retiro', 'En Camino'];
    console.log('\n✓ ESTADOS EN PROCESO:');
    estadosEnProceso.forEach(e => console.log(`  - ${e}`));

    // Estados "Finalizados"
    const estadosFinalizados = ['Entregado', 'Cancelado'];
    console.log('\n✓ ESTADOS FINALIZADOS:');
    estadosFinalizados.forEach(e => console.log(`  - ${e}`));

    // Contar pedidos por estado
    console.log('\n📈 PEDIDOS POR ESTADO:');
    for (const estado of estados) {
      const count = await q('SELECT COUNT(*) as total FROM pedido WHERE estadoId = ?', [estado.id]);
      const total = count[0].total;
      const tipo = estadosEnProceso.includes(estado.nombre) ? '(en proceso)' : '(finalizado)';
      console.log(`  - ${estado.nombre}: ${total} pedido(s) ${tipo}`);
    }

    // Verificar resumen de filtros
    const enProcesoCount = await q(`
      SELECT COUNT(*) as total FROM pedido p
      LEFT JOIN estadopedido e ON p.estadoId = e.id
      WHERE e.nombre IN ('Pendiente', 'En Preparación', 'Listo para Retiro', 'En Camino')
    `);

    const finalizadosCount = await q(`
      SELECT COUNT(*) as total FROM pedido p
      LEFT JOIN estadopedido e ON p.estadoId = e.id
      WHERE e.nombre IN ('Entregado', 'Cancelado')
    `);

    console.log('\n📋 RESUMEN DE FILTROS:');
    console.log(`  ✓ En proceso: ${enProcesoCount[0].total} pedido(s)`);
    console.log(`  ✓ Finalizados: ${finalizadosCount[0].total} pedido(s)`);
    console.log(`  ✓ Todos: ${enProcesoCount[0].total + finalizadosCount[0].total} pedido(s)`);

    // Verificar que los nombres coinciden exactamente
    console.log('\n🔍 VALIDACIÓN DE NOMBRES:');
    let nombresToCorrect = [];
    for (const estado of estados) {
      if (!estadosEnProceso.includes(estado.nombre) && !estadosFinalizados.includes(estado.nombre)) {
        nombresToCorrect.push(estado.nombre);
      }
    }

    if (nombresToCorrect.length > 0) {
      console.log(`  ⚠️  Estados con nombres que no coinciden:${nombresToCorrect.map(n => '\n    - ' + n).join('')}`);
    } else {
      console.log('  ✅ Todos los nombres de estados coinciden correctamente');
    }

    console.log('\n' + '='.repeat(60) + '\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

run();
