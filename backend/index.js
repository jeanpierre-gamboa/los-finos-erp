/* global require, process, __dirname */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const sql = require('mssql/msnodesqlv8');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const config = {
  connectionString: `Driver={ODBC Driver 18 for SQL Server};Server=${process.env.DB_SERVER};Database=${process.env.DB_DATABASE};Trusted_Connection=Yes;TrustServerCertificate=Yes;`
};

const DEFAULT_EMPLOYEE_ID = Number(process.env.DEFAULT_EMPLOYEE_ID || 1);
const CHANNEL_PATTERNS = {
  'Salón': '%Salón%',
  WhatsApp: '%WhatsApp%',
  Llamafood: '%amfood%'
};

function getMesa(observaciones) {
  const match = String(observaciones || '').match(/Mesa:\s*([^|]+)/i);
  return match ? match[1].trim() : '';
}

async function findChannelId(request, canal) {
  const pattern = CHANNEL_PATTERNS[canal];
  if (!pattern) return null;
  const result = await request.input('NombreCanal', sql.NVarChar, pattern).query('SELECT TOP 1 CanalID FROM CanalVenta WHERE NombreCanal LIKE @NombreCanal AND Estado = 1');
  return result.recordset[0]?.CanalID || null;
}

async function getPedido(pool, pedidoId) {
  const pedidoResult = await pool.request()
    .input('PedidoID', sql.BigInt, pedidoId)
    .query(`
      SELECT p.PedidoID, p.FechaHoraRegistro, p.Observaciones,
        COALESCE(ultimo.Estado, p.Estado) AS Estado,
        cv.NombreCanal
      FROM Pedido p
      INNER JOIN CanalVenta cv ON cv.CanalID = p.CanalID
      OUTER APPLY (
        SELECT TOP 1 sp.Estado
        FROM SeguimientoPedido sp
        WHERE sp.PedidoID = p.PedidoID
        ORDER BY sp.FechaHora DESC, sp.SeguimientoID DESC
      ) ultimo
      WHERE p.PedidoID = @PedidoID
    `);
  const pedido = pedidoResult.recordset[0];
  if (!pedido) return null;

  const detailsResult = await pool.request()
    .input('PedidoID', sql.BigInt, pedidoId)
    .query(`
      SELECT dp.DetalleID, dp.ProductoID, pr.NombreProducto, dp.Cantidad,
        dp.PrecioAplicado, dp.SubTotal
      FROM DetallePedido dp
      INNER JOIN Producto pr ON pr.ProductoID = dp.ProductoID
      WHERE dp.PedidoID = @PedidoID
      ORDER BY dp.DetalleID
    `);

  return {
    id: pedido.PedidoID,
    numero: `PED-${String(pedido.PedidoID).padStart(3, '0')}`,
    canal: pedido.NombreCanal,
    mesa: getMesa(pedido.Observaciones),
    estado: pedido.Estado,
    confirmadoEn: new Date(pedido.FechaHoraRegistro).getTime(),
    lineas: detailsResult.recordset.map((line) => ({
      id: line.DetalleID,
      platoId: line.ProductoID,
      platoNombre: line.NombreProducto,
      cantidad: line.Cantidad,
      precioUnitario: Number(line.PrecioAplicado),
      subtotal: Number(line.SubTotal || line.Cantidad * line.PrecioAplicado)
    }))
  };
}

async function validateStock(transaction, productos) {
  const requirements = new Map();
  for (const producto of productos) {
    const result = await new sql.Request(transaction)
      .input('ProductoID', sql.Int, producto.productoId)
      .query(`
        SELECT dr.InsumoID, dr.CantidadUtilizada, i.NombreInsumo, i.StockActual
        FROM Receta r
        INNER JOIN DetalleReceta dr ON dr.RecetaID = r.RecetaID
        INNER JOIN Insumo i ON i.InsumoID = dr.InsumoID
        WHERE r.ProductoID = @ProductoID
      `);
    for (const ingredient of result.recordset) {
      const current = requirements.get(ingredient.InsumoID) || {
        nombre: ingredient.NombreInsumo,
        requerido: 0,
        disponible: Number(ingredient.StockActual),
      };
      current.requerido += Number(ingredient.CantidadUtilizada) * Number(producto.cantidad);
      requirements.set(ingredient.InsumoID, current);
    }
  }

  for (const ingredient of requirements.values()) {
    if (ingredient.requerido > ingredient.disponible) {
      const error = new Error(`Stock insuficiente: ${ingredient.nombre} (necesita ${ingredient.requerido.toFixed(2)}, hay ${ingredient.disponible.toFixed(2)})`);
      error.statusCode = 400;
      throw error;
    }
  }
}

