# Tanda 6 — Documentos y versionado: CU31, CU33, CU34, CU35.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from motor import generar_cu, chrome_path
from comun import *

VAGENDA, VDOCS, VMISDOCS = 'V_Gestion_Agenda', 'V_Documentos_Paciente', 'V_Mis_Documentos'

# ──────────────────────────── CU31 ────────────────────────────
CU31 = dict(id='CU31', nombre='Gestionando versionado de correcciones auditadas', actores=['Profesional'],
  vistas={'Profesional': VAGENDA},
  participantes=[ACTOR, VISTA, *capa(), *T('Evolucion_Clinica', 'Evolucion_Version', 'Parametro_Global', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: seleccionar_registro_clinico_finalizado(evolucion_id)',
    f'V -> {API}: GET /clinica/evolucion/:id/versiones',
    *leer('obtener_las_versiones_del_registro(evolucion_id)', 'Evolucion_Version',
          'version, texto_correccion, momento_creacion', 'N versiones', 'return (versiones)'),
    f'{API} --> V: return (HTTP 200 OK: documento base y sus versiones)',
    'V --> A: habilitar_el_campo_de_correccion_vinculado_al_documento_base()',
    'A -> V: redactar_la_aclaracion_y_guardar(texto)',
    'V ->> V: verificar_que_la_correccion_no_este_vacia()',
    f'V -> {API}: POST /clinica/evolucion/:id/versiones (texto)',
    *begin(),
    *leer('bloquear_y_leer_la_evolucion(evolucion_id)', 'Evolucion_Clinica',
          'evolucion_clinica_id, inalterable, profesional_id', '1 registro finalizado y propio', 'return (evolucion)'),
    *leer('leer_parametro(MAX_VERSIONES_CORRECCION)', 'Parametro_Global', 'clave, valor', 'maximo de versiones', 'return (maximo)'),
    *leer('contar_las_versiones_existentes(evolucion_id)', 'Evolucion_Version', 'COUNT(*) AS total', 'total bajo el maximo', 'return (total)'),
    *insertar('crear_la_nueva_version_indexada(texto, numero de version)', 'Evolucion_Version',
              ' (evolucion_clinica_id, version, texto_correccion, profesional_id)'),
    *insertar('registrar_auditoria(CORRECCION_VERSIONADA, evolucion_id)', 'Bitacora_Auditoria'),
    *commit(),
    f'{API} --> V: return (HTTP 201: nueva version creada)',
    'V --> A: mostrar_la_version_indexada_preservando_el_original()',
  ],
  excepciones={
    1: dict(cortar='SELECT evolucion_clinica_id, inalterable, profesional_id', lineas=[
        *vacio('Evolucion_Clinica', '1 registro de otro profesional', 'sin permiso de autoria'),
        '! El Profesional carece de permisos de autoria sobre el registro',
        *insertar('registrar_auditoria(CORRECCION_DENEGADA_AUTORIA, evolucion_id)', 'Bitacora_Auditoria'),
        *rollback(),
        f'{API} --> V: return (HTTP 403 SIN_PERMISO_AUTORIA)',
        'V --> A: bloquear_la_opcion_de_correccion()',
        'A ->> A: solicitar_acceso_al_administrador()'],
        reanudar='seleccionar_registro_clinico_finalizado'),
    2: dict(cortar='SELECT COUNT(*) AS total', lineas=[
        *vacio('Evolucion_Version', 'total igual al maximo permitido', 'maximo de versiones alcanzado'),
        '! El registro ya posee el numero maximo de versiones permitidas',
        *rollback(),
        f'{API} --> V: return (HTTP 409 MAXIMO_VERSIONES)',
        'V --> A: denegar_la_nueva_anexion()',
        'A ->> A: contactar_al_administrador()'],
        reanudar='seleccionar_registro_clinico_finalizado'),
    3: dict(cortar='verificar_que_la_correccion_no_este_vacia', lineas=[
        '! El Profesional intenta guardar una correccion vacia',
        'V --> A: emitir_el_mensaje_de_validacion()',
        'A -> V: redactar_la_aclaracion_y_guardar(texto descriptivo)'],
        reanudar='verificar_que_la_correccion_no_este_vacia'),
    4: dict(cortar='INSERT INTO Evolucion_Version', lineas=[
        *fallo_bd('Evolucion_Version', 'fallo al vincular la version con el registro'),
        '! No se logra vincular la nueva version con el registro clinico',
        *rollback(),
        f'{API} --> V: return (HTTP 500: operacion cancelada)',
        'V --> A: informar_que_la_operacion_fue_cancelada()'],
        reanudar='redactar_la_aclaracion_y_guardar'),
  })

# ──────────────────────────── CU33 ────────────────────────────
CU33 = dict(id='CU33', nombre='Almacenando archivos en repositorio multimedia', actores=['Profesional'],
  vistas={'Profesional': VDOCS},
  participantes=[ACTOR, VISTA, *capa(ADP, CLOUD), *T('Parametro_Global', 'Profesional', 'Documento_Clinico', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: seleccionar_documento_del_dispositivo(archivo)',
    'V ->> V: verificar_el_tamano_contra_el_limite_parametrizado()',
    'V ->> V: validar_la_extension(imagenes, PDF, DOCX, video)',
    'V --> A: habilitar_el_control_de_envio()',
    'A -> V: indicar_la_categoria_y_confirmar(categoria)',
    f'V -> {API}: POST /clinica/pacientes/:id/documentos (multipart, categoria)',
    *leer('leer_parametro(MAX_TAMANO_ARCHIVO_MB)', 'Parametro_Global', 'clave, valor', 'limite en megabytes', 'return (limite)'),
    f'{API} ->> {API}: validar_formato_y_tamano_en_el_servidor()',
    *leer('verificar_el_acceso_del_profesional_al_paciente(usuario_id)', 'Profesional',
          'profesional_id, usuario_id', '1 profesional vinculado', 'return (profesional_id)'),
    *externo('transferir_el_archivo_al_repositorio(buffer, carpeta del paciente)', CLOUD,
             'POST /upload (resource_type segun el formato)', 'return (secure_url, public_id, paginas)', 'return (datos del archivo en la nube)'),
    *insertar('registrar_los_metadatos_del_documento(url, formato, categoria, tamano)', 'Documento_Clinico',
              ' (nombre_original, categoria, formato, tamano_bytes, tipo_recurso, url_publica, public_id_cloud, paginas, paciente_id, episodio_clinico_id, profesional_id)'),
    *insertar('registrar_auditoria(CARGA_DOCUMENTO, documento_id)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 201: documento disponible en el historial)',
    'V --> A: mostrar_el_documento_en_el_historial_cronologico()',
  ],
  excepciones={
    1: dict(cortar='verificar_el_tamano_contra_el_limite_parametrizado', lineas=[
        '! El tamano del archivo excede el limite de megabytes parametrizado',
        'V --> A: rechazar_la_solicitud_de_carga_inicial()',
        'A ->> A: comprimir_el_documento()'],
        reanudar='seleccionar_documento_del_dispositivo'),
    2: dict(cortar='validar_la_extension', lineas=[
        '! El formato del archivo no esta soportado',
        'V --> A: bloquear_la_accion_e_informar_los_formatos_aceptados()',
        'A ->> A: elegir_un_archivo_con_formato_permitido()'],
        reanudar='seleccionar_documento_del_dispositivo'),
    3: dict(cortar='habilitar_el_control_de_envio', lineas=[
        '! El Profesional cancela la confirmacion antes de iniciar la transferencia',
        'A -> V: cancelar_la_confirmacion()',
        'V --> A: descartar_la_seleccion()'],
        reanudar='seleccionar_documento_del_dispositivo'),
    4: dict(cortar='POST /upload', lineas=[
        f'{CLOUD} --> {ADP}: error de transferencia (conexion perdida)',
        f'{ADP} --> {API}: return (CARGA_INTERRUMPIDA)',
        '! Se pierde la conexion con el repositorio durante la transferencia',
        f'{API} --> V: return (HTTP 502 CARGA_INTERRUMPIDA)',
        'V --> A: informar_que_no_se_persistio_ningun_registro()',
        'A ->> A: reiniciar_el_proceso_de_carga()'],
        reanudar='seleccionar_documento_del_dispositivo'),
  })

# ──────────────────────────── CU34 ────────────────────────────
CU34 = dict(id='CU34', nombre='Categorizando documentos mediante metadatos', actores=['Profesional'],
  vistas={'Profesional': VDOCS},
  participantes=[ACTOR, VISTA, *capa(), *T('Documento_Clinico', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: abrir_el_menu_de_clasificacion_del_archivo(documento_id)',
    f'V -> {API}: GET /clinica/documentos/categorias',
    f'{API} ->> {API}: obtener_la_taxonomia_de_categorias()',
    f'{API} --> V: return (HTTP 200 OK: categorias disponibles)',
    'V --> A: desplegar_el_menu_de_clasificacion_taxonomica()',
    'A -> V: seleccionar_la_categoria_tecnica(categoria)',
    f'V -> {API}: PUT /clinica/documentos/:id/categoria (categoria)',
    *leer('verificar_el_documento_y_el_acceso(documento_id, usuario_id)', 'Documento_Clinico',
          'documento_id, paciente_id, categoria', '1 documento accesible', 'return (documento)'),
    f'{API} ->> {API}: asignar_sin_clasificar_si_no_llega_categoria()',
    *actualizar('registrar_la_categoria_del_archivo(categoria)', 'Documento_Clinico', 'categoria'),
    *insertar('registrar_auditoria(RECLASIFICACION_DOCUMENTO, categoria anterior y nueva)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 200 OK: documento reclasificado e indexado)',
    'V --> A: confirmar_la_clasificacion_del_documento()',
    'A -> V: filtrar_el_repositorio_por_categoria(categoria)',
    f'V -> {API}: GET /clinica/pacientes/:id/documentos (categoria)',
    *leer('recuperar_los_documentos_de_la_categoria(paciente_id, categoria)', 'Documento_Clinico',
          'documento_id, nombre_original, categoria, formato', 'N documentos', 'return (documentos)'),
    f'{API} --> V: return (HTTP 200 OK: documentos filtrados)',
    'V --> A: mostrar_el_listado_filtrado_por_categoria()',
  ],
  excepciones={
    1: dict(cortar='obtener_la_taxonomia_de_categorias', lineas=[
        '! Falla la carga de las categorias desde el controlador',
        f'{API} --> V: return (HTTP 500: categorias no disponibles)',
        'V --> A: mostrar_la_lista_vacia()',
        'A -> V: recargar_el_modulo()'],
        reanudar='GET /clinica/documentos/categorias'),
    2: dict(cortar='asignar_sin_clasificar_si_no_llega_categoria', lineas=[
        '! El Profesional omite la seleccion de categoria',
        f'{API} ->> {API}: aplicar_el_metadato_sin_clasificar()'],
        reanudar='registrar_la_categoria_del_archivo'),
    3: dict(cortar='SELECT documento_id, nombre_original, categoria, formato', lineas=[
        *fallo_bd('Documento_Clinico', 'fallo al aplicar el filtro por categoria'),
        '! El filtro por categoria no puede aplicarse',
        *leer('recuperar_el_listado_completo(paciente_id)', 'Documento_Clinico',
              'documento_id, nombre_original, categoria', 'N documentos', 'return (listado completo)'),
        f'{API} --> V: return (HTTP 200 OK: listado completo sin filtrar)',
        'V --> A: mostrar_el_listado_completo_para_busqueda_visual()'],
        reanudar='filtrar_el_repositorio_por_categoria'),
  })

# ──────────────────────────── CU35 ────────────────────────────
CU35 = dict(id='CU35', nombre='Visualizando archivos con visor embebido', actores=TRES,
  vistas={'Paciente': VMISDOCS, 'Profesional': VDOCS, 'Administrador': VDOCS},
  participantes=[ACTOR, VISTA, *capa(), *T('Documento_Clinico', 'Bitacora_Auditoria')],
  principal=[
    'A -> V: seleccionar_el_archivo_clinico(documento_id)',
    f'V -> {API}: GET /clinica/documentos/:id/ver',
    *leer('obtener_los_metadatos_del_documento(documento_id)', 'Documento_Clinico',
          'documento_id, nombre_original, categoria, formato, tipo_recurso, url_publica, paciente_id',
          '1 documento', 'return (documento)'),
    f'{API} ->> {API}: validar_los_permisos_del_perfil_solicitante(RBAC)',
    f'{API} ->> {API}: determinar_el_tipo_de_visor(imagen, PDF, documento o video)',
    *insertar('registrar_auditoria(VISUALIZACION_DOCUMENTO, documento_id)', 'Bitacora_Auditoria'),
    f'{API} --> V: return (HTTP 200 OK: url del recurso y tipo de visor)',
    'V --> A: ofrecer_la_apertura_grafica_del_documento()',
    'A -> V: solicitar_la_apertura_del_documento()',
    'V ->> V: renderizar_el_contenido_segun_su_tipo(visor nativo, pagina a pagina o visor web embebido)',
    'V --> A: mostrar_el_documento_sin_descargarlo_en_el_dispositivo()',
  ],
  excepciones={
    1: dict(cortar='SELECT documento_id, nombre_original, categoria, formato, tipo_recurso', lineas=[
        *vacio('Documento_Clinico', 'documento sin contenido procesable', 'documento no disponible'),
        '! El archivo seleccionado no puede procesarse',
        f'{API} --> V: return (HTTP 404 DOCUMENTO_NO_ENCONTRADO)',
        'V --> A: informar_el_error_de_carga()',
        'A ->> A: elegir_un_archivo_valido()'],
        reanudar='seleccionar_el_archivo_clinico'),
    2: dict(cortar='validar_los_permisos_del_perfil_solicitante', lineas=[
        '! Intento de acceso sin autorizacion segun el RBAC',
        *insertar('registrar_auditoria(VISUALIZACION_DENEGADA, documento_id)', 'Bitacora_Auditoria'),
        f'{API} --> V: return (HTTP 403 ACCESO_DENEGADO)',
        'V --> A: denegar_la_visualizacion()',
        'A ->> A: retornar_al_menu()'],
        reanudar='seleccionar_el_archivo_clinico'),
    3: dict(cortar='solicitar_la_apertura_del_documento', lineas=[
        '! El actor cancela la peticion antes del renderizado',
        'V --> A: abortar_la_carga_en_memoria()',
        'A ->> A: navegar_hacia_otra_seccion()'],
        reanudar='solicitar_la_apertura_del_documento'),
    4: dict(cortar='renderizar_el_contenido_segun_su_tipo', lineas=[
        '! Falla del renderizador embebido',
        'V --> A: emitir_el_codigo_de_error_de_carga()',
        'A -> V: recargar_la_vista_del_documento()'],
        reanudar='renderizar_el_contenido_segun_su_tipo'),
  })

if __name__ == '__main__':
    chrome = chrome_path()
    salida = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'salida')
    total = 0
    for cu in [CU31, CU33, CU34, CU35]:
        ruta, n = generar_cu(cu, os.path.join(salida, cu['id']), chrome=chrome, png=True)
        total += n; print(f"{cu['id']}: {n} paginas")
    print('total paginas', total)
