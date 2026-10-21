const prisma = require("../configs/prisma");
const { isAdmin } = require("../utils/autorizacion");
const { esTextoNoVacio, isForeignKeyError, isRecordNotFound, isUniqueConstraint } = require("../utils/validacion");

/**
 * Catalogos globales que administra el ADMIN desde Configuracion: tipos de
 * producto y unidades de medida. Los dos funcionan igual y solo cambian sus
 * campos, asi que se arman con la misma fabrica.
 *
 * Reglas comunes:
 * - Todos los campos son texto obligatorio, con largo maximo y sin repetirse
 *   (sin distinguir mayusculas: "Litros" y "litros" son el mismo valor).
 * - No se puede eliminar un valor que usa algun producto.
 * - El listado lo pueden leer el ADMIN y el ENCARGADO, porque el encargado los
 *   elige al cargar productos. La cantidad de productos que usan cada valor solo
 *   se informa al ADMIN, porque cuenta productos de todas las empresas.
 */
const crearCatalogo = ({ modelo, campos, articulo, nombre }) => {
  const delegado = () => prisma[modelo];
  const pronombre = articulo === "el" ? "lo" : "la";
  const noExiste = `${articulo === "el" ? "El" : "La"} ${nombre} no existe`;

  const select = { id: true, createdAt: true, updatedAt: true };
  for (const campo of campos) {
    select[campo.clave] = true;
  }

  const formatear = (registro, conCantidad) => {
    const { _count: conteo, ...datos } = registro;
    return conCantidad ? { ...datos, cantidadProductos: conteo.productos } : datos;
  };

  /** Valida y normaliza el cuerpo. Devuelve { datos } o { error }. */
  const leerCuerpo = (body) => {
    const datos = {};

    for (const campo of campos) {
      const valor = body?.[campo.clave];

      if (!esTextoNoVacio(valor)) {
        return { error: `${campo.etiqueta} es ${campo.femenino ? "obligatoria" : "obligatorio"}` };
      }

      const limpio = valor.trim().replace(/\s+/g, " ");
      if (limpio.length > campo.largoMaximo) {
        return { error: `${campo.etiqueta} no puede tener mas de ${campo.largoMaximo} caracteres` };
      }

      datos[campo.clave] = limpio;
    }

    return { datos };
  };

  /** Busca otro registro con el mismo valor en algun campo unico, sin distinguir mayusculas. */
  const buscarRepetido = async (datos, idExcluido) => {
    for (const campo of campos) {
      const repetido = await delegado().findFirst({
        where: {
          [campo.clave]: { equals: datos[campo.clave], mode: "insensitive" },
          ...(idExcluido ? { NOT: { id: idExcluido } } : {})
        },
        select: { id: true }
      });

      if (repetido) {
        return `Ya existe ${articulo} ${nombre} con ${campo.etiqueta.toLowerCase()} "${datos[campo.clave]}"`;
      }
    }

    return null;
  };

  const listar = async (req, res) => {
    try {
      const conCantidad = isAdmin(req);
      const registros = await delegado().findMany({
        select: conCantidad ? { ...select, _count: { select: { productos: true } } } : select,
        orderBy: { [campos[0].clave]: "asc" }
      });

      return res.json(registros.map((registro) => formatear(registro, conCantidad)));
    } catch (error) {
      return res.status(500).json({ message: `No se pudo cargar el listado de ${nombre}` });
    }
  };

  const crear = async (req, res) => {
    try {
      const { datos, error } = leerCuerpo(req.body);
      if (error) {
        return res.status(400).json({ message: error });
      }

      const repetido = await buscarRepetido(datos);
      if (repetido) {
        return res.status(409).json({ message: repetido });
      }

      const registro = await delegado().create({
        data: datos,
        select: { ...select, _count: { select: { productos: true } } }
      });

      return res.status(201).json(formatear(registro, true));
    } catch (error) {
      if (isUniqueConstraint(error)) {
        return res.status(409).json({ message: `Ya existe ${articulo} ${nombre} con esos datos` });
      }
      return res.status(500).json({ message: `No se pudo crear ${articulo} ${nombre}` });
    }
  };

  const actualizar = async (req, res) => {
    try {
      const { datos, error } = leerCuerpo(req.body);
      if (error) {
        return res.status(400).json({ message: error });
      }

      const repetido = await buscarRepetido(datos, req.params.id);
      if (repetido) {
        return res.status(409).json({ message: repetido });
      }

      const registro = await delegado().update({
        where: { id: req.params.id },
        data: datos,
        select: { ...select, _count: { select: { productos: true } } }
      });

      return res.json(formatear(registro, true));
    } catch (error) {
      if (isRecordNotFound(error)) {
        return res.status(404).json({ message: noExiste });
      }
      if (isUniqueConstraint(error)) {
        return res.status(409).json({ message: `Ya existe ${articulo} ${nombre} con esos datos` });
      }
      return res.status(500).json({ message: `No se pudo actualizar ${articulo} ${nombre}` });
    }
  };

  const eliminar = async (req, res) => {
    try {
      const registro = await delegado().findUnique({
        where: { id: req.params.id },
        select: { id: true, _count: { select: { productos: true } } }
      });

      if (!registro) {
        return res.status(404).json({ message: noExiste });
      }

      const enUso = registro._count.productos;
      if (enUso > 0) {
        return res.status(409).json({
          message: `No se puede eliminar porque ${enUso === 1 ? `${pronombre} usa 1 producto` : `${pronombre} usan ${enUso} productos`}`
        });
      }

      await delegado().delete({ where: { id: registro.id } });
      return res.json({ id: registro.id });
    } catch (error) {
      if (isRecordNotFound(error)) {
        return res.status(404).json({ message: noExiste });
      }
      // Un producto lo tomo entre la verificacion y el borrado: la base lo impide
      if (isForeignKeyError(error)) {
        return res.status(409).json({ message: `No se puede eliminar porque ${pronombre} usa al menos un producto` });
      }
      return res.status(500).json({ message: `No se pudo eliminar ${articulo} ${nombre}` });
    }
  };

  return { listar, crear, actualizar, eliminar };
};

const tiposProducto = crearCatalogo({
  modelo: "tipoProducto",
  articulo: "el",
  nombre: "tipo de producto",
  campos: [{ clave: "nombre", etiqueta: "El nombre", largoMaximo: 40 }]
});

const unidadesMedida = crearCatalogo({
  modelo: "unidadMedida",
  articulo: "la",
  nombre: "unidad de medida",
  campos: [
    { clave: "nombre", etiqueta: "El nombre", largoMaximo: 40 },
    { clave: "abreviatura", etiqueta: "La abreviatura", largoMaximo: 10, femenino: true }
  ]
});

module.exports = { tiposProducto, unidadesMedida };
