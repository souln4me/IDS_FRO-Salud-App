// Ruta: fro-vista/src/components/GraficoLinea.js
//
// Gráfico de líneas dibujado a mano con SVG. No se suma una librería de
// gráficos: react-native-svg ya está en el proyecto (lo usa el lienzo de firma
// del CU42) y lo que hace falta acá son ejes, una polilínea y puntos.
//
// CU45 — Excepción 2: si el dibujo falla por lo que sea, la pantalla no puede
// quedarse en blanco. Por eso el componente viene envuelto en una barrera de
// error que, ante un fallo de renderizado, muestra los mismos valores en
// formato de texto.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as TextoSvg } from 'react-native-svg';

import { colores, espacio, tipografia } from '../theme';

const ALTO = 170;
const MARGEN = { arriba: 12, derecha: 12, abajo: 26, izquierda: 32 };

/**
 * Barrera de error: React exige una clase para capturar fallos de renderizado.
 * Si el gráfico revienta, se muestran los valores como texto (Excepción 2).
 */
class BarreraGrafico extends React.Component {
  constructor(props) {
    super(props);
    this.state = { fallo: false };
  }

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error) {
    console.warn('[GraficoLinea] dibujo no disponible:', error?.message);
  }

  render() {
    if (this.state.fallo) return this.props.respaldo;
    return this.props.children;
  }
}

/** Valores en texto: el respaldo cuando el gráfico no se puede dibujar. */
function TablaValores({ series, etiquetas }) {
  return (
    <View style={estilos.tabla}>
      <Text style={estilos.tablaAviso}>
        No pudimos dibujar el gráfico en este dispositivo. Estos son los mismos datos:
      </Text>
      {etiquetas.map((etiqueta, i) => (
        <Text key={etiqueta} style={estilos.tablaLinea}>
          {etiqueta}:{' '}
          {series[i]?.puntos?.map((p) => `${p.etiqueta} ${p.valor}`).join(' · ') || 'sin datos'}
        </Text>
      ))}
    </View>
  );
}

/**
 * @param {Array} series  [{ puntos: [{etiqueta, valor}], color }]
 * @param {number} maximo  tope del eje vertical (10 para dolor, 100 para %)
 * @param {string[]} etiquetas  nombre de cada serie, para la leyenda
 */
export default function GraficoLinea({ series = [], maximo = 100, etiquetas = [], ancho = 300 }) {
  const conDatos = series.filter((s) => s?.puntos?.length > 0);

  if (conDatos.length === 0) {
    return <Text style={estilos.sinDatos}>Todavía no hay datos para este periodo.</Text>;
  }

  const anchoUtil = Math.max(120, ancho - MARGEN.izquierda - MARGEN.derecha);
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;
  const totalPuntos = Math.max(...conDatos.map((s) => s.puntos.length));

  // Con un solo punto la línea no existe: se dibuja centrado como marca única.
  const x = (i) =>
    MARGEN.izquierda +
    (totalPuntos === 1 ? anchoUtil / 2 : (i * anchoUtil) / (totalPuntos - 1));
  const y = (valor) => MARGEN.arriba + altoUtil - (Math.min(valor, maximo) / maximo) * altoUtil;

  const respaldo = <TablaValores series={series} etiquetas={etiquetas} />;

  return (
    <BarreraGrafico respaldo={respaldo}>
      <View>
        <Svg width={ancho} height={ALTO}>
          {/* Tres guías horizontales: 0, la mitad y el tope. */}
          {[0, maximo / 2, maximo].map((valor) => (
            <React.Fragment key={valor}>
              <Line
                x1={MARGEN.izquierda}
                y1={y(valor)}
                x2={ancho - MARGEN.derecha}
                y2={y(valor)}
                stroke={colores.bordeSuave}
                strokeWidth="1"
              />
              <TextoSvg
                x={MARGEN.izquierda - 6}
                y={y(valor) + 4}
                fontSize="10"
                fill={colores.textoTenue}
                textAnchor="end"
              >
                {Math.round(valor)}
              </TextoSvg>
            </React.Fragment>
          ))}

          {conDatos.map((serie, indice) => (
            <React.Fragment key={indice}>
              <Polyline
                points={serie.puntos.map((p, i) => `${x(i)},${y(p.valor)}`).join(' ')}
                fill="none"
                stroke={serie.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {serie.puntos.map((p, i) => (
                <Circle key={i} cx={x(i)} cy={y(p.valor)} r="3.5" fill={serie.color} />
              ))}
            </React.Fragment>
          ))}

          {/* Solo el primer y el último rótulo: con más, se enciman. */}
          {conDatos[0].puntos.length > 0 && (
            <>
              <TextoSvg
                x={MARGEN.izquierda}
                y={ALTO - 8}
                fontSize="10"
                fill={colores.textoTenue}
                textAnchor="start"
              >
                {conDatos[0].puntos[0].etiqueta}
              </TextoSvg>
              {conDatos[0].puntos.length > 1 && (
                <TextoSvg
                  x={ancho - MARGEN.derecha}
                  y={ALTO - 8}
                  fontSize="10"
                  fill={colores.textoTenue}
                  textAnchor="end"
                >
                  {conDatos[0].puntos[conDatos[0].puntos.length - 1].etiqueta}
                </TextoSvg>
              )}
            </>
          )}
        </Svg>

        {etiquetas.length > 0 && (
          <View style={estilos.leyenda}>
            {series.map((serie, i) => (
              <View key={i} style={estilos.itemLeyenda}>
                <View style={[estilos.puntoLeyenda, { backgroundColor: serie.color }]} />
                <Text style={estilos.textoLeyenda}>{etiquetas[i]}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </BarreraGrafico>
  );
}

const estilos = StyleSheet.create({
  sinDatos: { ...tipografia.meta, color: colores.textoTenue, paddingVertical: espacio.base },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.base, marginTop: espacio.sm },
  itemLeyenda: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  puntoLeyenda: { width: 10, height: 10, borderRadius: 5 },
  textoLeyenda: { ...tipografia.micro, color: colores.textoSuave },
  tabla: { paddingVertical: espacio.sm },
  tablaAviso: { ...tipografia.meta, color: colores.advertencia, marginBottom: espacio.sm },
  tablaLinea: { ...tipografia.meta, color: colores.textoSuave, marginBottom: 4 },
});
