// Middleware centralizado para manejo de errores
module.exports = function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    ok: false,
    error: err.message || 'Error interno del servidor'
  });
};
