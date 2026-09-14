# Tanda 4 — Pautas de ejercicio: CU46, CU47, CU48, CU49.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from motor import generar_cu, chrome_path
from comun import *

VPAUTAS, VEJERCICIOS = 'V_Pautas', 'V_Mis_Ejercicios'

# ──────────────────────────── CU46 ────────────────────────────
CU46 = dict(id='CU46', nombre='Seleccionando material en biblioteca centralizada', actores=['Profesional'],
  vistas={'Profesional': VPAUTAS},
  participantes=[ACTOR, VISTA, *capa(), *T('Material_Terapeutico', 'Pauta_Ejercicio')],
  principal=[
    'A -> V: ingresar_texto_en_el_buscador(texto)',
    f'V -> {API}: GET /clinica/materiales (buscar = texto)',
    *leer('buscar_material_por_nombre_categoria_y_tipo(texto)', 'Material_Terapeutico',
          'material_terapeutico_id, nombre, categoria, tipo_recurso', 'N coincidencias', 'return (materiales)'),
    f'{API} --> V: return (HTTP 200 OK: resultados de la biblioteca)',
    'V --> A: mostrar_la_lista_de_resultados()',
    'A -> V: seleccionar_recurso(material_terapeutico_id)',
    'V ->> V: verificar_que_el_recurso_esta_en_el_listado()',
    f'V -> {API}: POST /clinica/pautas (ejercicio con material_terapeutico_id)',
    *leer('verificar_disponibilidad_del_material(material_terapeutico_id)', 'Material_Terapeutico',
          'material_terapeutico_id, nombre, disponibilidad', '1 material disponible', 'return (material vigente)'),
    *insertar('asociar_material_al_ejercicio(pauta_ejercicio, material_terapeutico_id)', 'Pauta_Ejercicio',
              ' (nombre_ejercicio, series, repeticiones, frecuencia, material_terapeutico_id)'),
    f'{API} --> V: return (HTTP 201: material asociado al ejercicio)',
    'V --> A: mostrar_el_recurso_vinculado_al_ejercicio()',
  ],
  excepciones={
    1: dict(cortar='SELECT material_terapeutico_id, nombre, categoria', lineas=[
        *vacio('Material_Terapeutico', '0 coincidencias', 'sin coincidencias'),
        '! El termino de busqueda no existe en la biblioteca',
        f'{API} --> V: return (HTTP 200 OK: sin resultados)',
        'V --> A: informar_la_falta_de_coincidencias()',
        'A ->> A: limpiar_el_filtro_de_texto()'],
        reanudar='ingresar_texto_en_el_buscador'),
    2: dict(cortar='GET /clinica/materiales', lineas=[
        '! Caida del motor de busqueda indexada',
        f'{API} ->> {API}: detectar_la_caida_del_indice()',
        *leer('recuperar_el_catalogo_completo()', 'Material_Terapeutico',
              'material_terapeutico_id, nombre, categoria, tipo_recurso', 'catalogo completo', 'return (catalogo)'),
        f'{API} --> V: return (HTTP 200 OK: catalogo sin filtrar)',
        'V --> A: mostrar_el_catalogo_completo_para_busqueda_visual()'],
        reanudar='seleccionar_recurso'),
    3: dict(cortar='verificar_que_el_recurso_esta_en_el_listado', lineas=[
        '! El recurso indicado no existe en el catalogo',
        'V --> A: rechazar_la_asociacion_e_informar()',
        'A -> V: elegir_un_recurso_del_listado(material_terapeutico_id)'],
        reanudar='verificar_que_el_recurso_esta_en_el_listado'),
    4: dict(cortar='SELECT material_terapeutico_id, nombre, disponibilidad', lineas=[
        *vacio('Material_Terapeutico', '1 material marcado obsoleto', 'material obsoleto'),
        '! El recurso seleccionado esta marcado como obsoleto',
        f'{API} --> V: return (HTTP 409 MATERIAL_OBSOLETO)',
        'V --> A: rechazar_la_asociacion_y_pedir_un_recurso_actualizado()',
        'A -> V: seleccionar_recurso(material_terapeutico_id actualizado)'],
        reanudar='verificar_que_el_recurso_esta_en_el_listado'),
  })

