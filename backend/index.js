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

app.get('/api/productos', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query('SELECT TOP 10 ProductoID, NombreProducto, PrecioActual FROM Producto WHERE Estado = 1');
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

  let transaction;
  try {
    const pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);
    await transaction.begin();
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

    for (const producto of productos) {
      const cantidad = Number(producto.cantidad);
      if (!Number.isInteger(producto.productoId) || cantidad < 1 || !Number.isInteger(cantidad)) {
        throw new Error('Cada producto debe tener productoId y una cantidad entera mayor a cero.');
      }
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
        .input('SubTotal', sql.Decimal(12, 2), Number(product.PrecioActual) * cantidad)
        .query('INSERT INTO DetallePedido (PedidoID, ProductoID, Cantidad, PrecioAplicado, SubTotal) VALUES (@PedidoID, @ProductoID, @Cantidad, @PrecioAplicado, @SubTotal)');
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
    res.status(500).json({ error: err.message });
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