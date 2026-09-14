# Tanda 5 — Evidencia de atencion: CU39, CU41, CU42, CU43.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from motor import generar_cu, chrome_path
from comun import *

VEVID, VAGENDA, VFIRMA = 'V_Evidencia_Sesion', 'V_Gestion_Agenda', 'V_Firma_Conformidad'
DOS = ['Profesional', 'Paciente']

# ──────────────────────────── CU39 ────────────────────────────
CU39 = dict(id='CU39', nombre='Validando presencialidad mediante coordenadas GPS', actores=DOS,
  vistas={r: VEVID for r in DOS},
  participantes=[ACTOR, VISTA, *capa(), *T('Cita', 'Parametro_Global', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: activar_check_in(momento = INICIO)',
    'V ->> V: obtener_coordenadas_del_gps_del_terminal()',
    f'V -> {API}: POST /citas/:id/checkin-gps (lat, lng, momento = INICIO)',
    *leer('verificar_participacion_en_la_cita(cita_id, usuario_id)', 'Cita',
          'cita_id, estado, modalidad, evidencia_presencial', '1 cita confirmada o en curso', 'return (cita y evidencia)'),
    *leer('leer_parametro(RADIO_PRESENCIALIDAD_METROS)', 'Parametro_Global', 'clave, valor', 'radio en metros', 'return (radio)'),
    f'{API} ->> {API}: contrastar_con_la_marca_del_otro_actor(distancia menor o igual al radio)',
    *actualizar('registrar_la_marca_de_inicio(lat, lng)', 'Cita', 'evidencia_presencial, checkin_profesional'),
    *insertar('registrar_auditoria(CHECKIN_GPS, rol, distancia_metros)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 200 OK: marca de inicio registrada)',
    'V --> A: mostrar_el_check_in_confirmado()',
    'A -> V: activar_termino_de_sesion(momento = TERMINO)',
    'V ->> V: obtener_coordenadas_del_gps_al_cierre()',
    f'V -> {API}: POST /citas/:id/checkin-gps (lat, lng, momento = TERMINO)',
    *leer('verificar_participacion_en_la_cita(cita_id, usuario_id)', 'Cita',
          'cita_id, estado, modalidad, evidencia_presencial', '1 cita en curso', 'return (cita y evidencia)'),
    f'{API} ->> {API}: certificar_la_permanencia_en_el_radio(distancia menor o igual al radio)',
    *actualizar('registrar_la_marca_de_termino(lat, lng)', 'Cita', 'evidencia_presencial'),
    *insertar('registrar_auditoria(CHECKIN_GPS, rol, momento de termino)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 200 OK: permanencia certificada)',
    'V --> A: mostrar_la_evidencia_de_presencialidad_completa()',
  ],
  excepciones={
    1: dict(cortar='obtener_coordenadas_del_gps_del_terminal', lineas=[
        '! El hardware GPS del terminal esta desactivado',
        'V --> A: impedir_el_registro_de_la_marca()',
        'A ->> A: habilitar_los_servicios_de_ubicacion_en_su_terminal()'],
        reanudar='activar_check_in'),
    2: dict(cortar='contrastar_con_la_marca_del_otro_actor', lineas=[
        '! La distancia entre los dispositivos supera el radio parametrizado',
        *insertar('registrar_auditoria(PRESENCIALIDAD_NO_COINCIDENTE, distancia_metros, radio_metros)', 'Bitacora_Auditoria'),
        f'{API} --> V: return (HTTP 409 PRESENCIALIDAD_NO_COINCIDENTE, distancia_metros)',
        'V --> A: rechazar_la_marca_de_inicio_e_indicar_la_distancia()',
        'A ->> A: verificar_su_ubicacion_junto_al_otro_actor()'],
        reanudar='activar_check_in'),
    3: dict(cortar='activar_termino_de_sesion', lineas=[
        '! El terminal del Paciente pierde energia antes del cierre',
        'V --> A: informar_que_no_se_recibio_la_marca_de_termino()',
        'A ->> A: coordinar_el_cierre_manual_justificado (CU41)'],
        reanudar='activar_termino_de_sesion'),
    4: dict(cortar='certificar_la_permanencia_en_el_radio', lineas=[
        '! El Profesional abandono el radio de ubicacion antes del termino',
        *insertar('registrar_auditoria(CHECKIN_FUERA_DE_RADIO, bandera roja)', 'Bitacora_Auditoria'),
        f'{API} ->> {API}: marcar_la_evidencia_para_justificacion_operativa()'],
        reanudar='registrar_la_marca_de_termino'),
  })

# ──────────────────────────── CU41 ────────────────────────────
CU41 = dict(id='CU41', nombre='Validando sesión mediante protocolo multi-factor', actores=['Profesional', 'Administrador'],
  vistas={'Profesional': VAGENDA, 'Administrador': VAGENDA},
  participantes=[ACTOR, VISTA, *capa(ADP, BREVO), *T('Cita', 'Parametro_Global', 'Usuario', 'Notificacion', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: ejecutar_validar_sesion(cita_id)',
    f'V -> {API}: POST /citas/:id/validar-sesion',
    *leer('verificar_cita_del_profesional(cita_id, usuario_id)', 'Cita',
          'cita_id, estado, modalidad, evidencia_presencial', '1 cita REALIZADA', 'return (cita)'),
    *leer('verificar_certificacion_previa(cita_id)', 'Cita', 'sesion_certificada_en, certificacion_tipo', 'sin certificar', 'return (sesion no certificada)'),
    *leer('leer_parametros(TOLERANCIA_MULTIFACTOR_MINUTOS, RADIO_PRESENCIALIDAD_METROS)', 'Parametro_Global', 'clave, valor', 'tolerancia y radio', 'return (parametros)'),
    f'{API} ->> {API}: analizar_factores_cruzados(marca del profesional, presencia del paciente, diferencia dentro de tolerancia, GPS dentro del radio)',
    f'{API} --> V: return (HTTP 200 OK: resumen de factores)',
    'V --> A: mostrar_el_resumen_de_factores()',
    'A -> V: confirmar_el_cierre_de_la_sesion()',
    f'V -> {API}: POST /citas/:id/validar-sesion (confirmacion)',
    *actualizar('registrar_la_certificacion(fecha, tipo = MULTIFACTOR)', 'Cita', 'sesion_certificada_en, certificacion_tipo'),
    *insertar('persistir_el_detalle_de_los_factores(SESION_CERTIFICADA)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 200 OK: sesion certificada)',
    'V --> A: mostrar_la_sesion_certificada()',
  ],
  excepciones={
    1: dict(cortar='analizar_factores_cruzados', lineas=[
        '! El Paciente omitio emitir su marca de termino en su aplicacion',
        f'{API} --> V: return (HTTP 200 OK: requiere_cierre_manual)',
        'V --> A: habilitar_el_cierre_manual_con_justificacion_obligatoria()',
        'A -> V: redactar_la_justificacion_y_confirmar(justificacion)',
        f'V -> {API}: POST /citas/:id/validar-sesion (cierre manual, justificacion)',
        *actualizar('registrar_la_certificacion(fecha, tipo = MANUAL)', 'Cita', 'sesion_certificada_en, certificacion_tipo'),
        *insertar('persistir_el_detalle_del_cierre_manual(SESION_CERTIFICADA)', 'Bitacora_Auditoria'),
        f'{API} --> V: return (HTTP 200 OK: sesion certificada por cierre manual)'],
        reanudar='mostrar_la_sesion_certificada'),
    2: dict(cortar='analizar_factores_cruzados', lineas=[
        '! Discrepancias criticas: diferencia sobre la tolerancia o GPS no coincidente',
        *actualizar('suspender_la_sesion(detalle de las discrepancias)', 'Cita', 'sesion_suspendida_en, motivo_suspension'),
        *leer('obtener_contactos_de_la_cita(cita_id)', 'Cita', 'datos de contacto del paciente y del profesional (JOIN Usuario)', 'contactos', 'return (contactos)'),
        *leer('obtener_administradores_activos()', 'Usuario', 'usuario_id, email (JOIN Rol)', 'N administradores', 'return (administradores)'),
        *insertar('avisar_en_la_aplicacion(SESION_SUSPENDIDA)', 'Notificacion', ' (aviso a cada administrador)'),
        *externo('enviar_correo_a_los_administradores(contactos)', BREVO, 'POST /v3/smtp/email', 'return (HTTP 201 Aceptado)', 'return (correo aceptado)'),
        f'{API} --> V: return (HTTP 409 VALIDACION_SUSPENDIDA, administradores_avisados)',
        'V --> A: informar_la_suspension_y_la_derivacion_al_administrador()',
        'A ->> A: coordinar_la_resolucion_y_certificar_con_cierre_manual()'],
        reanudar='ejecutar_validar_sesion'),
    3: dict(cortar='confirmar_el_cierre_de_la_sesion', lineas=[
        '! El Profesional rechaza el resumen o pierde conexion antes de confirmar',
        'V --> A: informar_que_no_se_persistio_ninguna_certificacion()',
        'A ->> A: retomar_la_validacion_con_la_sesion_pendiente()'],
        reanudar='confirmar_el_cierre_de_la_sesion'),
    4: dict(cortar='UPDATE Cita SET sesion_certificada_en, certificacion_tipo', lineas=[
        *fallo_bd('Cita', 'error de escritura al guardar la certificacion'),
        '! Falla de escritura al guardar la certificacion',
        f'{API} --> V: return (HTTP 500 CIERRE_ENCOLADO)',
        'V --> A: informar_que_el_cierre_quedo_pendiente()',
        'A ->> A: reintentar_en_unos_minutos()'],
        reanudar='confirmar_el_cierre_de_la_sesion'),
  })

# ──────────────────────────── CU42 ────────────────────────────
CU42 = dict(id='CU42', nombre='Capturando firma manuscrita de conformidad', actores=['Profesional', 'Paciente'],
  vistas={'Profesional': VFIRMA, 'Paciente': VFIRMA},
  participantes=[ACTOR, VISTA, *capa(ADP, BREVO), *T('Cita', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: habilitar_la_interfaz_de_captura_de_firma(cita_id)',
    'V ->> V: verificar_la_interfaz_tactil_del_terminal()',
    f'V -> {API}: GET /citas/:id/declaracion-conformidad',
    f'{API} ->> {API}: obtener_el_texto_de_la_declaracion_vigente()',
    f'{API} --> V: return (HTTP 200 OK: declaracion de conformidad)',
    'V --> A: desplegar_el_lienzo_y_la_declaracion()',
    'A -> V: dibujar_el_trazo_de_la_firma(trazos)',
    'V ->> V: verificar_que_el_trazo_no_este_vacio()',
    f'V -> {API}: POST /citas/:id/firma (tipo = FIRMA, trazos, declaracion_version)',
    *leer('verificar_cita_del_profesional(cita_id)', 'Cita', 'cita_id, estado, firma_conformidad_datos', '1 cita sin firma previa', 'return (cita)'),
    f'{API} ->> {API}: validar_que_el_trazo_no_sea_nulo()',
    *actualizar('almacenar_la_firma_como_evidencia_inalterable()', 'Cita', 'firma_conformidad_datos'),
    *insertar('registrar_auditoria(FIRMA_CONFORMIDAD, cita_id)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 201: firma registrada)',
    'V --> A: mostrar_el_cierre_documental_registrado()',
  ],
  excepciones={
    1: dict(cortar='verificar_la_interfaz_tactil_del_terminal', lineas=[
        '! El terminal del Profesional carece de interfaz tactil',
        'V --> A: bloquear_la_captura_grafica()',
        'A -> V: habilitar_la_validacion_por_correo_electronico()',
        f'V -> {API}: POST /citas/:id/firma (tipo = CORREO)',
        *externo('enviar_la_declaracion_al_paciente(email)', BREVO, 'POST /v3/smtp/email', 'return (HTTP 201 Aceptado)', 'return (correo aceptado)'),
        *actualizar('registrar_la_validacion_por_correo()', 'Cita', 'firma_conformidad_datos'),
        *insertar('registrar_auditoria(CONFORMIDAD_POR_CORREO, cita_id)', 'Bitacora_Auditoria'),
        f'{API} --> V: return (HTTP 201: declaracion enviada al paciente)'],
        reanudar='mostrar_el_cierre_documental_registrado'),
    2: dict(cortar='obtener_el_texto_de_la_declaracion_vigente', lineas=[
        '! No se logra obtener la declaracion legal',
        f'{API} --> V: return (HTTP 500: declaracion no disponible)',
        'V --> A: bloquear_el_lienzo()',
        'A -> V: recargar_el_modulo_de_cierre()'],
        reanudar='GET /citas/:id/declaracion-conformidad'),
    3: dict(cortar='dibujar_el_trazo_de_la_firma', lineas=[
        '! El Paciente rechaza ejecutar la firma de conformidad',
        'V --> A: habilitar_el_campo_de_observaciones_obligatorio()',
        'A -> V: ingresar_la_justificacion_del_rechazo(observacion)',
        f'V -> {API}: POST /citas/:id/firma (tipo = RECHAZO, observacion)',
        *leer('verificar_cita_del_profesional(cita_id)', 'Cita', 'cita_id, estado, firma_conformidad_datos', '1 cita sin firma previa', 'return (cita)'),
        *actualizar('registrar_el_rechazo_con_su_justificacion()', 'Cita', 'firma_conformidad_datos'),
        *insertar('registrar_auditoria(RECHAZO_DE_FIRMA, cita_id)', 'Bitacora_Auditoria'),
        f'{API} --> V: return (HTTP 201: rechazo registrado con su justificacion)'],
        reanudar='mostrar_el_cierre_documental_registrado'),
    4: dict(cortar='verificar_que_el_trazo_no_este_vacio', lineas=[
        '! El lienzo esta vacio: el trazo es nulo',
        'V --> A: rechazar_el_guardado_por_lienzo_vacio()',
        'A -> V: dibujar_el_trazo_de_la_firma(trazos)'],
        reanudar='verificar_que_el_trazo_no_este_vacio'),
  })

# ──────────────────────────── CU43 ────────────────────────────
CU43 = dict(id='CU43', nombre='Registrando evidencia técnica de teleconsulta', actores=DOS,
  vistas={r: VEVID for r in DOS},
  participantes=[ACTOR, VISTA, *capa(), *T('Cita', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: declarar_el_inicio_de_la_videollamada()',
    'V ->> V: solicitar_permisos_de_camara_y_microfono()',
    'V ->> V: recolectar_metadatos_tecnicos(ip, latencia, dispositivo, permisos)',
    f'V -> {API}: POST /citas/:id/evidencia-teleconsulta (evento = INICIO, metadatos)',
    *leer('verificar_participacion_en_la_cita(cita_id, usuario_id)', 'Cita',
          'cita_id, estado, modalidad, metadatos_teleconsulta', '1 cita virtual', 'return (cita y metadatos)'),
    f'{API} ->> {API}: agregar_segmento_de_conexion(rol, evento, momento)',
    *actualizar('persistir_los_metadatos_de_la_sesion()', 'Cita', 'metadatos_teleconsulta'),
    *insertar('registrar_auditoria(EVIDENCIA_TELECONSULTA, segmentos)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 200 OK: segmento registrado)',
    'V --> A: mostrar_la_conexion_registrada()',
    'A -> V: declarar_el_termino_de_la_atencion()',
    'V ->> V: recolectar_metadatos_de_cierre(latencia, duracion)',
    f'V -> {API}: POST /citas/:id/evidencia-teleconsulta (evento = TERMINO, metadatos)',
    *leer('verificar_participacion_en_la_cita(cita_id, usuario_id)', 'Cita',
          'cita_id, estado, modalidad, metadatos_teleconsulta', '1 cita virtual', 'return (cita y metadatos)'),
    f'{API} ->> {API}: cerrar_el_segmento_y_generar_el_registro_inmutable()',
    *actualizar('persistir_los_segmentos_de_conexion()', 'Cita', 'metadatos_teleconsulta'),
    *insertar('registrar_auditoria(EVIDENCIA_TELECONSULTA, cierre)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 200 OK: evidencia de la teleconsulta completa)',
    'V --> A: mostrar_la_evidencia_certificada()',
  ],
  excepciones={
    1: dict(cortar='solicitar_permisos_de_camara_y_microfono', lineas=[
        '! El dispositivo deniega los permisos de camara o microfono',
        'V ->> V: registrar_los_permisos_denegados_en_los_metadatos()',
        'V --> A: informar_los_permisos_denegados()',
        'A ->> A: otorgar_los_permisos_en_su_dispositivo()'],
        reanudar='declarar_el_inicio_de_la_videollamada'),
    2: dict(cortar='agregar_segmento_de_conexion', lineas=[
        '! Perdida intermitente de conexion durante la llamada',
        f'{API} ->> {API}: registrar_multiples_segmentos_cortos()'],
        reanudar='persistir_los_metadatos_de_la_sesion'),
    3: dict(cortar='declarar_el_termino_de_la_atencion', lineas=[
        '! La conexion se interrumpe abruptamente por corte de energia o de red',
        'V --> A: informar_que_la_transmision_se_interrumpio()',
        'A ->> A: reconectar_la_llamada_en_la_plataforma_externa()',
        'A -> V: declarar_la_reconexion()',
        f'V -> {API}: POST /citas/:id/evidencia-teleconsulta (evento = RECONEXION)',
        f'{API} ->> {API}: registrar_un_segmento_adicional()',
        *actualizar('persistir_el_segmento_adicional()', 'Cita', 'metadatos_teleconsulta'),
        f'{API} --> V: return (HTTP 200 OK: segmento adicional registrado)',
        'V --> A: mostrar_la_reconexion_registrada()'],
        reanudar='declarar_el_termino_de_la_atencion'),
    4: dict(cortar='INSERT INTO Bitacora_Auditoria', lineas=[
        *fallo_bd('Bitacora_Auditoria', 'error de escritura en la bitacora'),
        '! Error de escritura en la base de datos de auditoria',
        f'{API} --> V: return (HTTP 500 PERSISTENCIA_FALLIDA)',
        'V ->> V: conservar_un_respaldo_temporal_local()',
        'V --> A: avisar_que_se_sincronizara_al_volver_a_la_pantalla()',
        'A ->> A: volver_a_la_pantalla_de_evidencia()'],
        reanudar='declarar_el_inicio_de_la_videollamada'),
  })

if __name__ == '__main__':
    chrome = chrome_path()
    salida = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'salida')
    total = 0
    for cu in [CU39, CU41, CU42, CU43]:
        ruta, n = generar_cu(cu, os.path.join(salida, cu['id']), chrome=chrome, png=True)
        total += n; print(f"{cu['id']}: {n} paginas")
    print('total paginas', total)