# ──────────────────────────── CU47 ────────────────────────────
CU47 = dict(id='CU47', nombre='Prescribiendo pautas de ejercicio técnico', actores=['Profesional'],
  vistas={'Profesional': VPAUTAS},
  participantes=[ACTOR, VISTA, *capa(), *T('Episodio_Clinico', 'Material_Terapeutico', 'Pauta_Tratamiento', 'Pauta_Ejercicio', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: abrir_la_pestana_pautas_y_seleccionar_episodio(episodio_clinico_id)',
    'V ->> V: habilitar_campos_de_nombre_vigencia_y_ejercicios()',
    'V --> A: mostrar_el_formulario_de_la_pauta()',
    'A -> V: definir_parametros_y_vigencia(nombre, fecha_inicio, fecha_expiracion, ejercicios)',
    'V ->> V: verificar_lista_de_ejercicios_sin_repetidos()',
    'V ->> V: asignar_frecuencia_diaria_por_defecto_si_falta()',
    'V ->> V: validar_series_y_repeticiones(enteros mayores o iguales a uno)',
    f'V -> {API}: POST /clinica/pautas (episodio, nombre, vigencia, ejercicios)',
    *begin(),
    *leer('verificar_episodio_del_profesional(episodio_clinico_id)', 'Episodio_Clinico',
          'episodio_clinico_id, estado, profesional_id', '1 episodio abierto y propio', 'return (episodio valido)'),
    *leer('verificar_materiales_disponibles(material_terapeutico_id)', 'Material_Terapeutico',
          'material_terapeutico_id, nombre, disponibilidad', 'N materiales disponibles', 'return (materiales vigentes)'),
    *insertar('crear_la_pauta(nombre, vigencia, episodio_clinico_id)', 'Pauta_Tratamiento',
              ' (nombre, estado, fecha_inicio, fecha_expiracion, episodio_clinico_id)'),
    *insertar('crear_los_ejercicios(series, repeticiones, frecuencia, material)', 'Pauta_Ejercicio',
              ' (nombre_ejercicio, series, repeticiones, frecuencia, material_terapeutico_id, pauta_tratamiento_id)'),
    *insertar('registrar_auditoria(PAUTA_CREADA, pauta_tratamiento_id)', 'Bitacora_Auditoria'),
    *commit(),
    f'{API} --> V: return (HTTP 201: pauta creada y vinculada al episodio)',
    'V --> A: mostrar_la_pauta_disponible_para_el_paciente()',
  ],
  excepciones={
    1: dict(cortar='verificar_lista_de_ejercicios_sin_repetidos', lineas=[
        '! La pauta no tiene ejercicios o hay ejercicios repetidos',
        'V --> A: bloquear_el_formulario_e_indicar_el_problema()',
        'A -> V: completar_la_lista_de_ejercicios(ejercicios)'],
        reanudar='verificar_lista_de_ejercicios_sin_repetidos'),
    2: dict(cortar='asignar_frecuencia_diaria_por_defecto_si_falta', lineas=[
        '! El profesional no indica una frecuencia valida',
        'V --> A: informar_que_se_asigno_frecuencia_diaria_por_defecto()',
        'A -> V: ajustar_la_frecuencia_si_corresponde(diaria | semanal)'],
        reanudar='validar_series_y_repeticiones'),
    3: dict(cortar='validar_series_y_repeticiones', lineas=[
        '! Valores no numericos o menores a uno en series o repeticiones',
        'V --> A: rechazar_el_guardado_indicando_el_ejercicio_en_conflicto()',
        'A -> V: ingresar_digitos_validos(series, repeticiones)'],
        reanudar='validar_series_y_repeticiones'),
    4: dict(cortar='SELECT episodio_clinico_id, estado, profesional_id', lineas=[
        *vacio('Episodio_Clinico', '0 episodios del profesional', 'episodio inexistente o ajeno'),
        '! El episodio no existe o no pertenece al profesional',
        *rollback(),
        f'{API} --> V: return (HTTP 404 EPISODIO_NO_ENCONTRADO | 403 EPISODIO_AJENO)',
        'V --> A: denegar_la_vinculacion_de_la_pauta()',
        'A ->> A: instanciar_el_episodio_clinico_base (CU78)'],
        reanudar='abrir_la_pestana_pautas_y_seleccionar_episodio'),
  })

# ──────────────────────────── CU48 ────────────────────────────
CU48 = dict(id='CU48', nombre='Registrando cumplimiento diario de tareas', actores=['Paciente'],
  vistas={'Paciente': VEJERCICIOS},
  participantes=[ACTOR, VISTA, *capa(), *T('Pauta_Tratamiento', 'Pauta_Ejercicio', 'Pauta_Cumplimiento')],
  principal=[
    'A -> V: abrir_mis_ejercicios()',
    f'V -> {API}: GET /clinica/pautas/mis-pautas',
    *leer('obtener_pautas_del_paciente(paciente_id)', 'Pauta_Tratamiento',
          'pauta_tratamiento_id, nombre, estado, fecha_inicio, fecha_expiracion', 'N pautas', 'return (pautas)'),
    *bloque('obtener_ejercicios_y_marcas_del_dia(pauta_tratamiento_id)',
            [q('Pauta_Ejercicio', 'pauta_ejercicio_id, nombre_ejercicio, series, repeticiones, frecuencia', 'N ejercicios'),
             q('Pauta_Cumplimiento', 'pauta_ejercicio_id, fecha', 'marcas de hoy')],
            'return (ejercicios y cumplimiento del dia)'),
    f'{API} ->> {API}: evaluar_vigencia_de_cada_pauta(fecha del servidor)',
    f'{API} --> V: return (HTTP 200 OK: pautas, ejercicios y cumplimiento de hoy)',
    'V --> A: desplegar_los_ejercicios_programados_del_dia()',
    'A -> V: marcar_ejercicio_ejecutado(pauta_ejercicio_id)',
    'V ->> V: aplicar_control_anti_rebote(un envio por ejercicio y dia)',
    f'V -> {API}: POST /clinica/pautas/ejercicios/:id/cumplimiento',
    *leer('verificar_que_el_ejercicio_es_del_paciente(pauta_ejercicio_id)', 'Pauta_Ejercicio',
          'pauta_ejercicio_id, pauta_tratamiento_id', '1 ejercicio propio', 'return (ejercicio)'),
    f'{API} ->> {API}: verificar_que_la_pauta_esta_vigente()',
    *insertar('registrar_cumplimiento(pauta_ejercicio_id, fecha del servidor)', 'Pauta_Cumplimiento',
              ' (pauta_ejercicio_id, fecha) sin duplicar el dia'),
    f'{API} --> V: return (HTTP 200 OK: cumplido_hoy)',
    'V --> A: mostrar_el_ejercicio_como_realizado_hoy()',
  ],
  excepciones={
    1: dict(cortar='evaluar_vigencia_de_cada_pauta', lineas=[
        '! La pauta consultada esta fuera de su rango de vigencia',
        f'{API} --> V: return (HTTP 200 OK: pauta PROGRAMADA o EXPIRADA)',
        'V --> A: mostrar_la_pauta_sin_controles_de_marcado()',
        'A ->> A: revisar_las_fechas_de_la_pauta()'],
        reanudar='abrir_mis_ejercicios'),
    2: dict(cortar='GET /clinica/pautas/mis-pautas', lineas=[
        '! Falla de comunicacion: no se puede cargar la pauta',
        f'{API} --> V: return (HTTP 503: servicio no disponible)',
        'V ->> V: activar_la_cache_local(solo lectura)',
        'V --> A: mostrar_la_ultima_carga_en_solo_lectura()',
        'A ->> A: reintentar_la_carga_al_recuperar_conexion()'],
        reanudar='abrir_mis_ejercicios'),
    3: dict(cortar='marcar_ejercicio_ejecutado', lineas=[
        '! El paciente intenta marcar una tarea de un dia distinto al actual',
        'V ->> V: admitir_solo_marcas_del_dia_de_hoy(fecha del servidor)',
        'V --> A: informar_que_solo_se_marca_la_jornada_presente()',
        'A -> V: marcar_ejercicio_ejecutado(pauta_ejercicio_id de hoy)'],
        reanudar='aplicar_control_anti_rebote'),
    4: dict(cortar='INSERT INTO Pauta_Cumplimiento', lineas=[
        f'Pauta_Cumplimiento --> {SQL}: confirmacion_insert (0 filas: ya existia la marca de hoy)',
        f'{SQL} --> {DAO}: return (0 filas afectadas)',
        f'{DAO} --> {API}: return (marca ya registrada)',
        '! Llegan multiples marcas del mismo ejercicio por error de red',
        f'{API} --> V: return (HTTP 200 OK: ya estaba registrado hoy)'],
        reanudar='mostrar_el_ejercicio_como_realizado_hoy'),
  })

# ──────────────────────────── CU49 ────────────────────────────
CU49 = dict(id='CU49', nombre='Controlando vigencia y ciclo de vida de pautas', actores=['Paciente'],
  vistas={'Paciente': VEJERCICIOS},
  participantes=[ACTOR, VISTA, *capa(), *T('Pauta_Tratamiento', 'Pauta_Ejercicio', 'Pauta_Cumplimiento')],
  principal=[
    'A -> V: solicitar_la_carga_de_sus_pautas()',
    f'V -> {API}: GET /clinica/pautas/mis-pautas',
    *leer('obtener_pautas_con_sus_fechas(paciente_id)', 'Pauta_Tratamiento',
          'pauta_tratamiento_id, nombre, estado, fecha_inicio, fecha_expiracion', 'N pautas', 'return (pautas)'),
    f'{API} ->> {API}: comparar_fechas_con_la_fecha_del_servidor()',
    f'{API} ->> {API}: determinar_estado(PROGRAMADA | VIGENTE | EXPIRADA)',
    *actualizar('marcar_como_expiradas_las_pautas_vencidas()', 'Pauta_Tratamiento', "estado = EXPIRADA"),
    *leer('obtener_ejercicios_y_material_de_las_pautas(pauta_tratamiento_id)', 'Pauta_Ejercicio',
          'pauta_ejercicio_id, nombre_ejercicio, material_terapeutico_id', 'N ejercicios', 'return (ejercicios)'),
    f'{API} ->> {API}: bloquear_material_y_marcas_de_las_pautas_expiradas()',
    f'{API} --> V: return (HTTP 200 OK: pautas con su estado y contenido permitido)',
    'V ->> V: renderizar_condicionalmente_segun_el_estado()',
    'V --> A: mostrar_vigentes_con_controles_y_expiradas_bloqueadas()',
  ],
  excepciones={
    1: dict(cortar='renderizar_condicionalmente_segun_el_estado', lineas=[
        'V --> A: mostrar_la_pauta_expirada_sin_controles()',
        '! El paciente intenta marcar un ejercicio de una pauta expirada',
        'A -> V: intentar_marcar_ejercicio(pauta_ejercicio_id)',
        f'V -> {API}: POST /clinica/pautas/ejercicios/:id/cumplimiento',
        *leer('verificar_que_el_ejercicio_es_del_paciente(pauta_ejercicio_id)', 'Pauta_Ejercicio',
              'pauta_ejercicio_id, pauta_tratamiento_id', '1 ejercicio de pauta expirada', 'return (ejercicio)'),
        f'{API} ->> {API}: verificar_el_estado_de_la_pauta()',
        f'{API} --> V: return (HTTP 409 PAUTA_EXPIRADA)',
        'V --> A: indicar_que_la_pauta_termino()',
        'A ->> A: consultar_al_profesional_por_una_nueva_pauta()'],
        reanudar='solicitar_la_carga_de_sus_pautas'),
    2: dict(cortar='comparar_fechas_con_la_fecha_del_servidor', lineas=[
        '! Lentitud del servidor al calcular la vigencia',
        f'{API} --> V: return (HTTP 504: tiempo de espera agotado)',
        'V ->> V: recuperar_la_ultima_carga_disponible()',
        'V --> A: mostrar_el_contenido_de_la_ultima_carga()',
        'A ->> A: reintentar_la_consulta()'],
        reanudar='solicitar_la_carga_de_sus_pautas'),
    3: dict(cortar='renderizar_condicionalmente_segun_el_estado', lineas=[
        'V --> A: mostrar_la_pauta_programada_sin_controles()',
        '! El paciente intenta marcar un ejercicio de una pauta aun no iniciada',
        'A -> V: intentar_marcar_ejercicio(pauta_ejercicio_id)',
        f'V -> {API}: POST /clinica/pautas/ejercicios/:id/cumplimiento',
        *leer('verificar_que_el_ejercicio_es_del_paciente(pauta_ejercicio_id)', 'Pauta_Ejercicio',
              'pauta_ejercicio_id, pauta_tratamiento_id', '1 ejercicio de pauta programada', 'return (ejercicio)'),
        f'{API} ->> {API}: verificar_el_estado_de_la_pauta()',
        f'{API} --> V: return (HTTP 409 PAUTA_NO_INICIADA)',
        'V --> A: indicar_la_fecha_de_inicio_de_la_pauta()',
        'A ->> A: esperar_al_inicio_de_la_pauta()'],
        reanudar='solicitar_la_carga_de_sus_pautas'),
    4: dict(cortar='UPDATE Pauta_Tratamiento SET estado = EXPIRADA', lineas=[
        *fallo_bd('Pauta_Tratamiento', 'fallo al escribir el estado de expiracion'),
        '! No se persiste la expiracion: el estado calculado gobierna la respuesta',
        f'{API} ->> {API}: mantener_el_estado_calculado_en_la_respuesta()',
        f'{API} ->> {API}: reintentar_la_persistencia_en_la_proxima_consulta()'],
        reanudar='obtener_ejercicios_y_material_de_las_pautas'),
  })

if __name__ == '__main__':
    chrome = chrome_path()
    salida = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'salida')
    total = 0
    for cu in [CU46, CU47, CU48, CU49]:
        ruta, n = generar_cu(cu, os.path.join(salida, cu['id']), chrome=chrome, png=True)
        total += n; print(f"{cu['id']}: {n} paginas")
    print('total paginas', total)
