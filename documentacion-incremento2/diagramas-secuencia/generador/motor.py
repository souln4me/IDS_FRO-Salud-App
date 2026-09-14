# Motor de diagramas de secuencia FRO Salud (estilo Incremento 1).
# Entrada: definición de un CU (participantes, flujo principal, excepciones, actores).
# Salida: un .drawio multipágina por CU y un SVG/PNG por página.
import html, re, os, subprocess, glob, tempfile, shutil

PASO = 50          # separación vertical entre mensajes
ALTO_SELF = 30     # altura del bucle de auto-llamada
Y0 = 150           # y del primer mensaje
Y_LIFELINE = 40
ANCHO_ACTOR = 35
X_ACTOR = 30
X_PRIMERA_VISTA = 470
GAP = 100
FILL_LL = "#f5f5f5"; STROKE_LL = "#666666"

def ancho_participante(p):
    if p["tipo"] == "actor": return ANCHO_ACTOR
    return max(150, 8 * len(p["nombre"]) + 40)

ACTOR_ID = '__actor__'
VISTA_ID = '__vista__'
RE_MSG = re.compile(r'^\s*(\S+)\s*(->>|-->|->)\s*(\S+)\s*:\s*(.*)$')

def parsear(lineas, actor, vista=None):
    """Convierte líneas DSL en mensajes. Sintaxis:
       A -> V: texto      llamada (continua)
       V --> A: texto     retorno (punteada)
       V ->> V: texto     auto-llamada
       ! texto            nota amarilla (se ancla al siguiente mensaje)
       'A' se sustituye por el nombre del actor de la página."""
    msgs, nota = [], None
    for ln in lineas:
        ln = ln.strip()
        if not ln: continue
        if ln.startswith('!'):
            nota = ln[1:].strip(); continue
        m = RE_MSG.match(ln)
        if not m: raise ValueError('línea inválida: ' + ln)
        de, op, a, texto = m.groups()
        mapa = {'V': VISTA_ID} if isinstance(vista, str) else {k: f'__vista_{k}__' for k in (vista or {})}
        de = ACTOR_ID if de == 'A' else mapa.get(de, de)
        a = ACTOR_ID if a == 'A' else mapa.get(a, a)
        tipo = {'->': 'call', '-->': 'ret', '->>': 'self'}[op]
        msgs.append({'de': de, 'a': a, 'texto': texto.replace('{A_MAY}', actor.upper()).replace('{A}', actor), 'tipo': tipo, 'nota': nota})
        nota = None
    return msgs

