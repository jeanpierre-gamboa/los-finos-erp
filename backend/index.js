/* global require, process */
require('dotenv').config();
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
        FechaEmision DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END
    ELSE
    BEGIN
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

function mapIncidencia(row) {
  return {
    id: Number(row.IncidenciaID),
    pedidoId: Number(row.PedidoID),
    tipo: row.Tipo || row.TipoIncidencia,
    motivo: row.Motivo || row.Observaciones || row.AccionTomada,
    creadaEn: new Date(row.FechaRegistro || row.FechaHora).getTime(),
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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});

app.post('/api/pedidos', async (req, res) => {
  const { canal, mesa, productos } = req.body || {};
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

    const pedidoResult = await new sql.Request(transaction)
      .input('CanalID', sql.Int, canalId)
      .input('EmpleadoID', sql.Int, DEFAULT_EMPLOYEE_ID)
      .input('Observaciones', sql.NVarChar, canal === 'Salón' ? `Mesa: ${mesa}` : null)
      .query(`
        INSERT INTO Pedido (CanalID, EmpleadoID, Estado, Observaciones)
        OUTPUT INSERTED.PedidoID
        VALUES (@CanalID, @EmpleadoID, 'Pendiente', @Observaciones)
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
    const result = await pool.request().query('SELECT ComprobanteID, PedidoID, TipoComprobanteID, MetodoPagoID, Numero, SubTotal, MontoTotal, Tipo, Serie, Correlativo, Base, IGV, Total, MedioPago, EstadoSUNAT, OriginalComprobanteID, FechaEmision FROM Comprobante ORDER BY FechaEmision DESC, ComprobanteID DESC');
    res.json(result.recordset.map(mapComprobante));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/comprobantes', async (req, res) => {
  const { pedidoId, tipo, serie, correlativo, base, igv, total, medioPago, originalComprobanteId } = req.body || {};
  const normalizedPedidoId = Number(pedidoId);
  const normalizedTipo = String(tipo || '').trim();
  const normalizedSerie = String(serie || '').trim();
  const normalizedCorrelativo = String(correlativo || '').trim();
  const normalizedBase = Number(base);
  const normalizedIgv = Number(igv);
  const normalizedTotal = Number(total);
  const normalizedMedioPago = String(medioPago || '').trim();
  if (!Number.isInteger(normalizedPedidoId) || !['Boleta', 'Factura', 'Nota de crédito'].includes(normalizedTipo) || !normalizedSerie || !normalizedCorrelativo || !normalizedMedioPago || !Number.isFinite(normalizedBase) || !Number.isFinite(normalizedIgv) || !Number.isFinite(normalizedTotal)) {
    return res.status(400).json({ error: 'Pedido, tipo, serie, correlativo y medio de pago son obligatorios.' });
  }
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
    const result = await new sql.Request(transaction)
      .input('PedidoID', sql.BigInt, normalizedPedidoId)
      .input('TipoComprobanteID', sql.Int, normalizedTipo === 'Factura' ? 2 : 1)
      .input('MetodoPagoID', sql.Int, { Efectivo: 1, Tarjeta: 2, Yape: 3, Plin: 4, Transferencia: 5 }[normalizedMedioPago] || 1)
      .input('MovimientoCajaID', sql.BigInt, null)
      .input('Numero', sql.NVarChar(20), `${normalizedSerie}-${normalizedCorrelativo}`)
      .input('SubTotal', sql.Decimal(12, 2), normalizedBase)
      .input('MontoTotal', sql.Decimal(12, 2), normalizedTotal)
      .input('Tipo', sql.NVarChar(20), normalizedTipo)
      .input('Serie', sql.NVarChar(10), normalizedSerie)
      .input('Correlativo', sql.NVarChar(20), normalizedCorrelativo)
      .input('Base', sql.Decimal(12, 2), normalizedBase)
      .input('IGV', sql.Decimal(12, 2), normalizedIgv)
      .input('Total', sql.Decimal(12, 2), normalizedTotal)
      .input('MedioPago', sql.NVarChar(30), normalizedMedioPago)
      .input('EstadoSUNAT', sql.NVarChar(30), 'Pendiente')
      .input('OriginalComprobanteID', sql.BigInt, Number.isInteger(Number(originalComprobanteId)) ? Number(originalComprobanteId) : null)
      .query(`
        INSERT INTO Comprobante (PedidoID, TipoComprobanteID, MetodoPagoID, MovimientoCajaID, Numero, SubTotal, MontoTotal, Tipo, Serie, Correlativo, Base, IGV, Total, MedioPago, EstadoSUNAT, OriginalComprobanteID)
        OUTPUT INSERTED.ComprobanteID, INSERTED.PedidoID, INSERTED.TipoComprobanteID, INSERTED.MetodoPagoID,
          INSERTED.Numero, INSERTED.SubTotal, INSERTED.MontoTotal, INSERTED.Tipo, INSERTED.Serie,
          INSERTED.Correlativo, INSERTED.Base, INSERTED.IGV, INSERTED.Total, INSERTED.MedioPago,
          INSERTED.EstadoSUNAT, INSERTED.OriginalComprobanteID, INSERTED.FechaEmision
        VALUES (@PedidoID, @TipoComprobanteID, @MetodoPagoID, @MovimientoCajaID, @Numero, @SubTotal, @MontoTotal, @Tipo, @Serie, @Correlativo, @Base, @IGV, @Total, @MedioPago, @EstadoSUNAT, @OriginalComprobanteID)
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
        SELECT ComprobanteID, PedidoID, TipoComprobanteID, MetodoPagoID, Numero, SubTotal, MontoTotal, Tipo, Serie, Correlativo, Base, IGV, Total, MedioPago, EstadoSUNAT, OriginalComprobanteID, FechaEmision
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
      .query('SELECT PedidoID, Estado, Observaciones FROM Pedido WITH (UPDLOCK, HOLDLOCK) WHERE PedidoID = @PedidoID');
    if (!current.recordset[0]) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (current.recordset[0].Estado === 'Anulado') return res.status(409).json({ error: 'El pedido ya está anulado.' });
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
  const { pedidoId, tipo, motivo } = req.body || {};
  if (!Number.isInteger(Number(pedidoId)) || !['Falla de producto', 'Retraso', 'Cambio', 'Devolución', 'Otro'].includes(tipo) || !String(motivo || '').trim()) {
    return res.status(400).json({ error: 'Pedido, tipo y motivo son obligatorios.' });
  }
  try {
    const pool = await sql.connect(config);
    await ensureIncidenciaTable(pool);
    const result = await pool.request()
      .input('PedidoID', sql.BigInt, Number(pedidoId))
      .input('EmpleadoResponsableID', sql.Int, DEFAULT_EMPLOYEE_ID)
      .input('TipoIncidencia', sql.NVarChar(40), tipo)
      .input('AccionTomada', sql.NVarChar(1000), 'Pendiente de atención')
      .input('FechaHora', sql.DateTime2, new Date())
      .input('Observaciones', sql.NVarChar(1000), String(motivo).trim())
      .input('Tipo', sql.NVarChar(40), tipo)
      .input('Motivo', sql.NVarChar(1000), String(motivo).trim())
      .query(`
        INSERT INTO Incidencia (PedidoID, EmpleadoResponsableID, TipoIncidencia, AccionTomada, FechaHora, Observaciones, Tipo, Motivo, FechaRegistro)
        OUTPUT INSERTED.IncidenciaID, INSERTED.PedidoID, INSERTED.EmpleadoResponsableID, INSERTED.TipoIncidencia, INSERTED.AccionTomada, INSERTED.FechaHora, INSERTED.Observaciones, INSERTED.Tipo, INSERTED.Motivo, INSERTED.FechaRegistro
        VALUES (@PedidoID, @EmpleadoResponsableID, @TipoIncidencia, @AccionTomada, @FechaHora, @Observaciones, @Tipo, @Motivo, @FechaHora)
      `);
    res.status(201).json(mapIncidencia(result.recordset[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});