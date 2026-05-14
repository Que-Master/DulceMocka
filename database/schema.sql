-- ============================================
-- DULCE MOCKA - Script de Base de Datos
-- ============================================
-- Este script crea la estructura completa de la base de datos
-- Ejecutar primero este archivo, luego seed.sql
-- ============================================

-- Crear base de datos
CREATE DATABASE IF NOT EXISTS dulce_mocka CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dulce_mocka;

-- ============================================
-- TABLAS DE REFERENCIA (sin dependencias)
-- ============================================

-- Roles de usuario
CREATE TABLE IF NOT EXISTS rol (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT,
  activo TINYINT(1) DEFAULT 1
);

-- Tipos de entrega
CREATE TABLE IF NOT EXISTS tipoentrega (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT
);

-- Métodos de pago
CREATE TABLE IF NOT EXISTS metodopago (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT,
  activo TINYINT(1) DEFAULT 1,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Estados de pedido
CREATE TABLE IF NOT EXISTS estadopedido (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT,
  orden INT
);

-- Sectores de entrega
CREATE TABLE IF NOT EXISTS sector (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  precioEnvio DECIMAL(10,2) NOT NULL DEFAULT 0,
  activo TINYINT(1) DEFAULT 1
);

-- Categorías de productos
CREATE TABLE IF NOT EXISTS categoria (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo TINYINT(1) DEFAULT 1
);

-- Ingredientes
CREATE TABLE IF NOT EXISTS ingrediente (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo TINYINT(1) DEFAULT 1
);

-- ============================================
-- TABLAS PRINCIPALES
-- ============================================

-- Usuarios
CREATE TABLE IF NOT EXISTS usuario (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  telefono VARCHAR(20),
  correo VARCHAR(150) NOT NULL UNIQUE,
  mockaPoints INT DEFAULT 0,
  fechaNacimiento DATETIME,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  actalizadoEn DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  rolId VARCHAR(36),
  password VARCHAR(255),
  googleId VARCHAR(100),
  activo TINYINT(1) DEFAULT 1,
  FOREIGN KEY (rolId) REFERENCES rol(id) ON DELETE SET NULL
);

-- Direcciones
CREATE TABLE IF NOT EXISTS direccion (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  calle VARCHAR(255),
  numeroCasa VARCHAR(20),
  nota TEXT,
  sectorId VARCHAR(36),
  creadaEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  eliminadoEn DATETIME,
  activo TINYINT(1) DEFAULT 1,
  FOREIGN KEY (sectorId) REFERENCES sector(id) ON DELETE SET NULL
);

-- Relación usuario-dirección
CREATE TABLE IF NOT EXISTS usuariodireccion (
  usuarioId VARCHAR(36) NOT NULL,
  direccionId VARCHAR(36) NOT NULL,
  esPrincipal TINYINT(1) DEFAULT 0,
  creadaEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  activo TINYINT(1) DEFAULT 1,
  PRIMARY KEY (usuarioId, direccionId),
  FOREIGN KEY (usuarioId) REFERENCES usuario(id) ON DELETE CASCADE,
  FOREIGN KEY (direccionId) REFERENCES direccion(id) ON DELETE CASCADE
);

-- Productos
CREATE TABLE IF NOT EXISTS producto (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  imagen VARCHAR(255),
  categoriaId VARCHAR(36),
  nombre VARCHAR(150) NOT NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,
  descripcion TEXT,
  precio DECIMAL(10,2) NOT NULL,
  activo TINYINT(1) DEFAULT 1,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizadoEn DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  costoMockaPoints INT,
  FOREIGN KEY (categoriaId) REFERENCES categoria(id) ON DELETE SET NULL
);

-- Relación producto-ingrediente
CREATE TABLE IF NOT EXISTS productoingrediente (
  productoId VARCHAR(36) NOT NULL,
  ingredienteId VARCHAR(36) NOT NULL,
  incluidoPorDefecto TINYINT(1) DEFAULT 1,
  sePuedeQuitar TINYINT(1) DEFAULT 1,
  PRIMARY KEY (productoId, ingredienteId),
  FOREIGN KEY (productoId) REFERENCES producto(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredienteId) REFERENCES ingrediente(id) ON DELETE CASCADE
);

-- Cupones
CREATE TABLE IF NOT EXISTS cupon (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  porcentajeDescuento DECIMAL(5,2),
  limiteDescuento DECIMAL(10,2),
  minimoCompra DECIMAL(10,2),
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  venceEn DATETIME,
  activo TINYINT(1) DEFAULT 1
);

-- Stock de cupones
CREATE TABLE IF NOT EXISTS cuponstock (
  cuponId VARCHAR(36) NOT NULL PRIMARY KEY,
  disponibles INT NOT NULL DEFAULT 0,
  FOREIGN KEY (cuponId) REFERENCES cupon(id) ON DELETE CASCADE
);

-- Relación usuario-cupón
CREATE TABLE IF NOT EXISTS usuariocupon (
  usuarioId VARCHAR(36) NOT NULL,
  cuponId VARCHAR(36) NOT NULL,
  asignadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  usadoEn DATETIME,
  eliminadoEn DATETIME,
  PRIMARY KEY (usuarioId, cuponId),
  FOREIGN KEY (usuarioId) REFERENCES usuario(id) ON DELETE CASCADE,
  FOREIGN KEY (cuponId) REFERENCES cupon(id) ON DELETE CASCADE
);

-- Pedidos
CREATE TABLE IF NOT EXISTS pedido (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  numeroPedido VARCHAR(50) NOT NULL UNIQUE,
  usuarioId VARCHAR(36),
  nombreContacto VARCHAR(150),
  correoContacto VARCHAR(150),
  telefonoContacto VARCHAR(20),
  tipoEntregaId VARCHAR(36),
  metodoPagoId VARCHAR(36),
  direccionId VARCHAR(36),
  cuponId VARCHAR(36),
  codigoCuponSnapshot VARCHAR(50),
  descuentoTotal DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  estadoId VARCHAR(36),
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  entregadoEn DATETIME,
  actualizadoEn DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuarioId) REFERENCES usuario(id) ON DELETE SET NULL,
  FOREIGN KEY (tipoEntregaId) REFERENCES tipoentrega(id) ON DELETE SET NULL,
  FOREIGN KEY (metodoPagoId) REFERENCES metodopago(id) ON DELETE SET NULL,
  FOREIGN KEY (direccionId) REFERENCES direccion(id) ON DELETE SET NULL,
  FOREIGN KEY (cuponId) REFERENCES cupon(id) ON DELETE SET NULL,
  FOREIGN KEY (estadoId) REFERENCES estadopedido(id) ON DELETE SET NULL
);