def construir_pagina(nombre_pagina, participantes, msgs, actor, vista=None):
    """Calcula layout y devuelve (celdas_drawio, svg)."""
    parts = [dict(p) for p in participantes]
    if parts[0]['tipo'] == 'actor':
        parts[0] = {'id': ACTOR_ID, 'nombre': actor, 'tipo': 'actor'}
    if isinstance(vista, str):
        parts[1] = {'id': VISTA_ID, 'nombre': vista, 'tipo': 'vista'}
    elif vista:
        for i, p in enumerate(parts):
            if p['id'] in vista:
                parts[i] = {'id': f"__vista_{p['id']}__", 'nombre': vista[p['id']], 'tipo': 'vista'}
    ids = [p['id'] for p in parts]
    # Regla del equipo: si una tabla o componente aparece en alguna pagina del
    # CU, aparece en TODAS, aunque en esa pagina no reciba mensajes.
    # posiciones x
    x = X_ACTOR
    for i, p in enumerate(parts):
        p['w'] = ancho_participante(p)
        if i == 0: p['x'] = X_ACTOR
        elif i == 1: p['x'] = X_PRIMERA_VISTA
        else: p['x'] = parts[i-1]['x'] + parts[i-1]['w'] + GAP
        p['cx'] = p['x'] + p['w'] / 2
    pos = {p['id']: p for p in parts}
    # y de cada mensaje
    y = Y0
    for m in msgs:
        if m['nota']: y += 70
        m['y'] = y
        y += (PASO + ALTO_SELF) if m['tipo'] == 'self' else PASO
    y_fin = y + 30
    alto_ll = y_fin - Y_LIFELINE + 60
    # activaciones (intervalos por participante)
    barras = {p['id']: [] for p in parts}
    abiertas = {}
    def abrir(pid, yy):
        if pid not in abiertas: abiertas[pid] = yy
    def cerrar(pid, yy):
        if pid in abiertas:
            barras[pid].append([abiertas.pop(pid), yy])
    for m in msgs:
        yy = m['y']
        if m['tipo'] == 'call':
            abrir(m['de'], yy); abrir(m['a'], yy)
        elif m['tipo'] == 'self':
            abrir(m['de'], yy)
        elif m['tipo'] == 'ret':
            abrir(m['de'], yy)
            cerrar(m['de'], yy + 5)
            abrir(m['a'], yy)
    for pid in list(abiertas): cerrar(pid, y_fin - 20)
    # actor: una sola barra de principio a fin
    barras[ACTOR_ID] = [[msgs[0]['y'], y_fin - 20]] if msgs else []
    # asignar barra a cada mensaje
    def barra_en(pid, yy):
        for k, (a, b) in enumerate(barras[pid]):
            if a - 1 <= yy <= b + 1: return k
        return None
    # ── drawio ──
    celdas = []; nid = [0]
    def nuevo(): nid[0] += 1; return f"c{nid[0]}"
    id_ll, id_barra = {}, {}
    for p in parts:
        lid = nuevo(); id_ll[p['id']] = lid
        if p['tipo'] == 'actor':
            estilo = "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;dropTarget=0;collapsible=0;recursiveResize=0;outlineConnect=0;portConstraint=eastwest;newEdgeStyle={&quot;edgeStyle&quot;:&quot;elbowEdgeStyle&quot;,&quot;elbow&quot;:&quot;vertical&quot;,&quot;curved&quot;:0,&quot;rounded&quot;:0};participant=umlActor;"
        else:
            estilo = "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;dropTarget=0;collapsible=0;recursiveResize=0;outlineConnect=0;portConstraint=eastwest;newEdgeStyle={&quot;edgeStyle&quot;:&quot;elbowEdgeStyle&quot;,&quot;elbow&quot;:&quot;vertical&quot;,&quot;curved&quot;:0,&quot;rounded&quot;:0};"
        celdas.append(f'<mxCell id="{lid}" value="{html.escape(p["nombre"])}" style="{estilo}" vertex="1" parent="1"><mxGeometry x="{p["x"]}" y="{Y_LIFELINE}" width="{p["w"]}" height="{alto_ll:.0f}" as="geometry"/></mxCell>')
        for k, (a, b) in enumerate(barras[p['id']]):
            bid = nuevo(); id_barra[(p['id'], k)] = bid
            bx = (p['w'] - 10) / 2
            celdas.append(f'<mxCell id="{bid}" value="" style="html=1;points=[];perimeter=orthogonalPerimeter;outlineConnect=0;targetShapes=umlLifeline;portConstraint=eastwest;newEdgeStyle={{&quot;edgeStyle&quot;:&quot;elbowEdgeStyle&quot;,&quot;elbow&quot;:&quot;vertical&quot;,&quot;curved&quot;:0,&quot;rounded&quot;:0}};" vertex="1" parent="{lid}"><mxGeometry x="{bx}" y="{a - Y_LIFELINE:.0f}" width="10" height="{b - a:.0f}" as="geometry"/></mxCell>')
    for m in msgs:
        de, a, yy = pos[m['de']], pos[m['a']], m['y']
        if m['nota']:
            nw = max(268, 7 * len(m['nota']) + 30)
            # la nota se centra en la vista (segundo participante)
            nx = parts[1]['cx'] - nw / 2
            celdas.append(f'<mxCell id="{nuevo()}" value="{html.escape(m["nota"])}" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#ffff88;strokeColor=#9E916F;fontColor=light-dark(#333333,#cccccc);" vertex="1" parent="1"><mxGeometry x="{nx:.0f}" y="{yy - 62}" width="{nw:.0f}" height="49" as="geometry"/></mxCell>')
        src = id_barra.get((m['de'], barra_en(m['de'], yy))) or id_ll[m['de']]
        tgt = id_barra.get((m['a'], barra_en(m['a'], yy))) or id_ll[m['a']]
        if m['tipo'] == 'self':
            sx = de['cx'] + 55
            estilo = "html=1;curved=1;endArrow=block;rounded=0;verticalAlign=bottom;"
            pts = f'<Array as="points"><mxPoint x="{sx:.0f}" y="{yy}"/><mxPoint x="{sx:.0f}" y="{yy + ALTO_SELF}"/></Array>'
        else:
            dashed = "dashed=1;dashPattern=2 3;" if m['tipo'] == 'ret' else ""
            estilo = f"html=1;verticalAlign=bottom;edgeStyle=elbowEdgeStyle;elbow=vertical;curved=0;rounded=0;endArrow=block;{dashed}"
            mid = (de['cx'] + a['cx']) / 2
            pts = f'<Array as="points"><mxPoint x="{mid:.0f}" y="{yy}"/></Array>'
        celdas.append(f'<mxCell id="{nuevo()}" value="{html.escape(m["texto"])}" style="{estilo}" edge="1" parent="1" source="{src}" target="{tgt}"><mxGeometry relative="1" as="geometry">{pts}</mxGeometry></mxCell>')
    ancho = parts[-1]['x'] + parts[-1]['w'] + 60
    alto = Y_LIFELINE + alto_ll + 40
    # ── SVG ──
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{ancho:.0f}" height="{alto:.0f}" viewBox="0 0 {ancho:.0f} {alto:.0f}" font-family="Helvetica, Arial, sans-serif" font-size="12">',
         '<rect width="100%" height="100%" fill="white"/>',
         '<defs><marker id="flecha" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,4 L0,8 z" fill="#000"/></marker></defs>']
    for p in parts:
        cx = p['cx']
        if p['tipo'] == 'actor':
            s.append(f'<g stroke="#000" fill="none" stroke-width="1.2"><circle cx="{cx}" cy="{Y_LIFELINE+8}" r="7"/><line x1="{cx}" y1="{Y_LIFELINE+15}" x2="{cx}" y2="{Y_LIFELINE+38}"/><line x1="{cx-14}" y1="{Y_LIFELINE+22}" x2="{cx+14}" y2="{Y_LIFELINE+22}"/><line x1="{cx}" y1="{Y_LIFELINE+38}" x2="{cx-12}" y2="{Y_LIFELINE+58}"/><line x1="{cx}" y1="{Y_LIFELINE+38}" x2="{cx+12}" y2="{Y_LIFELINE+58}"/></g>')
            s.append(f'<text x="{cx}" y="{Y_LIFELINE-6}" text-anchor="middle">{html.escape(p["nombre"])}</text>')
            s.append(f'<line x1="{cx}" y1="{Y_LIFELINE+60}" x2="{cx}" y2="{Y_LIFELINE+alto_ll:.0f}" stroke="#666" stroke-dasharray="6,4"/>')
        else:
            s.append(f'<rect x="{p["x"]}" y="{Y_LIFELINE}" width="{p["w"]}" height="60" fill="{FILL_LL}" stroke="{STROKE_LL}"/>')
            s.append(f'<text x="{cx}" y="{Y_LIFELINE+35}" text-anchor="middle">{html.escape(p["nombre"])}</text>')
            s.append(f'<line x1="{cx}" y1="{Y_LIFELINE+60}" x2="{cx}" y2="{Y_LIFELINE+alto_ll:.0f}" stroke="#666" stroke-dasharray="6,4"/>')
        for a, b in barras[p['id']]:
            s.append(f'<rect x="{cx-5}" y="{a}" width="10" height="{b-a}" fill="{FILL_LL}" stroke="{STROKE_LL}"/>')
    for m in msgs:
        de, a, yy = pos[m['de']], pos[m['a']], m['y']
        if m['nota']:
            nw = max(268, 7 * len(m['nota']) + 30); nx = parts[1]['cx'] - nw / 2
            s.append(f'<rect x="{nx:.0f}" y="{yy-62}" width="{nw:.0f}" height="49" fill="#ffff88" stroke="#9E916F"/><text x="{nx+nw/2:.0f}" y="{yy-33}" text-anchor="middle" fill="#333">{html.escape(m["nota"])}</text>')
        if m['tipo'] == 'self':
            x1 = de['cx'] + 5
            s.append(f'<path d="M{x1},{yy} C{x1+60},{yy-10} {x1+60},{yy+ALTO_SELF+10} {x1},{yy+ALTO_SELF}" fill="none" stroke="#000" marker-end="url(#flecha)"/>')
            s.append(f'<text x="{x1+6}" y="{yy-5}" text-anchor="start">{html.escape(m["texto"])}</text>')
        else:
            x1 = de['cx'] + (5 if a['cx'] > de['cx'] else -5); x2 = a['cx'] - (5 if a['cx'] > de['cx'] else -5)
            dash = ' stroke-dasharray="3,3"' if m['tipo'] == 'ret' else ''
            s.append(f'<line x1="{x1}" y1="{yy}" x2="{x2}" y2="{yy}" stroke="#000"{dash} marker-end="url(#flecha)"/>')
            s.append(f'<text x="{(x1+x2)/2:.0f}" y="{yy-5}" text-anchor="middle">{html.escape(m["texto"])}</text>')
    s.append('</svg>')
    return celdas, "\n".join(s), (ancho, alto)

