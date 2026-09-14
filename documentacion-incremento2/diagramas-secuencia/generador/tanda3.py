# Tanda 3 — Triaje y evaluacion: CU27, CU23, CU24, CU77.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from motor import generar_cu, chrome_path
from comun import *

VENT = 'V_Entrevista_Previa'

# ──────────────────────────── CU27 ────────────────────────────
CU27 = dict(id='CU27', nombre='Registrando aceptación de disclaimer legal', actores=['Paciente'],
  vistas={'Paciente': VENT},
  participantes=[ACTOR, VISTA, *capa(), *T('Paciente', 'Disclaimer', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: iniciar_entrevista_previa()',
    f'V -> {API}: GET /clinica/triaje/disclaimer',
    f'{API} ->> {API}: obtener_texto_legal_vigente(version)',
    f'{API} --> V: return (HTTP 200 OK: texto y version del disclaimer)',
    'V --> A: desplegar_disclaimer_legal_vigente()',
    'A -> V: aceptar_explicitamente()',
    f'V -> {API}: POST /clinica/triaje/disclaimer/aceptar (version)',
    *leer('localizar_paciente(usuario_id)', 'Paciente', 'paciente_id, usuario_id', '1 registro', 'return (paciente_id)'),
    *insertar('registrar_aceptacion(version, paciente_id, marca_temporal)', 'Disclaimer', ' (version_disclaimer, paciente_id)'),
    *insertar('registrar_auditoria(DISCLAIMER_ACEPTADO, paciente_id)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 201: aceptacion registrada)',
    'V --> A: desbloquear_el_inicio_de_la_entrevista()',
  ],
  excepciones={
    1: dict(cortar='GET /clinica/triaje/disclaimer', lineas=['! El servidor no entrega el texto legal vigente',
        f'{API} --> V: return (HTTP 500: texto legal no disponible)', 'V --> A: bloquear_el_flujo_de_avance()',
        'A -> V: reintentar_la_carga_del_modulo()'], reanudar='GET /clinica/triaje/disclaimer'),
    2: dict(cortar='desplegar_disclaimer_legal_vigente', lineas=['! El paciente selecciona la opcion de rechazo',
        'A -> V: rechazar_el_disclaimer()', 'V ->> V: bloquear_el_acceso_a_la_entrevista()',
        'V --> A: redirigir_a_la_interfaz_de_inicio()'], reanudar='iniciar_entrevista_previa'),
    3: dict(cortar='INSERT INTO Disclaimer', lineas=[*fallo_bd('Disclaimer', 'fallo al escribir la marca temporal'),
        '! No se registra la aceptacion con su Timestamp',
        f'{API} --> V: return (HTTP 500 TIMESTAMP_FALLIDO)', 'V --> A: denegar_la_activacion_del_triaje()',
        'A -> V: reintentar_la_aceptacion()'], reanudar='POST /clinica/triaje/disclaimer/aceptar'),
  })

# ──────────────────────────── CU23 ────────────────────────────
CU23 = dict(id='CU23', nombre='Ejecutando entrevista clínica automatizada de triaje', actores=['Paciente'],
  vistas={'Paciente': VENT},
  participantes=[ACTOR, VISTA, *capa(), *T('Triaje', 'Disclaimer')],
  principal=[
    'A -> V: abrir_modulo_de_entrevista_previa()',
    f'V -> {API}: GET /clinica/triaje/estado',
    *leer('obtener_triaje_del_paciente(paciente_id)', 'Triaje', 'triaje_id, estado, respuestas, momento_completado', '1 triaje en progreso', 'return (triaje)'),
    f'{API} --> V: return (HTTP 200 OK: estado y respuestas ya guardadas)',
    f'V -> {API}: GET /clinica/triaje/arbol',
    *leer('verificar_disclaimer_vigente(paciente_id)', 'Disclaimer', 'disclaimer_id, version_disclaimer, momento_aceptacion', '1 aceptacion vigente', 'return (disclaimer vigente)'),
    f'{API} ->> {API}: cargar_reglas_del_arbol_de_decision()',
    f'{API} --> V: return (HTTP 200 OK: arbol de decision)',
    'V --> A: desplegar_pregunta_secuencial(motivo de consulta)',
    'A -> V: responder_pregunta_actual(respuesta)',
    'V ->> V: evaluar_logica_condicional(rama siguiente)',
    f'V -> {API}: PUT /clinica/triaje/respuestas (respuestas parciales)',
    *actualizar('guardar_avance_del_triaje(paciente_id)', 'Triaje', 'respuestas'),
    f'{API} --> V: return (HTTP 200 OK: avance guardado)',
    'V --> A: desplegar_siguiente_pregunta(evolucion, antecedentes, alergias)',
    'A -> V: completar_la_captura_de_sintomatologia_y_antecedentes()',
    'V ->> V: validar_el_cierre_del_flujo_de_preguntas()',
    f'V -> {API}: POST /clinica/triaje/completar (respuestas)',
    *actualizar('marcar_cuestionario_finalizado(triaje_id)', 'Triaje', 'estado, momento_completado, integrado'),
    f'{API} --> V: return (HTTP 200 OK: datos listos para su procesamiento clinico)',
    'V --> A: mostrar_la_entrevista_finalizada()',
  ],
  excepciones={
    1: dict(cortar='SELECT disclaimer_id', lineas=[*vacio('Disclaimer', '0 aceptaciones', 'sin aceptacion vigente'),
        '! El paciente no acepto el Disclaimer Legal del ciclo actual',
        f'{API} --> V: return (HTTP 403 DISCLAIMER_PENDIENTE)', 'V --> A: denegar_el_acceso_a_la_entrevista()',
        'A -> V: aceptar_el_disclaimer_del_ciclo (CU27)', 'V --> A: confirmar_aceptacion_registrada()'],
        reanudar='abrir_modulo_de_entrevista_previa'),
    2: dict(cortar='cargar_reglas_del_arbol_de_decision', lineas=['! Error al cargar las reglas del arbol desde el servidor',
        f'{API} ->> {API}: registrar_el_fallo_de_logica()', f'{API} --> V: return (HTTP 500 FALLA_REGLAS)',
        'V --> A: detener_la_progresion_del_cuestionario()', 'A -> V: refrescar_la_pagina()'], reanudar='GET /clinica/triaje/estado'),
    3: dict(cortar='return (HTTP 200 OK: avance guardado)', lineas=['! El paciente cierra la aplicacion antes de terminar de responder',
        'V ->> V: conservar_las_respuestas_parciales(estado En progreso)', 'V --> A: mantener_el_triaje_en_progreso()',
        'A -> V: reingresar_a_la_plataforma()'], reanudar='GET /clinica/triaje/estado'),
    4: dict(cortar='UPDATE Triaje SET estado, momento_completado, integrado', lineas=[*fallo_bd('Triaje'),
        '! Falla de persistencia al escribir el estado final del cuestionario',
        f'{API} --> V: return (HTTP 500 PERSISTENCIA_FALLIDA)', 'V --> A: notificar_que_la_informacion_no_pudo_estructurarse()',
        'A -> V: presionar_reintento_de_envio_final()'], reanudar='POST /clinica/triaje/completar'),
  })

# ──────────────────────────── CU24 ────────────────────────────
CU24 = dict(id='CU24', nombre='Estructurando datos de sintomatología a Ficha Clínica', actores=['Paciente'],
  vistas={'Paciente': VENT},
  participantes=[ACTOR, VISTA, *capa(), *T('Paciente', 'Triaje', 'Ficha_Clinica', 'Ficha_Alergia', 'Ficha_Antecedente_Patologico', 'Ficha_Antecedente_Quirurgico', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: enviar_la_entrevista_completada()',
    f'V -> {API}: POST /clinica/triaje/completar (respuestas)',
    *leer('localizar_registro_de_paciente(usuario_id)', 'Paciente', 'paciente_id, usuario_id', '1 registro', 'return (paciente_id)'),
    f'{API} ->> {API}: validar_el_formato_de_las_respuestas()',
    f'{API} ->> {API}: categorizar(motivo, zona_anatomica, intensidad, evolucion, antecedentes, alergias)',
    *begin(),
    *actualizar('cerrar_el_triaje(paciente_id)', 'Triaje', 'estado, momento_completado, integrado', 'return (triaje_id)'),
    *leer('localizar_ficha_clinica(paciente_id, crearla si no existe)', 'Ficha_Clinica', 'ficha_clinica_id, anamnesis', '1 ficha', 'return (ficha_clinica_id)'),
    *actualizar('anexar_el_resumen_estructurado_al_final_de_la_anamnesis()', 'Ficha_Clinica', 'anamnesis'),
    *bloque('insertar_alergias_y_antecedentes_sin_duplicar()', [ins('Ficha_Alergia', ' (ficha_clinica_id, alergia)'), ins('Ficha_Antecedente_Patologico', ' (ficha_clinica_id, antecedente)'), ins('Ficha_Antecedente_Quirurgico', ' (ficha_clinica_id, antecedente)')], 'return (Exito_Persistencia)'),
    *insertar('registrar_auditoria(TRIAJE_INTEGRADO, ficha_clinica_id)', 'Bitacora_Auditoria'),
    *commit(),
    f'{API} --> V: return (HTTP 200 OK: resumen integrado y datos sin_clasificar)',
    'V --> A: mostrar_la_vista_previa_de_lo_registrado()',
  ],
  excepciones={
    1: dict(cortar='SELECT paciente_id, usuario_id FROM Paciente', lineas=[*vacio('Paciente', '0 registros', 'sin registro de paciente'),
        '! El registro de paciente asociado a la cuenta no es localizado',
        f'{API} --> V: return (HTTP 404: referencia no encontrada)', 'V --> A: mostrar_el_error_de_referencia()',
        'A ->> A: contactar_a_soporte_tecnico()'], reanudar='enviar_la_entrevista_completada'),
    2: dict(cortar='validar_el_formato_de_las_respuestas', lineas=['! Formato incompatible con el motor de mapeo',
        f'{API} ->> {API}: abortar_el_proceso_de_integracion()', f'{API} --> V: return (HTTP 400 FALLA_INTEGRIDAD)',
        'V --> A: notificar_la_falla_de_integridad_de_datos()', 'A ->> A: reiniciar_la_entrevista (CU23)'],
        reanudar='enviar_la_entrevista_completada'),
    3: dict(cortar='categorizar(motivo', lineas=['! Hay datos que no calzan con las reglas de categorizacion',
        f'{API} ->> {API}: agrupar_la_informacion_ambigua_en_sin_clasificar()'], reanudar='abrir_transaccion'),
    4: dict(cortar='UPDATE Ficha_Clinica SET anamnesis', lineas=[*fallo_bd('Ficha_Clinica'),
        '! La base de datos falla durante la integracion a la ficha',
        *rollback(), f'{API} ->> {API}: conservar_las_respuestas_para_reintentar()',
        f'{API} --> V: return (HTTP 500 PERSISTENCIA_FALLIDA)', 'V --> A: informar_que_la_integracion_no_se_completo()',
        'A -> V: reintentar_el_envio_tras_un_tiempo_prudencial()'], reanudar='POST /clinica/triaje/completar'),
  })

# ──────────────────────────── CU77 ────────────────────────────
CU77 = dict(id='CU77', nombre='Renderizando plantillas dinámicas de evaluación', actores=['Profesional'],
  vistas={'Profesional': 'V_Anamnesis'},
  participantes=[ACTOR, VISTA, *capa(), *T('Profesional', 'Ficha_Clinica', 'Ficha_Alergia', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: abrir_la_pestana_anamnesis(paciente_id)',
    f'V -> {API}: GET /clinica/ficha/:paciente_id',
    f'{API} ->> {API}: verificar_permisos_sobre_la_ficha(auditarAccesoClinico)',
    *insertar('registrar_acceso_clinico(usuario_id, paciente_id)', 'Bitacora_Auditoria'),
    *leer('obtener_ficha_y_antecedentes(paciente_id)', 'Ficha_Clinica', 'ficha_clinica_id, anamnesis, plantilla_especialidad', '1 ficha', 'return (ficha)'),
    f'{API} --> V: return (HTTP 200 OK: anamnesis actual)',
    f'V -> {API}: GET /clinica/plantilla-evaluacion',
    *leer('identificar_especialidad_acreditada(usuario_id)', 'Profesional', 'e.nombre AS especialidad (JOIN Especialidad)', '1 especialidad', 'return (especialidad)'),
    f'{API} ->> {API}: seleccionar_la_plantilla_de_la_disciplina()',
    f'{API} --> V: return (HTTP 200 OK: campos de la plantilla)',
    'V --> A: desplegar_la_plantilla_de_su_disciplina()',
    'A -> V: ingresar_informacion_medica_y_guardar(campos habilitados)',
    'V ->> V: verificar_los_campos_obligatorios_de_la_plantilla()',
    f'V -> {API}: POST /clinica/ficha (anamnesis, plantilla_especialidad, alergias, antecedentes)',
    *begin(),
    *leer('bloquear_la_ficha(paciente_id)', 'Ficha_Clinica', 'ficha_clinica_id, ultima_actualizacion', '1 ficha', 'return (ficha)'),
    f'{API} ->> {API}: verificar_colision_de_escritura(ultima_actualizacion)',
    *actualizar('consolidar_el_bloque_estructurado_de_la_disciplina()', 'Ficha_Clinica', 'anamnesis, plantilla_especialidad'),
    *insertar('reemplazar_alergias_y_antecedentes_declarados()', 'Ficha_Alergia', ' (ficha_clinica_id, alergia)'),
    *commit(),
    f'{API} --> V: return (HTTP 200 OK: anamnesis guardada)',
    'V --> A: mostrar_la_anamnesis_guardada()',
  ],
  excepciones={
    1: dict(cortar='verificar_permisos_sobre_la_ficha', lineas=['! El profesional no tiene permisos sobre la ficha seleccionada',
        f'{API} --> V: return (HTTP 403: acceso restringido)', 'V --> A: desplegar_la_alerta_de_restriccion()',
        'A ->> A: solicitar_autorizacion_al_administrador()'], reanudar='abrir_la_pestana_anamnesis'),
    2: dict(cortar='SELECT e.nombre AS especialidad', lineas=[*vacio('Profesional', 'especialidad nula', 'sin especialidad acreditada'),
        '! La cuenta del profesional no tiene especialidad acreditada',
        f'{API} --> V: return (HTTP 409 SIN_ESPECIALIDAD)', 'V --> A: bloquear_el_renderizado_de_la_plantilla()',
        'A ->> A: completar_su_configuracion_de_perfil (CU10)'], reanudar='abrir_la_pestana_anamnesis'),
    3: dict(cortar='verificar_los_campos_obligatorios_de_la_plantilla', lineas=['! Quedan campos declarados obligatorios por la plantilla sin completar',
        'V --> A: resaltar_en_rojo_los_bloques_pendientes()', 'A -> V: completar_la_informacion_requerida_y_guardar()'],
        reanudar='verificar_los_campos_obligatorios_de_la_plantilla'),
    4: dict(cortar='UPDATE Ficha_Clinica SET anamnesis, plantilla_especialidad', lineas=[*fallo_bd('Ficha_Clinica', 'conexion perdida durante el guardado'),
        '! Se pierde la conexion con la base de datos al guardar',
        *rollback(), f'{API} --> V: return (HTTP 500: guardado no completado)',
        'V ->> V: almacenar_la_plantilla_en_cache_local()', 'V --> A: avisar_que_se_sincronizara_al_restablecer_la_red()',
        'A -> V: sincronizar_los_datos_al_restablecer_la_red()'], reanudar='POST /clinica/ficha'),
  })

if __name__ == '__main__':
    chrome = chrome_path()
    salida = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'salida')
    total = 0
    for cu in [CU27, CU23, CU24, CU77]:
        ruta, n = generar_cu(cu, os.path.join(salida, cu['id']), chrome=chrome, png=True)
        total += n; print(f"{cu['id']}: {n} paginas")
    print('total paginas', total)
