// Ruta: fro-vista/src/theme/index.js
//
// SISTEMA DE DISEÑO DE PUNTO PAZ SALUD — fuente única de verdad.
//
// Toda la app toma de aquí sus colores, tipografía, espaciados, radios y
// sombras. Antes cada pantalla definía los suyos: había más de 110 colores
// distintos escritos a mano y la interfaz no se veía como un mismo producto.
// Si algo hay que cambiar de aspecto, se cambia en este archivo.
//
// Identidad (rebranding Punto Paz Salud): azul verdoso #003B4D (Pantone 548)
// como color primario y café #8B7140 (Pantone 873C) como acento, sobre base
// blanca. El azul es muy oscuro, así que se usa como color de marca y de
// acción —nunca como fondo de pantalla completa—; el café aparece en dosis
// pequeñas, igual que en el isotipo. Los neutros llevan un matiz cálido
// imperceptible para acompañar esa calidez sin ensuciar la lectura.

// ── Escala de marca ─────────────────────────────────────────────────────────
// Tints y shades del azul oficial, para fondos suaves, bordes y estados.
const azul = {
  50:  '#E7EFF2',   // fondo suave de bloques destacados
  100: '#C6DAE1',   // borde de esos bloques
  200: '#96B8C3',
  300: '#6295A5',
  400: '#317486',
  500: '#0F5A6D',
  600: '#004A5F',   // estado presionado / hover
  700: '#003B4D',   // ★ AZUL OFICIAL DE MARCA (Pantone 548)
  800: '#00303F',
  900: '#00212C',
};

// Café del isotipo: acento cálido. Los tonos oscuros existen para cuando el
// café tiene que llevar texto blanco encima y necesita contraste suficiente.
const cafe = {
  50:  '#F6F1E9',
  100: '#E9DDC7',
  200: '#D6C197',
  300: '#BFA470',
  400: '#A78B52',
  500: '#8B7140',   // ★ CAFÉ OFICIAL DE MARCA (Pantone 873C)
  600: '#7A6238',
  700: '#63502E',
};

// Neutros con un matiz cálido imperceptible: armonizan con el café de la
// marca y evitan el gris azulado genérico.
const neutro = {
  0:   '#FFFFFF',
  25:  '#FCFBF9',   // fondo de la app
  50:  '#F6F4F1',   // superficies hundidas, filas alternas
  100: '#ECE8E3',   // separadores
  200: '#DED9D2',   // bordes
  300: '#C6BFB5',   // bordes de campos
  400: '#9E958A',   // texto deshabilitado, marcas de agua
  500: '#7D756A',
  600: '#5D564D',   // texto secundario  (7.2:1 sobre blanco)
  700: '#433D36',
  800: '#23201C',   // texto principal
  900: '#12100E',   // títulos
};

export const colores = {
  // Marca
  primario:        azul[700],
  primarioFuerte:  azul[800],
  primarioSuave:   azul[50],
  primarioBorde:   azul[100],
  primarioPresionado: azul[600],
  // Acento café del isotipo. 'secundarioFuerte' es el que lleva texto blanco:
  // el café oficial se queda corto de contraste para eso.
  secundario:       cafe[500],
  secundarioFuerte: cafe[700],
  secundarioSuave:  cafe[50],
  secundarioBorde:  cafe[100],

  // Superficies
  fondo:      neutro[25],
  superficie: neutro[0],
  superficieSuave: neutro[50],
  velo:       'rgba(18, 16, 14, 0.55)',

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

  // Estados. Ninguno puede confundirse con los dos colores de marca: el éxito
  // es verde franco y la advertencia tira a naranja, no al café del isotipo.
  exito:        '#0E7A4A',
  exitoSuave:   '#E6F4EC',
  exitoBorde:   '#B7DFC9',

  error:        '#B3261E',
  errorSuave:   '#FDECEA',
  errorBorde:   '#F3C6C2',

  advertencia:      '#A85A00',
  advertenciaSuave: '#FFF2E3',
  advertenciaBorde: '#F5D5AC',

  info:        azul[700],
  infoSuave:   azul[50],
  infoBorde:   azul[100],

  // Escalas completas, por si una pantalla necesita un matiz puntual.
  azul,
  cafe,
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
    shadowColor: '#241C12',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  media: {
    shadowColor: '#241C12',
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  elevada: {
    shadowColor: '#241C12',
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