-- Items de pedido
CREATE TABLE IF NOT EXISTS pedidoitem (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  pedidoId VARCHAR(36),
  productoId VARCHAR(36),
  nombreProducto VARCHAR(150),
  precioUnitario DECIMAL(10,2),
  cantidad INT NOT NULL DEFAULT 1,
  notasItem TEXT,
  totalLinea DECIMAL(10,2),
  eliminadoEn DATETIME,
  FOREIGN KEY (pedidoId) REFERENCES pedido(id) ON DELETE CASCADE,
  FOREIGN KEY (productoId) REFERENCES producto(id) ON DELETE SET NULL
);

-- Notificaciones
CREATE TABLE IF NOT EXISTS notificacion (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  usuarioId VARCHAR(36) NOT NULL,
  pedidoId VARCHAR(36),
  tipo VARCHAR(50) NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  mensaje TEXT,
  motivoCancelacion TEXT,
  leida TINYINT(1) DEFAULT 0,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuarioId) REFERENCES usuario(id) ON DELETE CASCADE,
  FOREIGN KEY (pedidoId) REFERENCES pedido(id) ON DELETE SET NULL
);

-- Canje de Mocka Points
CREATE TABLE IF NOT EXISTS canjeomockapoints (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  usuarioId VARCHAR(36) NOT NULL,
  productoId VARCHAR(36) NOT NULL,
  costoPoints INT NOT NULL,
  estado ENUM('pendiente', 'entregado', 'cancelado') DEFAULT 'pendiente',
  pedidoId VARCHAR(36),
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP,
  entregadoEn DATETIME,
  FOREIGN KEY (usuarioId) REFERENCES usuario(id) ON DELETE CASCADE,
  FOREIGN KEY (productoId) REFERENCES producto(id) ON DELETE CASCADE,
  FOREIGN KEY (pedidoId) REFERENCES pedido(id) ON DELETE SET NULL
);

