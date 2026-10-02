// Ruta: fro-vista/src/screens/Paciente/MiTratamientoScreen.js
//
// "Mi tratamiento": segunda pestaña de la barra inferior del paciente. Reúne
// en pestañas superiores (el mismo TabSelector de la ficha clínica del
// profesional) lo que antes eran cuatro botones sueltos del inicio.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { getMiDerivacion } from '../../api/client';
import TabSelector from '../../components/TabSelector';
import MiProgresoScreen from './MiProgresoScreen';
import MisPautasScreen from './MisPautasScreen';
import MiSeguimientoScreen from './MiSeguimientoScreen';
import TriajeScreen from './TriajeScreen';
import { PESTANA_DE_TRATAMIENTO } from '../../navigation/rutasBarra';
import { colores } from '../../theme';

const PESTANAS = [
  { key: 'progreso',    titulo: 'Mi progreso',       icono: '📊', Componente: MiProgresoScreen },
  { key: 'ejercicios',  titulo: 'Mis ejercicios',    icono: '🏋️', Componente: MisPautasScreen },
  { key: 'seguimiento', titulo: 'Mi seguimiento',    icono: '📈', Componente: MiSeguimientoScreen },
  { key: 'entrevista',  titulo: 'Entrevista previa', icono: '🩺', Componente: TriajeScreen },
];

export default function MiTratamientoScreen({ route, navigation }) {
  const pedida = route?.params?.pestana;
  // Sin una pestaña pedida, la inicial depende de la entrevista previa: quien
  // todavía no la ha completado parte por ella. Mientras se consulta, null.
  const [tabActiva, setTabActiva] = useState(pedida || null);
  // Las pestañas ya abiertas se mantienen montadas: la entrevista a medio
  // responder o el reporte a medio escribir no se pierden al cambiar.
  const [visitadas, setVisitadas] = useState(() => new Set(pedida ? [pedida] : []));
  // "Mi progreso" solo muestra gráficos: se vuelve a montar cada vez que se
  // abre, para que refleje el reporte o los ejercicios recién registrados.
  const [vueltasProgreso, setVueltasProgreso] = useState(0);

  // Si el paciente ya eligió una pestaña, la consulta inicial no la pisa.
  const yaEligio = useRef(Boolean(pedida));

  const abrirTab = (key) => {
    yaEligio.current = true;
    setTabActiva(key);
    setVisitadas((previas) => new Set(previas).add(key));
    if (key === 'progreso') setVueltasProgreso((n) => n + 1);
  };

  useEffect(() => {
    if (pedida) return;
    let vigente = true;
    const elegir = (key) => vigente && !yaEligio.current && abrirTab(key);
    getMiDerivacion()
      .then((datos) => elegir(datos?.hay_triaje === false ? 'entrevista' : 'progreso'))
      // Si no se puede consultar, se abre la de siempre.
      .catch(() => elegir('progreso'));
    return () => {
      vigente = false;
    };
  }, []);

  // Un aviso o un enlace puede pedir una pestaña concreta.
  useEffect(() => {
    if (!pedida) return;
    abrirTab(pedida);
    navigation.setParams({ pestana: undefined });
  }, [pedida]);

  // Las pantallas internas siguen llamando a navigate con sus nombres de
  // siempre; los que ahora son pestañas de aquí se traducen a un cambio.
  const navegacionInterna = useMemo(
    () => ({
      ...navigation,
      navigate: (destino, params) => {
        const interna = PESTANA_DE_TRATAMIENTO[destino];
        if (interna) {
          abrirTab(interna);
          return;
        }
        navigation.navigate(destino, params);
      },
      setOptions: () => {},
    }),
    [navigation]
  );

  return (
    <View style={styles.contenedor}>
      <TabSelector tabs={PESTANAS} tabActiva={tabActiva} onCambiarTab={abrirTab} />

      {tabActiva === null && (
        <View style={styles.cargando}>
          <ActivityIndicator size="large" color={colores.primario} />
        </View>
      )}

      <View style={styles.panel}>
        {PESTANAS.map((tab) => {
          if (!visitadas.has(tab.key)) return null;
          const activa = tab.key === tabActiva;
          const { Componente } = tab;
          return (
            <View
              key={tab.key === 'progreso' ? `progreso-${vueltasProgreso}` : tab.key}
              style={activa ? styles.panelActivo : styles.panelOculto}
              pointerEvents={activa ? 'auto' : 'none'}
            >
              <Componente
                route={{ key: `tratamiento-${tab.key}`, name: tab.key, params: {} }}
                navigation={navegacionInterna}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colores.fondo },
  panel: { flex: 1 },
  cargando: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Igual que en la ficha clínica: la activa en el layout normal, las demás
  // montadas pero fuera del layout.
  panelActivo: { flex: 1 },
  panelOculto: { display: 'none' },
});