NIVEL = {'actor': 0, 'vista': 1, 'api': 2, 'controlador': 2.5, 'dao': 3, 'motor_sql': 4, 'externo': 2.6, 'tabla': 5}

def nivel_de(part):
    if part['tipo'] == 'actor': return NIVEL['actor']
    if part['tipo'] == 'vista': return NIVEL['vista']
    if part['tipo'] == 'tabla': return NIVEL['tabla']
    if part['tipo'] == 'externo': return NIVEL['externo']
    nombre = part['nombre']
    if nombre == 'C_API_REST': return NIVEL['api']
    if nombre == 'C_Capa_de_Acceso_a_Datos': return NIVEL['dao']
    if nombre == 'C_MYSQL': return NIVEL['motor_sql']
    return NIVEL['controlador']

def validar_pagina(nombre_pagina, parts, msgs, problemas):
    """Reglas del equipo: orden de lifelines, sin saltos, y toda llamada vuelve
    por el mismo camino (disciplina de pila, como en CU20/CU40)."""
    pos = {p['id']: nivel_de(p) for p in parts}
    niveles = [nivel_de(p) for p in parts]
    if niveles != sorted(niveles):
        problemas.append(f"{nombre_pagina}: orden de lifelines incorrecto (actor, vistas, controladores, capa de datos, MySQL, tablas)")
    pila = []
    for m in msgs:
        de, a = m['de'], m['a']
        if de not in pos or a not in pos:
            problemas.append(f"{nombre_pagina}: participante no declarado ({de} -> {a})"); continue
        if de == a: continue
        na, nb = pos[de], pos[a]
        nombres = {p['id']: p['nombre'] for p in parts}
        if NIVEL['externo'] in (na, nb):
            otro = nombres[de] if nb == NIVEL['externo'] else nombres[a]
            if otro != 'C_API_Adapter':
                problemas.append(f"{nombre_pagina}: {de} -> {a} no pasa por C_API_Adapter")
        elif abs(na - nb) > 1.01:
            problemas.append(f"{nombre_pagina}: salto de {de} a {a} · \"{m['texto'][:45]}\"")
        if m['tipo'] == 'call':
            pila.append((de, a))
        elif m['tipo'] == 'ret':
            if pila and pila[-1] == (a, de):
                pila.pop()
            else:
                esperado = f"{pila[-1][1]} --> {pila[-1][0]}" if pila else "ninguno (pila vacia)"
                problemas.append(f"{nombre_pagina}: retorno {de} --> {a} \"{m['texto'][:40]}\" no responde a la ultima llamada; se esperaba {esperado}")
    if pila:
        problemas.append(f"{nombre_pagina}: quedan llamadas sin retorno: " + ", ".join(f"{x} -> {y}" for x, y in pila))