-- Slider/Banner de inicio
CREATE TABLE IF NOT EXISTS slider (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  titulo VARCHAR(150),
  subtitulo VARCHAR(255),
  imagenUrl TEXT NOT NULL,
  linkUrl VARCHAR(500),
  orden INT DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Configuración del local (horarios y estado)
CREATE TABLE IF NOT EXISTS configuracion_local (
  id VARCHAR(36) NOT NULL PRIMARY KEY DEFAULT 'config',
  horaApertura TIME DEFAULT '08:00:00',
  horaCierre TIME DEFAULT '20:00:00',
  abierto TINYINT(1) DEFAULT 1,
  forzarEstado TINYINT(1) DEFAULT 0,
  mensaje VARCHAR(255) DEFAULT NULL,
  actualizadoEn DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insertar configuración por defecto
INSERT IGNORE INTO configuracion_local (id) VALUES ('config');

-- ============================================
-- INSERCIONES POR DEFECTO
-- ============================================

-- Roles
INSERT IGNORE INTO rol (id, nombre, descripcion, activo) VALUES
('rol-admin-1', 'admin', 'Administrador del sistema', 1),
('rol-cliente-1', 'cliente', 'Cliente de la tienda', 1);

-- Tipos de entrega
INSERT IGNORE INTO tipoentrega (id, nombre, descripcion) VALUES
('delivery-1', 'Delivery', 'Entrega a domicilio'),
('recogida-1', 'Recogida', 'Recoger en tienda');

-- Métodos de pago
INSERT IGNORE INTO metodopago (id, nombre, descripcion, activo) VALUES
('metodo-efectivo-1', 'efectivo', 'Pago en efectivo', 1),
('metodo-transferencia-1', 'transferencia', 'Pago por transferencia bancaria', 1),
('metodo-debito-1', 'debito', 'Pago con tarjeta de débito', 1),
('metodo-credito-1', 'credito', 'Pago con tarjeta de crédito', 1);

-- Estados de pedido (en orden)
INSERT IGNORE INTO estadopedido (id, nombre, descripcion, orden) VALUES
('estado-pendiente-1', 'Pendiente', 'Pedido pendiente de procesamiento', 1),
('estado-preparacion-1', 'En Preparación', 'La tienda está preparando tu pedido', 2),
('estado-listo-1', 'Listo para Retiro', 'El pedido está listo para ser retirado', 3),
('estado-camino-1', 'En Camino', 'Tu pedido está en camino', 4),
('estado-entregado-1', 'Entregado', 'Pedido entregado con éxito', 5),
('estado-cancelado-1', 'Cancelado', 'Pedido cancelado', 6);

-- Notificaciones globales (broadcast del admin)
CREATE TABLE IF NOT EXISTS notificacion_global (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  cuerpo TEXT NOT NULL,
  link VARCHAR(500) DEFAULT NULL,
  activa TINYINT(1) DEFAULT 1,
  creadoEn DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ÍNDICES ADICIONALES
-- ============================================
CREATE INDEX idx_usuario_correo ON usuario(correo);
CREATE INDEX idx_usuario_googleId ON usuario(googleId);
CREATE INDEX idx_producto_categoriaId ON producto(categoriaId);
CREATE INDEX idx_producto_slug ON producto(slug);
CREATE INDEX idx_pedido_usuarioId ON pedido(usuarioId);
CREATE INDEX idx_pedido_estadoId ON pedido(estadoId);
CREATE INDEX idx_pedido_metodoPagoId ON pedido(metodoPagoId);
CREATE INDEX idx_notificacion_usuarioId ON notificacion(usuarioId);