async function ensureComprobanteTable(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.Comprobante', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Comprobante (
        ComprobanteID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        PedidoID BIGINT NOT NULL,
        TipoComprobanteID INT NULL,
        MetodoPagoID INT NULL,
        MovimientoCajaID BIGINT NULL,
        Numero NVARCHAR(20) NULL,
        SubTotal DECIMAL(12,2) NULL,
        MontoTotal DECIMAL(12,2) NULL,
        Tipo NVARCHAR(20) NOT NULL,
        Serie NVARCHAR(10) NOT NULL,
        Correlativo NVARCHAR(20) NOT NULL,
        Base DECIMAL(12,2) NOT NULL,
        IGV DECIMAL(12,2) NOT NULL,
        Total DECIMAL(12,2) NOT NULL,
        MedioPago NVARCHAR(30) NOT NULL,
        EstadoSUNAT NVARCHAR(30) NOT NULL,
        OriginalComprobanteID BIGINT NULL,
        ClienteRUC NVARCHAR(11) NULL,
        ClienteRazonSocial NVARCHAR(200) NULL,
        MotivoNota NVARCHAR(500) NULL,
        FechaEmision DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END
    ELSE
    BEGIN
      IF COL_LENGTH('dbo.Comprobante', 'MotivoNota') IS NULL ALTER TABLE dbo.Comprobante ADD MotivoNota NVARCHAR(500) NULL;
      IF COL_LENGTH('dbo.Comprobante', 'ClienteRUC') IS NULL ALTER TABLE dbo.Comprobante ADD ClienteRUC NVARCHAR(11) NULL;
      IF COL_LENGTH('dbo.Comprobante', 'ClienteRazonSocial') IS NULL ALTER TABLE dbo.Comprobante ADD ClienteRazonSocial NVARCHAR(200) NULL;
      IF COL_LENGTH('dbo.Comprobante', 'Tipo') IS NULL ALTER TABLE dbo.Comprobante ADD Tipo NVARCHAR(20) NULL;
      IF COL_LENGTH('dbo.Comprobante', 'Correlativo') IS NULL ALTER TABLE dbo.Comprobante ADD Correlativo NVARCHAR(20) NULL;
      IF COL_LENGTH('dbo.Comprobante', 'Base') IS NULL ALTER TABLE dbo.Comprobante ADD Base DECIMAL(12,2) NULL;
      IF COL_LENGTH('dbo.Comprobante', 'Total') IS NULL ALTER TABLE dbo.Comprobante ADD Total DECIMAL(12,2) NULL;
      IF COL_LENGTH('dbo.Comprobante', 'MedioPago') IS NULL ALTER TABLE dbo.Comprobante ADD MedioPago NVARCHAR(30) NULL;
      IF COL_LENGTH('dbo.Comprobante', 'EstadoSUNAT') IS NULL ALTER TABLE dbo.Comprobante ADD EstadoSUNAT NVARCHAR(30) NULL;
      IF COL_LENGTH('dbo.Comprobante', 'OriginalComprobanteID') IS NULL ALTER TABLE dbo.Comprobante ADD OriginalComprobanteID BIGINT NULL;
      ALTER TABLE dbo.Comprobante ALTER COLUMN MovimientoCajaID BIGINT NULL;
      DECLARE @MovimientoCajaConstraint sysname;
      SELECT TOP 1 @MovimientoCajaConstraint = kc.name
      FROM sys.key_constraints kc
      INNER JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
      INNER JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
      WHERE kc.parent_object_id = OBJECT_ID('dbo.Comprobante') AND kc.type = 'UQ' AND col.name = 'MovimientoCajaID';
      IF @MovimientoCajaConstraint IS NOT NULL EXEC(N'ALTER TABLE dbo.Comprobante DROP CONSTRAINT [' + @MovimientoCajaConstraint + N']');
      DECLARE @PedidoConstraint sysname;
      SELECT TOP 1 @PedidoConstraint = kc.name
      FROM sys.key_constraints kc
      INNER JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
      INNER JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
      WHERE kc.parent_object_id = OBJECT_ID('dbo.Comprobante') AND kc.type = 'UQ' AND col.name = 'PedidoID';
      IF @PedidoConstraint IS NOT NULL EXEC(N'ALTER TABLE dbo.Comprobante DROP CONSTRAINT [' + @PedidoConstraint + N']');
    END
  `);
}

function mapComprobante(row) {
  return {
    id: Number(row.ComprobanteID),
    pedidoId: Number(row.PedidoID),
    tipo: row.Tipo || (Number(row.TipoComprobanteID) === 2 ? 'Factura' : 'Boleta'),
    serie: row.Serie,
    correlativo: row.Correlativo || row.Numero,
    base: Number(row.Base ?? row.SubTotal),
    igv: Number(row.IGV),
    total: Number(row.Total ?? row.MontoTotal),
    medioPago: row.MedioPago || 'Efectivo',
    estadoSunat: row.EstadoSUNAT || 'Pendiente',
    originalComprobanteId: row.OriginalComprobanteID ? Number(row.OriginalComprobanteID) : null,
    ruc: row.ClienteRUC || '',
    razonSocial: row.ClienteRazonSocial || '',
    motivo: row.MotivoNota || '',
    emitidoEn: new Date(row.FechaEmision).getTime(),
  };
}

async function ensureIncidenciaTable(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.Incidencia', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Incidencia (
        IncidenciaID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        PedidoID BIGINT NOT NULL,
        EmpleadoResponsableID INT NULL,
        TipoIncidencia NVARCHAR(40) NULL,
        AccionTomada NVARCHAR(1000) NULL,
        FechaHora DATETIME2 NULL,
        Observaciones NVARCHAR(1000) NULL,
        Tipo NVARCHAR(40) NOT NULL,
        Motivo NVARCHAR(1000) NOT NULL,
        FechaRegistro DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END
    ELSE
    BEGIN
      IF COL_LENGTH('dbo.Incidencia', 'Tipo') IS NULL ALTER TABLE dbo.Incidencia ADD Tipo NVARCHAR(40) NULL;
      IF COL_LENGTH('dbo.Incidencia', 'Motivo') IS NULL ALTER TABLE dbo.Incidencia ADD Motivo NVARCHAR(1000) NULL;
      IF COL_LENGTH('dbo.Incidencia', 'FechaRegistro') IS NULL ALTER TABLE dbo.Incidencia ADD FechaRegistro DATETIME2 NULL;
    END
  `);
}

