// Ruta: fro-vista/src/theme/index.js
//
// SISTEMA DE DISEÑO DE FRO SALUD — fuente única de verdad.
//
// Toda la app toma de aquí sus colores, tipografía, espaciados, radios y
// sombras. Antes cada pantalla definía los suyos: había más de 110 colores
// distintos escritos a mano y la interfaz no se veía como un mismo producto.
// Si algo hay que cambiar de aspecto, se cambia en este archivo.
//
// Identidad: verde #004639 (primario) y negro (secundario). Ambos son muy
// oscuros, así que se usan como acento y color de marca —nunca como fondo de
// toda la pantalla— sobre una base de neutros claros con un leve matiz verde
// para que el conjunto se sienta de la misma familia.

// ── Escala de marca ─────────────────────────────────────────────────────────
// Tints y shades del verde oficial, para fondos suaves, bordes y estados.
const verde = {
  50:  '#E8F2EF',   // fondo suave de bloques destacados
  100: '#CBE0DA',   // borde de esos bloques
  200: '#9DC4BA',
  300: '#6BA697',
  400: '#3E8876',
  500: '#1A6B58',
  600: '#005543',   // estado presionado / hover
  700: '#004639',   // ★ VERDE OFICIAL DE MARCA
  800: '#003A2F',
  900: '#002B22',
};

// Neutros con un matiz verde imperceptible: armonizan con la marca y evitan
// el gris azulado genérico.
const neutro = {
  0:   '#FFFFFF',
  25:  '#FAFBFA',   // fondo de la app
  50:  '#F4F6F5',   // superficies hundidas, filas alternas
  100: '#E9EDEB',   // separadores
  200: '#DCE2DF',   // bordes
  300: '#C2CBC7',   // bordes de campos
  400: '#9AA5A0',   // texto deshabilitado, marcas de agua
  500: '#7A857F',
  600: '#5A6560',   // texto secundario  (6.1:1 sobre blanco)
  700: '#3D4642',
  800: '#1F2724',   // texto principal
  900: '#0B0F0D',   // títulos (negro de marca)
};

export const colores = {
  // Marca
  primario:        verde[700],
  primarioFuerte:  verde[800],
  primarioSuave:   verde[50],
  primarioBorde:   verde[100],
  primarioPresionado: verde[600],
  secundario:      '#000000',   // negro oficial

  // Superficies
  fondo:      neutro[25],
  superficie: neutro[0],
  superficieSuave: neutro[50],
  velo:       'rgba(11, 15, 13, 0.55)',

  // Bordes
  borde:       neutro[200],
  bordeSuave:  neutro[100],
  bordeCampo:  neutro[300],

  // Texto
  texto:        neutro[800],
  textoTitulo:  neutro[900],
  textoSuave:   neutro[600],
  textoTenue:   neutro[500],
  textoInverso: neutro[0],
  textoDeshabilitado: neutro[400],

  // Estados. El verde de marca ya ocupa el rol "positivo", así que el éxito
  // usa un verde más luminoso para que ambos se distingan de un vistazo.
  exito:        '#0E7A4A',
  exitoSuave:   '#E6F4EC',
  exitoBorde:   '#B7DFC9',

  error:        '#B3261E',
  errorSuave:   '#FDECEA',
  errorBorde:   '#F3C6C2',

  advertencia:      '#8A5300',
  advertenciaSuave: '#FFF6E5',
  advertenciaBorde: '#F0DCB4',

  info:        verde[700],
  infoSuave:   verde[50],
  infoBorde:   verde[100],

  // Escalas completas, por si una pantalla necesita un matiz puntual.
  verde,
  neutro,
};

// ── Tipografía ──────────────────────────────────────────────────────────────
// Escala fija: ningún tamaño arbitrario suelto en las pantallas.
export const tipografia = {
  display:    { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  titulo:     { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  subtitulo:  { fontSize: 17, lineHeight: 24, fontWeight: '600', letterSpacing: -0.1 },
  cuerpoFuerte: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  cuerpo:     { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  meta:       { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  metaFuerte: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  micro:      { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.4 },
};

// ── Espaciado (base 4) ──────────────────────────────────────────────────────
export const espacio = {
  xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40,
};

// ── Radios ──────────────────────────────────────────────────────────────────
export const radio = {
  sm: 8, md: 12, lg: 16, xl: 20, completo: 999,
};

// ── Sombras suaves ──────────────────────────────────────────────────────────
// Difusas y de baja opacidad: dan profundidad sin ensuciar el diseño.
export const sombra = {
  ninguna: {},
  suave: {
    shadowColor: '#0B1F1A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  media: {
    shadowColor: '#0B1F1A',
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  elevada: {
    shadowColor: '#0B1F1A',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 9,
  },
};

// ── Piezas repetidas ────────────────────────────────────────────────────────
// Composiciones listas para no repetir las mismas seis líneas en cada archivo.
export const piezas = {
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    borderWidth: 1,
    borderColor: colores.bordeSuave,
    padding: espacio.base,
    ...sombra.suave,
  },
  campo: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.bordeCampo,
    borderRadius: radio.md,
    paddingHorizontal: espacio.base,
    paddingVertical: espacio.md,
    fontSize: 15,
    color: colores.texto,
  },
  campoFoco:  { borderColor: colores.primario, borderWidth: 1.5 },
  campoError: { borderColor: colores.error, backgroundColor: colores.errorSuave },
  botonPrimario: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    paddingVertical: 15,
    paddingHorizontal: espacio.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...sombra.suave,
  },
  botonSecundario: {
    backgroundColor: 'transparent',
    borderRadius: radio.md,
    borderWidth: 1.5,
    borderColor: colores.primario,
    paddingVertical: 13,
    paddingHorizontal: espacio.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etiqueta: {
    ...tipografia.metaFuerte,
    color: colores.textoSuave,
    marginBottom: espacio.sm,
  },
};

// Opacidad estándar de lo deshabilitado y de la respuesta al toque, para que
// todos los elementos reaccionen igual.
export const interaccion = {
  opacidadActiva: 0.75,
  opacidadDeshabilitada: 0.45,
};

export default { colores, tipografia, espacio, radio, sombra, piezas, interaccion };
