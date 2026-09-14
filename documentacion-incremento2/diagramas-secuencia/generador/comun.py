"""Participantes y atajos compartidos por todas las tandas.

Convenciones acordadas con el equipo (ejemplos CU20 y CU40):
- Orden de lifelines: actor, vistas, C_API_REST y demas controladores,
  C_Capa_de_Acceso_a_Datos, C_MYSQL y, al final, las tablas.
- Toda llamada baja peldaño a peldaño y vuelve por el mismo camino.
- SQL sin marcadores «?» ni WHERE: operacion, tabla y columnas.
"""

def P(id, tipo='comp', nombre=None):
    return {'id': id, 'nombre': nombre or id, 'tipo': tipo}

ACTOR = P('A', 'actor')
VISTA = P('V', 'vista')
API, DAO, SQL = 'C_API_REST', 'C_Capa_de_Acceso_a_Datos', 'C_MYSQL'
SEG, ADP = 'C_Seguridad_JWT_BCrypt', 'C_API_Adapter'
BREVO, CLOUD = 'C_API_Brevo', 'C_API_Cloudinary'
TRES = ['Paciente', 'Profesional', 'Administrador']

EXTERNOS = {BREVO, CLOUD, 'C_API_Transacciones', 'C_API_Bonos_Electronicos', 'Proveedor_Externo'}

def capa(*controladores):
    """C_API_REST, los controladores y las APIs externas, la capa de datos y MySQL.

    El orden del equipo es: actor, vistas, controladores (incluidas las APIs
    externas, que cuelgan del adaptador), capa de acceso a datos, MySQL y, al
    final, las tablas."""
    return [P(API), *[P(c, 'externo' if c in EXTERNOS else 'comp') for c in controladores], P(DAO), P(SQL)]

def T(*tablas): return [P(t, 'tabla') for t in tablas]

# ── tramos de la capa de datos (DAO -> MySQL -> tabla -> MySQL -> DAO) ──
def q(tabla, columnas, resultado='resultado'):
    return [f'{DAO} -> {SQL}: ejecutar_consulta(SELECT)', f'{SQL} -> {tabla}: SELECT {columnas} FROM {tabla}',
            f'{tabla} --> {SQL}: return ({resultado})', f'{SQL} --> {DAO}: return (resultado)']
def upd(tabla, columnas):
    return [f'{DAO} -> {SQL}: ejecutar_actualizacion(UPDATE)', f'{SQL} -> {tabla}: UPDATE {tabla} SET {columnas}',
            f'{tabla} --> {SQL}: confirmacion_update', f'{SQL} --> {DAO}: return (Filas afectadas)']
def ins(tabla, detalle=''):
    return [f'{DAO} -> {SQL}: ejecutar_insercion(INSERT)', f'{SQL} -> {tabla}: INSERT INTO {tabla}{detalle} VALUES (...)',
            f'{tabla} --> {SQL}: confirmacion_insert', f'{SQL} --> {DAO}: return (Filas afectadas)']

# ── viajes completos desde C_API_REST (ida y vuelta) ──
def bloque(llamada, tramos, retorno):
    return [f'{API} -> {DAO}: {llamada}', *[l for t in tramos for l in t], f'{DAO} --> {API}: {retorno}']
def leer(llamada, tabla, columnas, resultado, retorno):
    return bloque(llamada, [q(tabla, columnas, resultado)], retorno)
def actualizar(llamada, tabla, columnas, retorno='return (Exito_Persistencia)'):
    return bloque(llamada, [upd(tabla, columnas)], retorno)
def insertar(llamada, tabla, detalle='', retorno='return (Exito_Persistencia)'):
    return bloque(llamada, [ins(tabla, detalle)], retorno)
def begin():
    return bloque('abrir_transaccion()', [[f'{DAO} -> {SQL}: ejecutar(BEGIN)', f'{SQL} --> {DAO}: return (transaccion iniciada)']], 'return (transaccion abierta)')
def commit():
    return bloque('confirmar_transaccion()', [[f'{DAO} -> {SQL}: ejecutar(COMMIT)', f'{SQL} --> {DAO}: return (commit exitoso)']], 'return (cambios confirmados)')
def rollback():
    return bloque('revertir_transaccion()', [[f'{DAO} -> {SQL}: ejecutar(ROLLBACK)', f'{SQL} --> {DAO}: return (transaccion revertida)']], 'return (cambios revertidos)')
def externo(llamada, servicio, peticion, respuesta, retorno):
    return [f'{API} -> {ADP}: {llamada}', f'{ADP} -> {servicio}: {peticion}', f'{servicio} --> {ADP}: {respuesta}', f'{ADP} --> {API}: {retorno}']

# ── fallos que desandan el camino ──
def fallo_bd(tabla, causa='error de escritura'):
    return [f'{tabla} --> {SQL}: {causa}', f'{SQL} --> {DAO}: throw (SQLException)', f'{DAO} --> {API}: return (Fallo_Persistencia)']
def vacio(tabla, texto, retorno_dao):
    """La tabla responde sin filas: desanda hasta C_API_REST."""
    return [f'{tabla} --> {SQL}: return ({texto})', f'{SQL} --> {DAO}: return (resultado)', f'{DAO} --> {API}: return ({retorno_dao})']