const RESOLUCIONES = {
  Cocina: 'Plato rehecho por Cocina',
  Caja: 'Cobro ajustado por Caja',
  'Atención': 'Solución registrada por Atención'
};

// El responsable y el estado se infieren de AccionTomada: "Asignado a X" = abierta; cualquier otro texto = cerrada.
function mapIncidencia(row) {
  const assigned = String(row.AccionTomada || '').match(/^Asignado a (Cocina|Caja|Atención)$/);
  const abierta = Boolean(assigned) || row.AccionTomada === 'Pendiente de atención';
  return {
    id: Number(row.IncidenciaID),
    pedidoId: Number(row.PedidoID),
    tipo: row.Tipo || row.TipoIncidencia,
    motivo: row.Motivo || row.Observaciones || row.AccionTomada,
    creadaEn: new Date(row.FechaRegistro || row.FechaHora).getTime(),
    responsable: assigned ? assigned[1] : 'Atención',
    estado: abierta ? 'Abierta' : 'Cerrada',
    accionTomada: row.AccionTomada,
  };
}

app.get('/api/productos', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT p.ProductoID, p.NombreProducto, p.PrecioActual,
        p.CategoriaID, c.NombreCategoria
      FROM Producto p
      LEFT JOIN Categoria c ON c.CategoriaID = p.CategoriaID
      WHERE p.Estado = 1
      ORDER BY p.NombreProducto
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/categorias', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT CategoriaID, NombreCategoria
      FROM Categoria
      ORDER BY NombreCategoria
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Resultados de planificación exportados por Python (ruta fija; el cliente no envía rutas).
// Sin autenticación en el backend actual: el control por rol es solo de interfaz.
const PANEL_PLANIFICACION = path.join(__dirname, '..', 'python', 'artifacts', 'panel', 'panel_planificacion.json');

app.get('/api/logistica/planificacion', async (req, res) => {
  let texto;
  try {
    texto = await fs.promises.readFile(PANEL_PLANIFICACION, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(503).json({ error: 'Todavía no hay resultados de planificación exportados. Ejecute el exportador Python (python/src/losfinos_demanda/panel.py).' });
    }
    console.error(err);
    return res.status(500).json({ error: 'No se pudo leer el archivo de resultados de planificación.' });
  }
  try {
    const panel = JSON.parse(texto);
    if (!panel || typeof panel !== 'object' || !panel.meta || !Array.isArray(panel.pronostico)) {
      throw new Error('estructura inesperada');
    }
    res.set('Cache-Control', 'no-store').json(panel);
  } catch {
    res.status(500).json({ error: 'El archivo de resultados de planificación está mal formado. Vuelva a exportarlo.' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});

app.post('/api/pedidos', async (req, res) => {
  const { canal, mesa, productos, clienteNombre, clienteTelefono, clienteDireccion } = req.body || {};
  if (!CHANNEL_PATTERNS[canal] || !Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({ error: 'Canal y productos son obligatorios.' });
  }
  if (canal === 'Salón' && !mesa) {
    return res.status(400).json({ error: 'La mesa es obligatoria para pedidos de Salón.' });
  }
  const normalizedProducts = productos.map((producto) => ({
    productoId: Number(producto.productoId),
    cantidad: Number(producto.cantidad),
  }));
  if (normalizedProducts.some((producto) => !Number.isInteger(producto.productoId) || producto.cantidad < 1 || !Number.isInteger(producto.cantidad))) {
    return res.status(400).json({ error: 'Cada producto debe tener productoId y una cantidad entera mayor a cero.' });
  }

  let transaction;
  try {
    const pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    await validateStock(transaction, normalizedProducts);
    const request = new sql.Request(transaction);
    const canalId = await findChannelId(request, canal);
    if (!canalId) throw new Error(`No existe un canal activo para ${canal}.`);

    let observaciones = null;
    if (canal === 'Salón') {
      observaciones = `Mesa: ${mesa}`;
    } else if (clienteNombre || clienteTelefono || clienteDireccion) {
      observaciones = [
        clienteNombre ? `Cliente: ${clienteNombre}` : '',
        clienteTelefono ? `Tel: ${clienteTelefono}` : '',
        clienteDireccion ? `Dir: ${clienteDireccion}` : '',
      ].filter(Boolean).join(' | ');
    }

    const pedidoResult = await new sql.Request(transaction)
      .input('CanalID', sql.Int, canalId)
      .input('EmpleadoID', sql.Int, DEFAULT_EMPLOYEE_ID)
      .input('Observaciones', sql.NVarChar, observaciones)
      .query(`
        INSERT INTO Pedido (CanalID, EmpleadoID, Estado, Observaciones, FechaHoraRegistro)
        OUTPUT INSERTED.PedidoID
        VALUES (@CanalID, @EmpleadoID, 'Pendiente', @Observaciones, GETUTCDATE())
      `);
    const pedidoId = pedidoResult.recordset[0].PedidoID;

    for (const producto of normalizedProducts) {
      const cantidad = producto.cantidad;
      const productRequest = new sql.Request(transaction)
        .input('ProductoID', sql.Int, producto.productoId)
        .input('Cantidad', sql.Int, cantidad);
      const productResult = await productRequest.query('SELECT PrecioActual FROM Producto WHERE ProductoID = @ProductoID AND Estado = 1');
      const product = productResult.recordset[0];
      if (!product) throw new Error(`El producto ${producto.productoId} no existe o está inactivo.`);
      await new sql.Request(transaction)
        .input('PedidoID', sql.BigInt, pedidoId)
        .input('ProductoID', sql.Int, producto.productoId)
        .input('Cantidad', sql.Int, cantidad)
        .input('PrecioAplicado', sql.Decimal(10, 2), product.PrecioActual)
        .query('INSERT INTO DetallePedido (PedidoID, ProductoID, Cantidad, PrecioAplicado) VALUES (@PedidoID, @ProductoID, @Cantidad, @PrecioAplicado)');
    }

    await new sql.Request(transaction)
      .input('PedidoID', sql.BigInt, pedidoId)
      .input('EmpleadoID', sql.Int, DEFAULT_EMPLOYEE_ID)
      .query("INSERT INTO SeguimientoPedido (PedidoID, EmpleadoID, Estado, Observacion) VALUES (@PedidoID, @EmpleadoID, 'Pendiente', 'Pedido registrado desde Comercial')");
    await transaction.commit();
    res.status(201).json(await getPedido(pool, pedidoId));
  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.get('/api/pedidos', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query('SELECT PedidoID FROM Pedido ORDER BY FechaHoraRegistro DESC, PedidoID DESC');
    const pedidos = [];
    for (const row of result.recordset) pedidos.push(await getPedido(pool, row.PedidoID));
    res.json(pedidos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/*
 * Política de fechas de Cocina (no se convierte ni reescribe ningún dato almacenado):
 * - Pedidos creados por la aplicación: FechaHoraRegistro se guarda con GETUTCDATE() (UTC).
 * - Pedidos de la carga sintética (existen en LFSim_Pedido): se guardó hora local de Lima.
 * Lima no usa horario de verano (UTC-5 fijo), por lo que la fecha local se obtiene restando 5 h a los UTC.
 */
const LIMA_UTC_OFFSET_HOURS = 5;
const KITCHEN_ACTIVE_STATES = ['Pendiente', 'En preparación', 'En Preparacion', 'Listo'];
const KITCHEN_OPEN_STATES = ['Pendiente', 'En preparación', 'En Preparacion'];

function limaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function sqlDateTime(date, addHours = 0) {
  return new Date(date.getTime() + addHours * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeKitchenState(estado) {
  return /^en preparaci[oó]n$/i.test(estado) ? 'En preparación' : estado;
}

const kitchenBaseCte = `
  WITH base AS (
    SELECT p.PedidoID, p.FechaHoraRegistro, p.Observaciones, cv.NombreCanal,
      COALESCE(ultimo.Estado, p.Estado) AS Estado,
      CASE WHEN EXISTS (SELECT 1 FROM LFSim_Pedido s WHERE s.PedidoID = p.PedidoID) THEN 1 ELSE 0 END AS EsSintetico
    FROM Pedido p
    INNER JOIN CanalVenta cv ON cv.CanalID = p.CanalID
    OUTER APPLY (
      SELECT TOP 1 sp.Estado
      FROM SeguimientoPedido sp
      WHERE sp.PedidoID = p.PedidoID
      ORDER BY sp.FechaHora DESC, sp.SeguimientoID DESC
    ) ultimo
    WHERE p.FechaHoraRegistro >= CAST(@Prefiltro AS datetime2) AND p.FechaHoraRegistro < CAST(@PrefiltroFin AS datetime2)
  ), dia AS (
    SELECT *,
      CASE WHEN EsSintetico = 1 THEN FechaHoraRegistro ELSE DATEADD(HOUR, -${LIMA_UTC_OFFSET_HOURS}, FechaHoraRegistro) END AS FechaLocal
    FROM base
  )`;

// Endpoint específico de Cocina: filtra por día (America/Lima) y estado efectivo en el servidor.
app.get('/api/cocina/pedidos', async (req, res) => {
  const hoy = limaToday();
  const fecha = req.query.fecha ? String(req.query.fecha) : hoy;
  const day = parseIsoDate(fecha);
  if (!day) return res.status(400).json({ error: 'Fecha no válida. Use el formato AAAA-MM-DD.' });

  const inicio = sqlDateTime(day);
  const fin = sqlDateTime(day, 24);
  // Ventana amplia sobre el valor almacenado: cubre filas sintéticas (local) y de la app (UTC).
  const prefiltro = inicio;
  const prefiltroFin = sqlDateTime(day, 24 + LIMA_UTC_OFFSET_HOURS);
  const stateList = KITCHEN_ACTIVE_STATES.map((_, index) => `@E${index}`).join(', ');
  const bind = (request) => {
    request
      .input('Prefiltro', sql.VarChar(19), prefiltro)
      .input('PrefiltroFin', sql.VarChar(19), prefiltroFin)
      .input('Inicio', sql.VarChar(19), inicio)
      .input('Fin', sql.VarChar(19), fin);
    KITCHEN_ACTIVE_STATES.forEach((estado, index) => request.input(`E${index}`, sql.NVarChar(30), estado));
    return request;
  };
  const dayFilter = `WHERE dia.FechaLocal >= CAST(@Inicio AS datetime2) AND dia.FechaLocal < CAST(@Fin AS datetime2) AND dia.Estado IN (${stateList})`;

  try {
    const pool = await sql.connect(config);
    const headers = await bind(pool.request()).query(`${kitchenBaseCte}
      SELECT dia.PedidoID, dia.FechaHoraRegistro, dia.EsSintetico, dia.Observaciones, dia.NombreCanal, dia.Estado
      FROM dia ${dayFilter}
      ORDER BY dia.FechaLocal ASC, dia.PedidoID ASC`);
    const details = await bind(pool.request()).query(`${kitchenBaseCte}
      SELECT dp.PedidoID, dp.DetalleID, dp.ProductoID, pr.NombreProducto, dp.Cantidad
      FROM dia
      INNER JOIN DetallePedido dp ON dp.PedidoID = dia.PedidoID
      INNER JOIN Producto pr ON pr.ProductoID = dp.ProductoID
      ${dayFilter}
      ORDER BY dp.PedidoID, dp.DetalleID`);

    const linesByOrder = new Map();
    for (const line of details.recordset) {
      const key = String(line.PedidoID);
      if (!linesByOrder.has(key)) linesByOrder.set(key, []);
      linesByOrder.get(key).push({ id: line.DetalleID, platoId: line.ProductoID, platoNombre: line.NombreProducto, cantidad: line.Cantidad });
    }

    // Pedidos abiertos de días anteriores a hoy (solo conteo por fecha; no se modifican).
    const hoyInicio = sqlDateTime(parseIsoDate(hoy));
    const openList = KITCHEN_OPEN_STATES.map((_, index) => `@O${index}`).join(', ');
    const pendingRequest = pool.request()
      .input('Prefiltro', sql.VarChar(19), '1900-01-01 00:00:00')
      .input('PrefiltroFin', sql.VarChar(19), sqlDateTime(parseIsoDate(hoy), LIMA_UTC_OFFSET_HOURS))
      .input('HoyInicio', sql.VarChar(19), hoyInicio);
    KITCHEN_OPEN_STATES.forEach((estado, index) => pendingRequest.input(`O${index}`, sql.NVarChar(30), estado));
    const pending = await pendingRequest.query(`${kitchenBaseCte}
      SELECT CONVERT(char(10), FechaLocal, 23) AS Fecha, COUNT(*) AS Cantidad
      FROM dia
      WHERE FechaLocal < CAST(@HoyInicio AS datetime2) AND Estado IN (${openList})
      GROUP BY CONVERT(char(10), FechaLocal, 23)
      ORDER BY Fecha DESC`);

    res.json({
      fecha,
      hoy,
      pedidos: headers.recordset.map((row) => ({
        id: row.PedidoID,
        numero: `PED-${String(row.PedidoID).padStart(3, '0')}`,
        canal: row.NombreCanal,
        mesa: getMesa(row.Observaciones),
        estado: normalizeKitchenState(row.Estado),
        confirmadoEn: new Date(row.FechaHoraRegistro).getTime() + (row.EsSintetico ? LIMA_UTC_OFFSET_HOURS * 3600 * 1000 : 0),
        lineas: linesByOrder.get(String(row.PedidoID)) || [],
      })),
      anteriores: {
        cantidad: pending.recordset.reduce((sum, row) => sum + row.Cantidad, 0),
        fechas: pending.recordset.slice(0, 10).map((row) => ({ fecha: row.Fecha, cantidad: row.Cantidad })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pedidos/:id/estado', async (req, res) => {
  const pedidoId = Number(req.params.id);
  const { estado } = req.body || {};
  if (!Number.isInteger(pedidoId) || !['En preparación', 'Listo'].includes(estado)) {
    return res.status(400).json({ error: 'Pedido o estado no válido.' });
  }

  let transaction;
  try {
    const pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const current = await new sql.Request(transaction)
      .input('PedidoID', sql.BigInt, pedidoId)
      .query('SELECT PedidoID FROM Pedido WITH (UPDLOCK, HOLDLOCK) WHERE PedidoID = @PedidoID');
    if (!current.recordset[0]) {
      const error = new Error('Pedido no encontrado.');
      error.statusCode = 404;
      throw error;
    }

    if (estado === 'Listo') {
      const requirements = await new sql.Request(transaction)
        .input('PedidoID', sql.BigInt, pedidoId)
        .query(`
          SELECT dr.InsumoID, SUM(dp.Cantidad * dr.CantidadUtilizada) AS Requerido,
            i.StockActual, i.NombreInsumo
          FROM DetallePedido dp
          INNER JOIN Receta r ON r.ProductoID = dp.ProductoID
          INNER JOIN DetalleReceta dr ON dr.RecetaID = r.RecetaID
          INNER JOIN Insumo i ON i.InsumoID = dr.InsumoID
          WHERE dp.PedidoID = @PedidoID
          GROUP BY dr.InsumoID, i.StockActual, i.NombreInsumo
        `);
      const shortage = requirements.recordset.find((item) => Number(item.StockActual) < Number(item.Requerido));
      if (shortage) {
        const error = new Error(`Stock insuficiente para ${shortage.NombreInsumo}.`);
        error.statusCode = 409;
        throw error;
      }
      for (const item of requirements.recordset) {
        await new sql.Request(transaction)
          .input('InsumoID', sql.Int, item.InsumoID)
          .input('Requerido', sql.Decimal(12, 4), item.Requerido)
          .query('UPDATE Insumo SET StockActual = StockActual - @Requerido WHERE InsumoID = @InsumoID');
      }
    }

    await new sql.Request(transaction)
      .input('PedidoID', sql.BigInt, pedidoId)
      .input('EmpleadoID', sql.Int, DEFAULT_EMPLOYEE_ID)
      .input('Estado', sql.NVarChar, estado)
      .query('UPDATE Pedido SET Estado = @Estado WHERE PedidoID = @PedidoID; INSERT INTO SeguimientoPedido (PedidoID, EmpleadoID, Estado, Observacion) VALUES (@PedidoID, @EmpleadoID, @Estado, NULL)');
    await transaction.commit();
    res.json(await getPedido(pool, pedidoId));
  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.get('/api/comprobantes', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    await ensureComprobanteTable(pool);
    const result = await pool.request().query('SELECT ComprobanteID, PedidoID, TipoComprobanteID, MetodoPagoID, Numero, SubTotal, MontoTotal, Tipo, Serie, Correlativo, Base, IGV, Total, MedioPago, EstadoSUNAT, OriginalComprobanteID, ClienteRUC, ClienteRazonSocial, MotivoNota, FechaEmision FROM Comprobante ORDER BY FechaEmision DESC, ComprobanteID DESC');
    res.json(result.recordset.map(mapComprobante));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/comprobantes', async (req, res) => {
  const { pedidoId, tipo, serie, base, igv, total, medioPago, originalComprobanteId, ruc, razonSocial, motivo } = req.body || {};
  const normalizedPedidoId = Number(pedidoId);
  const normalizedMotivo = String(motivo || '').trim().slice(0, 500);
  const normalizedTipo = String(tipo || '').trim();
  const normalizedSerie = String(serie || '').trim();
  const normalizedBase = Number(base);
  const normalizedIgv = Number(igv);
  const normalizedTotal = Number(total);
  const normalizedMedioPago = String(medioPago || '').trim();
  let pedidoIdFinal = normalizedPedidoId;
  let baseFinal = normalizedBase;
  let igvFinal = normalizedIgv;
  let totalFinal = normalizedTotal;
  let medioPagoFinal = normalizedMedioPago;
  const normalizedRuc = String(ruc || '').trim();
  const normalizedRazonSocial = String(razonSocial || '').trim();
  if (!Number.isInteger(normalizedPedidoId) || !['Boleta', 'Factura', 'Nota de crédito'].includes(normalizedTipo) || !normalizedSerie || !normalizedMedioPago || !Number.isFinite(normalizedBase) || !Number.isFinite(normalizedIgv) || !Number.isFinite(normalizedTotal)) {
    return res.status(400).json({ error: 'Pedido, tipo, serie y medio de pago son obligatorios.' });
  }
  if (normalizedTipo === 'Factura' && (!/^\d{11}$/.test(normalizedRuc) || !normalizedRazonSocial)) {
    return res.status(400).json({ error: 'La factura requiere un RUC de 11 dígitos y la razón social.' });
  }
  const normalizedOriginalId = Number.isInteger(Number(originalComprobanteId)) && originalComprobanteId !== null && originalComprobanteId !== '' ? Number(originalComprobanteId) : null;
  let transaction;
  try {
    const pool = await sql.connect(config);
    await ensureComprobanteTable(pool);
    transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const existing = await new sql.Request(transaction)
      .input('PedidoID', sql.BigInt, normalizedPedidoId)
      .query('SELECT TOP 1 ComprobanteID FROM Comprobante WITH (UPDLOCK, HOLDLOCK) WHERE PedidoID = @PedidoID');
    if (existing.recordset[0] && normalizedTipo !== 'Nota de crédito') {
      const error = new Error('Este pedido ya tiene comprobante emitido');
      error.statusCode = 409;
      throw error;
    }
    if (normalizedTipo === 'Nota de crédito') {
      if (!normalizedOriginalId) {
        const error = new Error('La nota de crédito requiere un comprobante original válido.');
        error.statusCode = 400;
        throw error;
      }
      if (!normalizedMotivo) {
        const error = new Error('El motivo de la nota de crédito es obligatorio.');
        error.statusCode = 400;
        throw error;
      }
      const original = await new sql.Request(transaction)
        .input('OriginalID', sql.BigInt, normalizedOriginalId)
        .query('SELECT ComprobanteID, PedidoID, Tipo, TipoComprobanteID, Base, IGV, Total, MedioPago, EstadoSUNAT FROM Comprobante WITH (UPDLOCK, HOLDLOCK) WHERE ComprobanteID = @OriginalID');
      const source = original.recordset[0];
      if (!source || source.Tipo === 'Nota de crédito') {
        const error = new Error('El comprobante original no existe o no es válido para una nota de crédito.');
        error.statusCode = 404;
        throw error;
      }
      if (source.EstadoSUNAT !== 'Aceptado') {
        const error = new Error('Solo se puede emitir una nota de crédito para comprobantes con estado SUNAT Aceptado.');
        error.statusCode = 409;
        throw error;
      }
      const duplicateNote = await new sql.Request(transaction)
        .input('OriginalID', sql.BigInt, normalizedOriginalId)
        .query("SELECT TOP 1 ComprobanteID FROM Comprobante WITH (UPDLOCK, HOLDLOCK) WHERE OriginalComprobanteID = @OriginalID AND Tipo = 'Nota de crédito'");
      if (duplicateNote.recordset[0]) {
        const error = new Error('Este comprobante ya tiene una nota de crédito.');
        error.statusCode = 409;
        throw error;
      }
      pedidoIdFinal = Number(source.PedidoID);
      baseFinal = -Math.abs(Number(source.Base));
      igvFinal = -Math.abs(Number(source.IGV));
      totalFinal = -Math.abs(Number(source.Total));
      medioPagoFinal = source.MedioPago || normalizedMedioPago;
    }
    const next = await new sql.Request(transaction)
      .input('Serie', sql.NVarChar(10), normalizedSerie)
      .query('SELECT ISNULL(MAX(TRY_CAST(Correlativo AS INT)), 0) + 1 AS Next FROM Comprobante WITH (UPDLOCK, HOLDLOCK) WHERE Serie = @Serie');
    const normalizedCorrelativo = String(next.recordset[0].Next).padStart(8, '0');
    const result = await new sql.Request(transaction)
      .input('PedidoID', sql.BigInt, pedidoIdFinal)
      .input('TipoComprobanteID', sql.Int, normalizedTipo === 'Factura' ? 2 : 1)
      .input('MetodoPagoID', sql.Int, { Efectivo: 1, Tarjeta: 2, Yape: 3, Plin: 4, Transferencia: 5 }[medioPagoFinal] || 1)
      .input('MovimientoCajaID', sql.BigInt, null)
      .input('Numero', sql.NVarChar(20), `${normalizedSerie}-${normalizedCorrelativo}`)
      .input('SubTotal', sql.Decimal(12, 2), baseFinal)
      .input('MontoTotal', sql.Decimal(12, 2), totalFinal)
      .input('Tipo', sql.NVarChar(20), normalizedTipo)
      .input('Serie', sql.NVarChar(10), normalizedSerie)
      .input('Correlativo', sql.NVarChar(20), normalizedCorrelativo)
      .input('Base', sql.Decimal(12, 2), baseFinal)
      .input('IGV', sql.Decimal(12, 2), igvFinal)
      .input('Total', sql.Decimal(12, 2), totalFinal)
      .input('MedioPago', sql.NVarChar(30), medioPagoFinal)
      .input('EstadoSUNAT', sql.NVarChar(30), 'Pendiente')
      .input('OriginalComprobanteID', sql.BigInt, normalizedTipo === 'Nota de crédito' ? normalizedOriginalId : null)
      .input('ClienteRUC', sql.NVarChar(11), normalizedTipo === 'Factura' ? normalizedRuc : null)
      .input('ClienteRazonSocial', sql.NVarChar(200), normalizedTipo === 'Factura' ? normalizedRazonSocial : null)
      .input('MotivoNota', sql.NVarChar(500), normalizedTipo === 'Nota de crédito' ? normalizedMotivo : null)
      .query(`
        INSERT INTO Comprobante (PedidoID, TipoComprobanteID, MetodoPagoID, MovimientoCajaID, Numero, SubTotal, MontoTotal, Tipo, Serie, Correlativo, Base, IGV, Total, MedioPago, EstadoSUNAT, OriginalComprobanteID, ClienteRUC, ClienteRazonSocial, MotivoNota)
        OUTPUT INSERTED.ComprobanteID, INSERTED.PedidoID, INSERTED.TipoComprobanteID, INSERTED.MetodoPagoID,
          INSERTED.Numero, INSERTED.SubTotal, INSERTED.MontoTotal, INSERTED.Tipo, INSERTED.Serie,
          INSERTED.Correlativo, INSERTED.Base, INSERTED.IGV, INSERTED.Total, INSERTED.MedioPago,
          INSERTED.EstadoSUNAT, INSERTED.OriginalComprobanteID, INSERTED.ClienteRUC, INSERTED.ClienteRazonSocial, INSERTED.MotivoNota, INSERTED.FechaEmision
        VALUES (@PedidoID, @TipoComprobanteID, @MetodoPagoID, @MovimientoCajaID, @Numero, @SubTotal, @MontoTotal, @Tipo, @Serie, @Correlativo, @Base, @IGV, @Total, @MedioPago, @EstadoSUNAT, @OriginalComprobanteID, @ClienteRUC, @ClienteRazonSocial, @MotivoNota)
      `);
    await transaction.commit();
    res.status(201).json(mapComprobante(result.recordset[0]));
  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error(err);
    res.status(err.statusCode || (err.number === 2627 ? 409 : 500)).json({ error: err.message });
  }
});

app.put('/api/comprobantes/:id/sunat', async (req, res) => {
  const comprobanteId = Number(req.params.id);
  const { estadoSunat } = req.body || {};
  if (!Number.isInteger(comprobanteId) || !['Pendiente', 'Aceptado', 'Rechazado', 'Contingencia'].includes(estadoSunat)) {
    return res.status(400).json({ error: 'Comprobante o estado SUNAT no válido.' });
  }
  try {
    const pool = await sql.connect(config);
    await ensureComprobanteTable(pool);
    const result = await pool.request()
      .input('ComprobanteID', sql.BigInt, comprobanteId)
      .input('EstadoSUNAT', sql.NVarChar(30), estadoSunat)
      .query(`
        UPDATE Comprobante SET EstadoSUNAT = @EstadoSUNAT WHERE ComprobanteID = @ComprobanteID;
        SELECT ComprobanteID, PedidoID, TipoComprobanteID, MetodoPagoID, Numero, SubTotal, MontoTotal, Tipo, Serie, Correlativo, Base, IGV, Total, MedioPago, EstadoSUNAT,         OriginalComprobanteID, ClienteRUC, ClienteRazonSocial, MotivoNota, FechaEmision
        FROM Comprobante WHERE ComprobanteID = @ComprobanteID
      `);
    if (!result.recordset[0]) return res.status(404).json({ error: 'Comprobante no encontrado.' });
    res.json(mapComprobante(result.recordset[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/pedidos/:id/anular', async (req, res) => {
  const pedidoId = Number(req.params.id);
  const motivo = String(req.body?.motivo || '').trim();
  if (!Number.isInteger(pedidoId) || !motivo) return res.status(400).json({ error: 'El pedido y el motivo de anulación son obligatorios.' });
  let transaction;
  try {
    const pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const current = await new sql.Request(transaction)
      .input('PedidoID', sql.BigInt, pedidoId)
      .query('SELECT PedidoID, Estado, Observaciones, FechaHoraRegistro FROM Pedido WITH (UPDLOCK, HOLDLOCK) WHERE PedidoID = @PedidoID');
    if (!current.recordset[0]) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (current.recordset[0].Estado === 'Anulado') return res.status(409).json({ error: 'El pedido ya está anulado.' });
    
    const minutos = (Date.now() - new Date(current.recordset[0].FechaHoraRegistro).getTime()) / 60000;
    if (minutos > 5) {
      const error = new Error('Ya pasaron más de 5 minutos. El pedido no puede ser anulado directamente.');
      error.statusCode = 403;
      throw error;
    }
    const observation = `${current.recordset[0].Observaciones || ''}${current.recordset[0].Observaciones ? ' | ' : ''}Anulación: ${motivo}`;
    await new sql.Request(transaction)
      .input('PedidoID', sql.BigInt, pedidoId)
      .input('Observaciones', sql.NVarChar, observation)
      .query("UPDATE Pedido SET Estado = 'Anulado', Observaciones = @Observaciones WHERE PedidoID = @PedidoID; INSERT INTO SeguimientoPedido (PedidoID, EmpleadoID, Estado, Observacion) VALUES (@PedidoID, " + DEFAULT_EMPLOYEE_ID + ", 'Anulado', @Observaciones)");
    await transaction.commit();
    res.json(await getPedido(pool, pedidoId));
  } catch (err) {
    if (transaction) await transaction.rollback().catch(() => {});
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/incidencias', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    await ensureIncidenciaTable(pool);
    const result = await pool.request().query('SELECT IncidenciaID, PedidoID, EmpleadoResponsableID, TipoIncidencia, AccionTomada, FechaHora, Observaciones, Tipo, Motivo, FechaRegistro FROM Incidencia ORDER BY COALESCE(FechaRegistro, FechaHora) DESC, IncidenciaID DESC');
    res.json(result.recordset.map(mapIncidencia));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/incidencias', async (req, res) => {
  const { pedidoId, tipo, motivo, responsable } = req.body || {};
  if (!Number.isInteger(Number(pedidoId)) || !['Falla de producto', 'Retraso', 'Cambio', 'Devolución', 'Otro'].includes(tipo) || !String(motivo || '').trim() || !['Cocina', 'Caja', 'Atención'].includes(responsable)) {
    return res.status(400).json({ error: 'Pedido, tipo, motivo y responsable son obligatorios.' });
  }
  try {
    const pool = await sql.connect(config);
    await ensureIncidenciaTable(pool);
    const existing = await pool.request()
      .input('PedidoID', sql.BigInt, Number(pedidoId))
      .query('SELECT TOP 1 IncidenciaID FROM Incidencia WHERE PedidoID = @PedidoID');
    if (existing.recordset[0]) return res.status(409).json({ error: 'Este pedido ya tiene una incidencia registrada.' });
    const result = await pool.request()
      .input('PedidoID', sql.BigInt, Number(pedidoId))
      .input('EmpleadoResponsableID', sql.Int, DEFAULT_EMPLOYEE_ID)
      .input('TipoIncidencia', sql.NVarChar(40), tipo)
      .input('AccionTomada', sql.NVarChar(1000), `Asignado a ${responsable}`)
      .input('FechaHora', sql.DateTime2, new Date())
      .input('Observaciones', sql.NVarChar(1000), String(motivo).trim())
      .input('Tipo', sql.NVarChar(40), tipo)
      .input('Motivo', sql.NVarChar(1000), String(motivo).trim())
      .query(`
        INSERT INTO Incidencia (PedidoID, EmpleadoResponsableID, TipoIncidencia, AccionTomada, FechaHora, Observaciones, Tipo, Motivo, FechaRegistro)
        OUTPUT INSERTED.IncidenciaID, INSERTED.PedidoID, INSERTED.EmpleadoResponsableID, INSERTED.TipoIncidencia, INSERTED.AccionTomada, INSERTED.FechaHora, INSERTED.Observaciones, INSERTED.Tipo, INSERTED.Motivo, INSERTED.FechaRegistro
        VALUES (@PedidoID, @EmpleadoResponsableID, @TipoIncidencia, @AccionTomada, @FechaHora, @Observaciones, @Tipo, @Motivo, @FechaHora)
      `);
    res.status(201).json({ ...mapIncidencia(result.recordset[0]), responsable });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/incidencias/:id/resolver', async (req, res) => {
  const incidenciaId = Number(req.params.id);
  if (!Number.isInteger(incidenciaId)) return res.status(400).json({ error: 'Incidencia no válida.' });
  try {
    const pool = await sql.connect(config);
    await ensureIncidenciaTable(pool);
    const columns = 'IncidenciaID, PedidoID, EmpleadoResponsableID, TipoIncidencia, AccionTomada, FechaHora, Observaciones, Tipo, Motivo, FechaRegistro';
    const current = await pool.request()
      .input('IncidenciaID', sql.BigInt, incidenciaId)
      .query(`SELECT ${columns} FROM Incidencia WHERE IncidenciaID = @IncidenciaID`);
    if (!current.recordset[0]) return res.status(404).json({ error: 'Incidencia no encontrada.' });
    const incidencia = mapIncidencia(current.recordset[0]);
    if (incidencia.estado === 'Cerrada') return res.status(409).json({ error: 'La incidencia ya está cerrada.' });
    const result = await pool.request()
      .input('IncidenciaID', sql.BigInt, incidenciaId)
      .input('AccionTomada', sql.NVarChar(1000), RESOLUCIONES[incidencia.responsable])
      .query(`UPDATE Incidencia SET AccionTomada = @AccionTomada WHERE IncidenciaID = @IncidenciaID; SELECT ${columns} FROM Incidencia WHERE IncidenciaID = @IncidenciaID`);
    res.json({ ...mapIncidencia(result.recordset[0]), responsable: incidencia.responsable });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});