def generar_cu(cu, carpeta, chrome=None, png=True):
    """cu: dict(id, nombre, actores:[...], participantes:[...], principal:[líneas], excepciones:{n: dict(cortar, lineas, reanudar)})"""
    os.makedirs(carpeta, exist_ok=True)
    paginas = []   # (nombre_pagina, nombre_archivo, msgs, actor)
    multi = len(cu['actores']) > 1
    for actor in cu['actores']:
        suf = f" {actor}" if multi else ""
        vista = cu.get('vistas', {}).get(actor)
        principal = parsear(cu['principal'], actor, vista)
        paginas.append((f"{cu['id']} - Principal{suf}", f"{cu['id']}-Principal{suf}", principal, actor, vista))
        for n, ex in sorted(cu['excepciones'].items()):
            base = parsear(cu['principal'], actor, vista)
            def indice(ref, desde_fin=False):
                if isinstance(ref, int): return ref
                for k, m in enumerate(base):
                    if m['texto'].startswith(ref): return k + 1 if desde_fin else k
                raise ValueError(f"{cu['id']} exc {n}: no encuentro '{ref}'")
            msgs = [dict(m) for m in base[:indice(ex['cortar'], True)]] + parsear(ex['lineas'], actor, vista)
            if ex.get('reanudar') is not None:
                msgs += [dict(m) for m in base[indice(ex['reanudar']):]]
            paginas.append((f"{cu['id']} - Excepción {n}{suf}", f"{cu['id']}-Excepción {n}{suf}", msgs, actor, vista))
    diagramas = []
    problemas = []
    for nombre_pag, archivo, msgs, actor, vista in paginas:
        celdas, svg, (w, h) = construir_pagina(nombre_pag, cu['participantes'], msgs, actor, vista)
        parts = [dict(p) for p in cu['participantes']]
        if parts[0]['tipo'] == 'actor':
            parts[0] = {'id': '__actor__', 'nombre': actor, 'tipo': 'actor'}
        if isinstance(vista, str): parts[1] = {'id': VISTA_ID, 'nombre': vista, 'tipo': 'vista'}
        elif vista:
            for i, p in enumerate(parts):
                if p['id'] in vista: parts[i] = {'id': f"__vista_{p['id']}__", 'nombre': vista[p['id']], 'tipo': 'vista'}
        validar_pagina(nombre_pag, parts, msgs, problemas)
        diagramas.append(f'<diagram name="{html.escape(nombre_pag)}" id="{re.sub(r"[^A-Za-z0-9]", "_", nombre_pag)}"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{w:.0f}" pageHeight="{h:.0f}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>{"".join(celdas)}</root></mxGraphModel></diagram>')
        ruta_svg = os.path.join(carpeta, archivo + ".svg")
        open(ruta_svg, "w").write(svg)
        if png and chrome:
            ruta_html = ruta_svg[:-4] + ".html"
            open(ruta_html, "w").write(f'<html><body style="margin:0">{svg}</body></html>')
            # Perfil temporal propio por captura: sin esto Chrome reutiliza una
            # instancia viva y devuelve imagenes repetidas o en blanco.
            perfil = tempfile.mkdtemp(prefix="chrome-captura-")
            subprocess.run([chrome, "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                            f"--user-data-dir={perfil}", "--virtual-time-budget=4000", "--run-all-compositor-stages-before-draw",
                            f"--window-size={w:.0f},{h:.0f}", f"--screenshot={ruta_svg[:-4]}.png", f"file://{ruta_html}"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            shutil.rmtree(perfil, ignore_errors=True)
            os.remove(ruta_html); os.remove(ruta_svg)
    if problemas:
        raise ValueError(f"{cu['id']}: reglas de notacion incumplidas\n  - " + "\n  - ".join(dict.fromkeys(problemas)))
    ruta_drawio = os.path.join(carpeta, f"{cu['id']}.drawio")
    open(ruta_drawio, "w").write('<mxfile host="app.diagrams.net">' + "".join(diagramas) + '</mxfile>')
    return ruta_drawio, len(paginas)

def chrome_path():
    c = glob.glob(os.path.expanduser("~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-*/chrome-headless-shell"))
    return c[0] if c else None
