# -*- coding: utf-8 -*-
"""Genera Auditoria Grok.pdf en el Escritorio."""
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
    HRFlowable,
)

OUT = Path(r"C:\Users\ilaan\Escritorio\Auditoria Grok.pdf")
PAGE_W, PAGE_H = A4

NAVY = HexColor("#0f3d4c")
TEAL = HexColor("#1a6b7a")
LIGHT = HexColor("#f4f7f8")
MUTED = HexColor("#5a6a70")
CRITICAL = HexColor("#b42318")
HIGH = HexColor("#b54708")
MED = HexColor("#175cd3")
LOW = HexColor("#027a48")
BORDER = HexColor("#d0d7db")
OK = HexColor("#067647")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverTitle", fontName="Helvetica-Bold", fontSize=28,
    textColor=white, alignment=TA_LEFT, spaceAfter=8, leading=34,
))
styles.add(ParagraphStyle(
    name="CoverSub", fontName="Helvetica", fontSize=11,
    textColor=HexColor("#c5dce3"), alignment=TA_LEFT, leading=15, spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="H1Doc", fontName="Helvetica-Bold", fontSize=15,
    textColor=NAVY, spaceBefore=14, spaceAfter=7, leading=19,
))
styles.add(ParagraphStyle(
    name="H2Doc", fontName="Helvetica-Bold", fontSize=12,
    textColor=TEAL, spaceBefore=11, spaceAfter=5, leading=15,
))
styles.add(ParagraphStyle(
    name="H3Doc", fontName="Helvetica-Bold", fontSize=10.5,
    textColor=NAVY, spaceBefore=7, spaceAfter=3, leading=13,
))
styles.add(ParagraphStyle(
    name="BodyDoc", fontName="Helvetica", fontSize=9.3,
    textColor=HexColor("#111111"), alignment=TA_JUSTIFY, leading=13, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="BulletDoc", fontName="Helvetica", fontSize=9.3,
    textColor=HexColor("#111111"), leading=12.5, leftIndent=10, spaceAfter=2,
))
styles.add(ParagraphStyle(
    name="TableCell", fontName="Helvetica", fontSize=8.2,
    textColor=HexColor("#111111"), leading=10.5,
))
styles.add(ParagraphStyle(
    name="TableHead", fontName="Helvetica-Bold", fontSize=8.2,
    textColor=white, leading=10.5,
))
styles.add(ParagraphStyle(
    name="FindingTitle", fontName="Helvetica-Bold", fontSize=9.5,
    textColor=NAVY, leading=12, spaceAfter=1,
))
styles.add(ParagraphStyle(
    name="ScoreBig", fontName="Helvetica-Bold", fontSize=16,
    textColor=NAVY, alignment=TA_CENTER, leading=20,
))
styles.add(ParagraphStyle(
    name="ScoreLabel", fontName="Helvetica", fontSize=7.5,
    textColor=MUTED, alignment=TA_CENTER, leading=9,
))
styles.add(ParagraphStyle(
    name="Small", fontName="Helvetica", fontSize=8.2,
    textColor=MUTED, leading=11,
))
styles.add(ParagraphStyle(
    name="Meta", fontName="Helvetica", fontSize=9,
    textColor=MUTED, leading=12,
))


def p(text, style="BodyDoc"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"• {text}", styles["BulletDoc"])


def h1(text):
    return Paragraph(text, styles["H1Doc"])


def h2(text):
    return Paragraph(text, styles["H2Doc"])


def h3(text):
    return Paragraph(text, styles["H3Doc"])


def hr():
    return HRFlowable(width="100%", thickness=0.6, color=BORDER, spaceBefore=4, spaceAfter=8)


def severity_badge(level):
    return {
        "CRÍTICO": CRITICAL,
        "ALTO": HIGH,
        "MEDIO": MED,
        "BAJO": LOW,
        "INFO": TEAL,
        "FORTALEZA": OK,
    }.get(level, MUTED)


def make_table(headers, rows, col_widths):
    head = [Paragraph(h, styles["TableHead"]) for h in headers]
    body = [[Paragraph(str(c), styles["TableCell"]) for c in row] for row in rows]
    t = Table([head] + body, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def score_card(items):
    rows = []
    for i in range(0, len(items), 4):
        chunk = items[i:i + 4]
        row_cells = []
        for label, score in chunk:
            color = OK if score >= 8 else (MED if score >= 6 else (HIGH if score >= 4 else CRITICAL))
            hex_c = color.hexval()[2:]
            inner = Table([
                [Paragraph(f"<font color='#{hex_c}'><b>{score}/10</b></font>", styles["ScoreBig"])],
                [Paragraph(label, styles["ScoreLabel"])],
            ], colWidths=[4 * cm])
            inner.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ]))
            row_cells.append(inner)
        while len(row_cells) < 4:
            row_cells.append("")
        rows.append(row_cells)
    t = Table(rows, colWidths=[4.2 * cm] * 4)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t


def finding(sev, title, body, rec=None):
    color = severity_badge(sev)
    header = Table([
        [
            Paragraph(f"<font color='white'><b>{sev}</b></font>", styles["TableHead"]),
            Paragraph(f"<b>{title}</b>", styles["FindingTitle"]),
        ]
    ], colWidths=[2.2 * cm, 14.3 * cm])
    header.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), color),
        ("BACKGROUND", (1, 0), (1, 0), LIGHT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BOX", (0, 0), (-1, -1), 0.4, color),
    ]))
    parts = [header, Spacer(1, 2), p(body)]
    if rec:
        parts.append(p(f"<b>Recomendación:</b> {rec}"))
    parts.append(Spacer(1, 5))
    return KeepTogether(parts)


def on_page(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.4)
        canvas.line(1.8 * cm, PAGE_H - 1.3 * cm, PAGE_W - 1.8 * cm, PAGE_H - 1.3 * cm)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(1.8 * cm, PAGE_H - 1.1 * cm, "Auditoría Grok · Ilara Finanzas 3.2.0")
        canvas.drawRightString(PAGE_W - 1.8 * cm, PAGE_H - 1.1 * cm, "Confidencial · Uso interno")
        canvas.line(1.8 * cm, 1.4 * cm, PAGE_W - 1.8 * cm, 1.4 * cm)
        canvas.drawCentredString(PAGE_W / 2, 0.9 * cm, f"Página {doc.page}")
    canvas.restoreState()


def build():
    story = []

    # Portada
    banner = Table([
        [Paragraph("AUDITORÍA TÉCNICA COMPLETA", styles["CoverSub"])],
        [Paragraph("Ilara Finanzas", styles["CoverTitle"])],
        [Paragraph(
            "Aplicación local de finanzas personales y del hogar<br/>"
            "Versión auditada: <b>3.2.0</b> (estable)",
            styles["CoverSub"],
        )],
        [Spacer(1, 10)],
        [Paragraph(
            "Documento: <b>Auditoria Grok</b><br/>"
            "Auditor: Grok (xAI)<br/>"
            "Fecha: 2 de agosto de 2026<br/>"
            "Workspace: Escritorio\\Finanzas personales<br/>"
            "Alcance: código, arquitectura, seguridad, calidad, release y preparación "
            "para V4 (sync en tiempo real multi-PC + web iPhone)",
            styles["CoverSub"],
        )],
    ], colWidths=[17 * cm])
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING", (0, 0), (0, 0), 24),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 20),
        ("TOPPADDING", (0, 1), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -2), 3),
    ]))
    story.append(banner)
    story.append(Spacer(1, 14))
    story.append(p(
        "<b>Clasificación:</b> auditoría de ingeniería de software. "
        "No es una auditoría contable ni de ciberseguridad certificada (ISO/PCI)."
    ))
    story.append(p(
        "Este informe evalúa el estado actual de Ilara 3.2 y su aptitud para evolucionar hacia una "
        "<b>V4 con sincronización en tiempo real</b> entre varias PCs Windows y un cliente web usable desde iPhone."
    ))
    story.append(h2("Veredicto en una frase"))
    story.append(p(
        "Ilara 3.2 es un producto local <b>maduro, confiable y bien cuidado</b> en dominio financiero y persistencia; "
        "está <b>listo para uso diario en un solo dispositivo</b>, pero <b>no está aún preparado</b> para "
        "sincronización multi-dispositivo sin un rediseño deliberado del modelo de datos, de la capa de mutaciones "
        "y de la arquitectura cliente-servidor."
    ))
    story.append(h2("Puntaje global orientativo"))
    story.append(score_card([
        ("Producto / utilidad", 9),
        ("Dominio financiero", 9),
        ("Persistencia local", 8.5),
        ("Seguridad local", 7.5),
        ("Calidad de código", 6.5),
        ("Pruebas", 6.5),
        ("Release / ops", 8.5),
        ("Listo para sync V4", 3.5),
    ]))
    story.append(Spacer(1, 6))
    story.append(p(
        "<b>Nota global estimada: 7,4 / 10</b> como app local de un dispositivo. "
        "Como base para multi-dispositivo en tiempo real: <b>4,0 / 10</b> hoy — hay cimientos útiles, "
        "pero faltan piezas estructurales de sync."
    ))
    story.append(PageBreak())

    # 1
    story.append(h1("1. Alcance y metodología"))
    story.append(h2("1.1 Qué se auditó"))
    for t in [
        "Documentación: README, CHANGELOG, PLAN_V3.1, PLAN_V3.2, CONTEXTO_HANDOFF_ILARA.",
        "Frontend: index.html, styles.css, app.js (~1780 líneas), finance-core.js, state-core.js, src/main.ts, src/storage.ts.",
        "Backend nativo: src-tauri (lib.rs, repository.rs ~980 líneas), migraciones SQL 0001–0003, tauri.conf.json, capabilities.",
        "Calidad: tests/ (20 pruebas JS), tests de repositorio Rust, scripts npm (verify, release).",
        "Artefactos: release/ (3.1 y 3.2 setup/portable + SHA256SUMS).",
        "Ejecución de la suite de tests JS: 20/20 OK (2 ago 2026).",
    ]:
        story.append(bullet(t))

    story.append(h2("1.2 Qué no se auditó en profundidad"))
    for t in [
        "Pruebas manuales exhaustivas de la UI instalada en WebView2 (se revisó código y flujos, no QA de regresión completa).",
        "Análisis dinámico de memoria, fuzzing ni pentest del instalador.",
        "Firma de código / SmartScreen en distribución pública.",
        "Auditoría contable de exactitud con datos reales del usuario.",
    ]:
        story.append(bullet(t))

    story.append(h2("1.3 Criterios de severidad"))
    story.append(make_table(
        ["Severidad", "Significado"],
        [
            ["CRÍTICO", "Pérdida de datos, corrupción financiera o bloqueo de V4 sin remediar."],
            ["ALTO", "Riesgo importante de integridad, seguridad o mantenibilidad a corto plazo."],
            ["MEDIO", "Deuda técnica o gap funcional relevante; no bloquea uso actual."],
            ["BAJO", "Mejora recomendable, hygiene o pulido."],
            ["FORTALEZA", "Práctica destacable a preservar."],
        ],
        [3.2 * cm, 13.3 * cm],
    ))

    story.append(PageBreak())
    story.append(h1("2. Resumen ejecutivo"))
    story.append(p(
        "Ilara nació como app web estática y maduró hasta una aplicación nativa Windows con Tauri 2 + SQLite. "
        "La V3.2 introduce un modelo financiero más rico (ocurrencias materializadas, importes reales, cierre de mes, "
        "presupuestos, edición de series con alcance) y un pipeline de release profesional."
    ))
    story.append(p(
        "Para un hogar que usa <b>una sola PC</b>, el producto es sólido: centavos enteros, validación estricta en Rust, "
        "transacciones SQLite, migración desde V3.1, exportación/importación JSON, CSV seguro y recuperación de emergencia."
    ))
    story.append(p(
        "El objetivo de <b>V4 — varias PCs + web en iPhone con sincronización en tiempo real</b> — cambia el problema de fondo. "
        "Hoy la app es un <b>monolito de estado en memoria</b> que reescribe un snapshot completo en SQLite. No hay cuentas de usuario, "
        "ni identidad de dispositivo, ni reloj lógico / versiones por entidad, ni soft-delete global, ni canal de eventos, "
        "ni backend. La lógica de dominio es buena; la <b>forma de mutar y persistir</b> no es aún sync-friendly."
    ))

    story.append(h2("2.1 Fortalezas principales"))
    for t in [
        "Dominio financiero bien modelado: previsto vs real, cuotas con reparto de centavos, series vs ocurrencias, meses cerrados.",
        "Persistencia transaccional con validación server-side (Rust) y pruebas de rollback.",
        "Migraciones SQL versionadas y compatibilidad con estados V1/V2/V3.1.",
        "IDs con crypto.randomUUID() para entidades nuevas.",
        "UI sin innerHTML (menor superficie XSS); CSP en Tauri; permisos mínimos (core:default).",
        "Export CSV con escape contra inyección de fórmulas.",
        "Proceso verify + release con hashes SHA-256 y versiones anteriores preservadas.",
        "Documentación de handoff y planes de versión por encima del promedio de un proyecto personal.",
    ]:
        story.append(bullet(t))

    story.append(h2("2.2 Riesgos principales (hoy)"))
    for t in [
        "app.js monolítico (~1780 líneas): UI + estado + reglas de edición de series mezclados.",
        "Escritura full-snapshot (DELETE + reinsert de casi todo) en cada guardado: costoso y hostil al sync incremental.",
        "Doble fuente de verdad: tablas normalizadas + JSON en app_state.",
        "Personas y categorías referenciadas por nombre en movimientos (no por ID estable) — frágil ante renombres y sync.",
        "Sin metadatos de sincronización: updatedAt, deletedAt, deviceId, revision, workspaceId.",
        "Estado de UI (activeView, activeMonth) mezclado con datos de dominio en el mismo snapshot.",
        "Sin autenticación ni cifrado en reposo de la DB local (aceptable localmente; insuficiente multi-dispositivo).",
        "Cobertura de tests buena en núcleo, débil en flujos de UI y en mutaciones complejas de series.",
    ]:
        story.append(bullet(t))

    story.append(PageBreak())
    story.append(h1("3. Arquitectura actual"))
    story.append(h2("3.1 Vista lógica"))
    story.append(p(
        "<b>Cliente (WebView2):</b> index.html + styles.css + app.js (orquestación) + finance-core.js (cálculos puros) + "
        "state-core.js (normalización monetaria) + storage.ts (cola de writes + invoke Tauri)."
    ))
    story.append(p(
        "<b>Shell nativo (Rust/Tauri 2):</b> tres comandos — load_app_state, save_app_state, migrate_legacy_state — "
        "y un repositorio SQLite con schema migrado en 0001/0002/0003."
    ))
    story.append(p(
        "<b>Persistencia:</b> archivo ilara.db en el directorio de configuración de la app. "
        "Cada save valida el snapshot, abre una transacción SQL, borra filas de tablas de dominio, reinserta todo, "
        "y además guarda el JSON completo en app_state."
    ))

    story.append(h2("3.2 Flujo de datos (save path)"))
    for t in [
        "Usuario actúa en UI → muta objeto state en memoria.",
        "cloneState(previous) para rollback optimista si falla el save.",
        "saveStoredState serializa writes en cola (storage.ts) para evitar carreras.",
        "invoke save_app_state → validate_snapshot → transacción SQLite full rewrite.",
        "Si SQLite falla: emergency dump a localStorage (ilara-finanzas-v3-emergency).",
    ]:
        story.append(bullet(t))
    story.append(p(
        "Este diseño es <b>correcto para un solo dispositivo</b> y prioriza integridad. "
        "Para sync en tiempo real es el anti-patrón clásico: no hay operaciones atómicas pequeñas ni log de cambios."
    ))

    story.append(h2("3.3 Inventario de componentes y tamaño"))
    story.append(make_table(
        ["Componente", "Tamaño aprox.", "Rol", "Evaluación"],
        [
            ["app.js", "73 KB / ~1781 líneas", "UI + estado + mutaciones", "Deuda alta"],
            ["finance-core.js", "10 KB / ~234 líneas", "Lógica pura financiera", "Bien"],
            ["state-core.js", "1.6 KB", "Centavos / limpieza", "Bien"],
            ["repository.rs", "~983 líneas", "SQLite + validación", "Sólido, denso"],
            ["index.html", "~418 líneas", "Estructura vistas", "Aceptable"],
            ["styles.css", "~736 líneas", "UI responsive", "Aceptable"],
            ["storage.ts", "~40 líneas", "Puente Tauri", "Bien"],
            ["Tests JS", "20 casos", "Dominio + state", "Bueno núcleo"],
            ["Tests Rust", "5 casos", "Repo / rollback", "Necesita más"],
        ],
        [3.5 * cm, 3.5 * cm, 4.5 * cm, 5 * cm],
    ))

    story.append(PageBreak())
    story.append(h1("4. Modelo de datos y dominio financiero"))
    story.append(h2("4.1 Entidades actuales"))
    story.append(make_table(
        ["Entidad", "Clave", "Notas de auditoría"],
        [
            ["settings", "singleton", "currency/locale fijos ARS/es-AR en validación Rust"],
            ["people", "id UUID", "movimientos guardan person como nombre, no id"],
            ["transactions (series)", "id UUID", "createdAt sí; sin updatedAt/deletedAt"],
            ["occurrence_records", "txId+month", "materializadas; snapshot histórico rico"],
            ["occurrence_status", "legacy", "tabla residual V3.1; se migra a occurrences"],
            ["closed_months", "monthKey", "cierre con closedAt"],
            ["budgets", "id + unique mes/cat", "por categoría y mes"],
            ["categories", "name", "sin id estable"],
            ["app_state", "JSON full", "copia de recuperación / dual write"],
            ["migration_backups", "histórico", "backup de migración"],
        ],
        [3.8 * cm, 3 * cm, 9.7 * cm],
    ))

    story.append(h2("4.2 Fortalezas del dominio"))
    story.append(finding(
        "FORTALEZA", "Dinero en centavos enteros",
        "toCents/fromCents y amount_cents en SQL evitan errores clásicos de float. "
        "Las cuotas reparten el resto de centavos de forma determinística (probado).",
    ))
    story.append(finding(
        "FORTALEZA", "Separación serie vs ocurrencia",
        "El modelo V3.2 materializa meses y permite importe real distinto del previsto, estados pending/paid/skipped "
        "y preservación de historia aunque se borre la serie. Es la decisión más valiosa de cara a V4.",
    ))
    story.append(finding(
        "FORTALEZA", "Edición con alcance",
        "current / future / all con materialización de meses protegidos (pagados o cerrados) demuestra comprensión "
        "real del problema de recurrencias contables.",
    ))

    story.append(h2("4.3 Hallazgos del modelo"))
    story.append(finding(
        "ALTO", "Referencias por nombre (person, category)",
        "Los movimientos almacenan person y category como texto libre, no como foreign keys a IDs. "
        "Renombrar una persona o categoría no actualiza de forma relacional; en sync multi-dispositivo dos renombres "
        "concurrentes generan conflictos difíciles y duplicados semánticos.",
        "Introducir personId y categoryId (UUID). Mantener denormalización de nombre solo en occurrence_records históricos materializados.",
    ))
    story.append(finding(
        "ALTO", "Ausencia de metadatos de sincronización",
        "No existen updatedAt, deletedAt, createdByDevice, revision/version, workspaceId ni tombstones. "
        "Sin esto no hay merge confiable ni sync incremental.",
        "Definir un envelope común en todas las entidades de dominio antes de construir el backend V4.",
    ))
    story.append(finding(
        "MEDIO", "UI state dentro del snapshot de dominio",
        "activeView y activeMonth se persisten junto con transacciones y presupuestos. "
        "En multi-dispositivo, la vista del iPhone no debería pisar la de la PC.",
        "Separar AppPreferences locales de HouseholdFinanceState sincronizable.",
    ))
    story.append(finding(
        "MEDIO", "Doble escritura JSON + tablas",
        "Cada save reescribe tablas normalizadas y el blob app_state. Aumenta robustez de recuperación pero "
        "duplica fuente de verdad y costo de I/O.",
        "Elegir tablas normalizadas como source of truth; el JSON solo para export/backup puntual.",
    ))
    story.append(finding(
        "BAJO", "Validación GLOB de month_key en SQL imperfecta",
        "El patrón [0-9][0-9][0-9][0-9]-[0-1][0-9] admite 00 y 19. La validación real está en Rust/JS, "
        "así que el riesgo práctico es bajo.",
        "Alinear triggers SQL con is_valid_month de Rust o documentar que la autoridad es la app.",
    ))
    story.append(finding(
        "BAJO", "Moneda y locale hardcodeados",
        "validate_snapshot exige currency == ARS y locale == es-AR. Correcto para el producto actual; "
        "bloquea expansión y complica tests multi-región.",
        "Parametrizar cuando haya plan real de multimoneda; no antes.",
    ))

    story.append(PageBreak())
    story.append(h1("5. Seguridad"))
    story.append(h2("5.1 Postura actual (app local de un usuario)"))
    story.append(p(
        "El modelo de amenaza de 3.2 es: un usuario de confianza en su PC, sin red. En ese contexto la postura es razonable. "
        "Para V4 el modelo de amenaza cambia a: red, cuentas, dispositivos robados, ataques al backend y a la web móvil."
    ))

    story.append(h2("5.2 Controles observados"))
    story.append(make_table(
        ["Control", "Estado", "Comentario"],
        [
            ["CSP Tauri", "Presente", "default-src self; script-src self; style-src self unsafe-inline"],
            ["Permisos Tauri", "Mínimos", "core:default únicamente — bien"],
            ["XSS vía innerHTML", "No detectado", "UI construida con createElement/textContent"],
            ["SQL injection", "Mitigado", "rusqlite con params"],
            ["Validación de snapshot", "Fuerte", "Rust rechaza estados inválidos"],
            ["Límite import JSON", "5 MB", "Razonable"],
            ["CSV formula injection", "Mitigado", "Prefijo de seguridad en celdas de riesgo"],
            ["Cifrado en reposo DB", "No", "ilara.db en claro en disco del usuario"],
            ["Auth / multi-user", "No", "Fuera de alcance 3.2"],
            ["Code signing instalador", "No", "SmartScreen en otras PCs"],
            ["Secretos en repo", "N/A", "Sin backend; .env ignorado"],
        ],
        [4 * cm, 2.5 * cm, 10 * cm],
    ))

    story.append(h2("5.3 Hallazgos de seguridad"))
    story.append(finding(
        "MEDIO", "Base SQLite sin cifrado",
        "Cualquier proceso con acceso a la cuenta de Windows puede copiar ilara.db y leer finanzas del hogar.",
        "Para 3.x: opcional PIN/passphrase con SQLCipher o cifrado de archivo. "
        "Para V4: cifrado en tránsito (TLS) y en reposo en servidor; secretos por usuario.",
    ))
    story.append(finding(
        "MEDIO", "Instalador sin firma digital",
        "Windows SmartScreen puede alertar al instalar en otra máquina. No es un bug de la app, "
        "pero limita distribución confiable.",
        "Certificado de code signing si se reparte fuera del entorno personal.",
    ))
    story.append(finding(
        "BAJO", "style-src 'unsafe-inline' en CSP",
        "Común en apps con estilos inline; reduce la dureza de la CSP.",
        "Migrar a CSS externo y hashes/nonces si se endurece la superficie web en V4.",
    ))
    story.append(finding(
        "INFO", "localStorage de emergencia",
        "Si SQLite falla, el estado se vuelca a localStorage del WebView. Es un buen fallback local, "
        "pero no es un canal de sync ni un backup durable multi-dispositivo.",
        "Mantenerlo; no usarlo como puente entre PCs.",
    ))
    story.append(finding(
        "FORTALEZA", "Superficie de ataque reducida",
        "Sin red, sin eval, sin HTML inyectado, permisos Tauri mínimos y validación server-side del snapshot. "
        "Excelente baseline local.",
    ))

    story.append(PageBreak())
    story.append(h1("6. Calidad de código y mantenibilidad"))
    story.append(h2("6.1 Hallazgos"))
    story.append(finding(
        "ALTO", "Monolito app.js",
        "Un único módulo concentra render de 4 vistas, diálogos, import/export, normalización, materialización "
        "de series, event binding e inicialización. Cualquier feature nueva aumenta el riesgo de regresión.",
        "Partir en módulos por responsabilidad (state, domain mutations, views, dialogs, import-export) sin reescribir el producto.",
    ))
    story.append(finding(
        "ALTO", "Migración TypeScript incompleta",
        "Solo main.ts y storage.ts están tipados. El dominio financiero y el estado viven en JS sin contratos "
        "compartidos con los structs Rust (AppSnapshot, etc.).",
        "Definir tipos TS del snapshot alineados con serde/Rust y migrar finance-core + mutaciones primero.",
    ))
    story.append(finding(
        "MEDIO", "Acoplamiento DOM al cargar el módulo",
        "const dom = { querySelector... } se resuelve al import. Fragilidad si el orden de scripts o el HTML cambia; "
        "dificulta testing headless.",
        "Inicializar selectores dentro de initializeApp() o inyectar un root.",
    ))
    story.append(finding(
        "MEDIO", "Lógica de negocio de series dentro de la UI",
        "saveMovement/deleteMovement implementan reglas contables complejas (materializeSeriesThrough, "
        "preserveProtectedOccurrences) mezcladas con formularios.",
        "Extraer un servicio de mutaciones de dominio puro, testeable sin DOM.",
    ))
    story.append(finding(
        "BAJO", "Mensajes y locale embebidos",
        "Copy en español hardcodeado. Correcto hoy; si hay web i18n en V4, convendrá externalizar strings.",
        "No prioritario hasta multi-idioma real.",
    ))
    story.append(finding(
        "FORTALEZA", "finance-core y state-core desacoplados",
        "Cálculos puros con tests. Es el núcleo a preservar y expandir; idealmente debería ser el mismo paquete "
        "compartido entre desktop y web V4.",
    ))

    story.append(h2("6.2 Estilo y consistencia"))
    for t in [
        "Nombres en español en UI y muchos tests: coherente con el producto.",
        "camelCase en JSON/JS y snake_case en Rust con serde rename: correcto.",
        "Versionado coordinado package.json / Cargo.toml / tauri.conf / APP_VERSION: disciplina buena.",
        "Git con commits claros de V3.2; .gitignore adecuado (node_modules, target, dist, release exe).",
    ]:
        story.append(bullet(t))

    story.append(PageBreak())
    story.append(h1("7. Persistencia, rendimiento y confiabilidad"))
    story.append(finding(
        "FORTALEZA", "Transacciones y rollback",
        "save_snapshot valida, escribe en transacción y tiene test de rollback si falla la escritura. "
        "No se comunica éxito sin confirmar disco. Patrón ejemplar.",
    ))
    story.append(finding(
        "FORTALEZA", "Cola de writes en el cliente",
        "serializeWrite en storage.ts evita solapamiento de saves concurrentes desde la UI. Buen detalle.",
    ))
    story.append(finding(
        "ALTO", "Full rewrite en cada guardado",
        "Cada cambio (incluso marcar un pago) borra e inserta people, transactions, occurrences, budgets, categories, etc. "
        "Con historial largo el costo crece O(N) por click y complica sync delta.",
        "Pasar a mutaciones incrementales (UPSERT/DELETE por entidad) y, para V4, a un log de operaciones o filas versionadas.",
    ))
    story.append(finding(
        "MEDIO", "Carga completa del estado al inicio",
        "load_normalized_state trae todo a memoria. Fine para un hogar; en V4 con muchos años hará falta paginación por mes.",
        "Mantener cache local por mes activo; proyectar a demanda.",
    ))
    story.append(finding(
        "MEDIO", "Busy timeout 5s",
        "pragma busy_timeout 5s es razonable en single user. En escenarios raros de lock, el usuario ve fallback de emergencia.",
        "Loggear y ofrecer 'reintentar' en UI si crece la base.",
    ))
    story.append(finding(
        "FORTALEZA", "Migración V3.1 no destructiva",
        "No borra localStorage V3.1; migra una vez; conserva migration_backups; emergency recovery. "
        "Criterio de aceptación V3.2 bien cumplido en diseño.",
    ))

    story.append(PageBreak())
    story.append(h1("8. Pruebas y calidad de release"))
    story.append(h2("8.1 Estado de pruebas (ejecutado en auditoría)"))
    story.append(p(
        "<b>npm test:</b> 20/20 pass. Cobertura conceptual: meses, cuotas, totales previsto/real, proyección, "
        "materialización huérfana, skip, vencimientos, progreso de cuotas, centavos, CSV, IDs duplicados."
    ))
    story.append(p(
        "<b>Pruebas Rust:</b> ~5 tests de repositorio (migración, rollback, etc.). El diseño del suite es el adecuado."
    ))

    story.append(h2("8.2 Gaps de testing"))
    story.append(make_table(
        ["Área", "Hoy", "Gap"],
        [
            ["finance-core", "Fuerte", "Casos borde dueDay 31 en feb; meses cerrados en proyección"],
            ["Mutaciones de series", "Implícitas en app.js", "Sin tests unitarios de scope current/future/all"],
            ["Import/export", "Parcial (fixture V3.1)", "Más fixtures corruptos / version mismatch"],
            ["UI / E2E", "Manual", "Sin Playwright/WebDriver sobre Tauri o browser"],
            ["Concurrencia writes", "Cola cliente", "Sin test de stress multi-invoke"],
            ["Sync (futuro)", "N/A", "Conflictos, offline queue, clock skew"],
        ],
        [3.5 * cm, 4 * cm, 9 * cm],
    ))

    story.append(h2("8.3 Release engineering"))
    story.append(finding(
        "FORTALEZA", "Pipeline verify + release:package",
        "verify encadena test, tsc, syntax check, build, fmt, cargo test, check, clippy. "
        "release:build produce setup, portable y SHA256SUMS sin borrar V3.1. Nivel profesional.",
    ))
    story.append(finding(
        "BAJO", "Sin CI remoto visible",
        "El pipeline existe localmente; no hay evidencia de GitHub Actions u otro CI que lo ejecute en cada push.",
        "Añadir CI Windows que corra npm run verify en cada PR.",
    ))
    story.append(finding(
        "INFO", "Versiones alpha preservadas en release/",
        "Buen hábito de recuperación. Asegurar que el repo git no suba binarios enormes si se publica remoto "
        "(gitignore ya excluye *.exe de release).",
    ))

    story.append(PageBreak())
    story.append(h1("9. UX, accesibilidad e interfaz"))
    story.append(finding(
        "FORTALEZA", "Producto orientado a hogar real",
        "Dashboard con previsto vs real, tasa de compromiso, presupuestos, vencimientos y proyección. "
        "Copy en español rioplatense natural.",
    ))
    story.append(finding(
        "FORTALEZA", "Atención a a11y básica",
        "aria-live en resúmenes, progressbar con valuemin/max/now, labels en month switcher, dialogs nativos showModal.",
    ))
    story.append(finding(
        "MEDIO", "Sin modo oscuro / personalización",
        "No es defecto; es oportunidad. En iPhone web (V4) el contraste y safe-areas ya están parcialmente pensados "
        "(viewport-fit=cover).",
        "Revisar touch targets y navegación inferior para móvil real en el cliente web V4.",
    ))
    story.append(finding(
        "BAJO", "Iconos tipográficos",
        "Simples y livianos; pueden verse inconsistentes entre fuentes del sistema.",
        "Set de iconos SVG unificado si se professionaliza la marca.",
    ))
    story.append(finding(
        "MEDIO", "Onboarding mínimo",
        "Estado default con personas Compartido/Vos/Pareja y categorías, pero sin guía de primeros 3 movimientos.",
        "Wizard de 30s mejora activación, sobre todo en web iPhone.",
    ))

    story.append(PageBreak())
    story.append(h1("10. Preparación para V4 — sync en tiempo real"))
    story.append(p(
        "El usuario aclaró el norte de V4: <b>varias PCs + web para iPhone</b>, con <b>sincronización en tiempo real</b> "
        "como pieza central. Esta sección es la más estratégica del informe."
    ))

    story.append(h2("10.1 Requisitos implícitos de V4"))
    for t in [
        "Identidad: cuenta de hogar (household) y posiblemente varios miembros con permisos.",
        "Dispositivos: Windows desktop (Tauri) y navegador móvil Safari/iOS (PWA o web responsive).",
        "Offline-first: iPhone en el subte o PC sin red deben seguir operando y reconciliar después.",
        "Tiempo real: cambios en una PC se reflejan en iPhone en segundos (WebSocket / SSE / realtime DB).",
        "Conflictos: dos personas marcan el mismo pago o editan la misma serie a la vez.",
        "Seguridad: auth, TLS, autorización por household, posiblemente E2E o cifrado server-side.",
        "Migración: usuarios 3.2 deben subir su SQLite/export sin perder historia.",
    ]:
        story.append(bullet(t))

    story.append(h2("10.2 Evaluación de readiness (hoy)"))
    story.append(make_table(
        ["Capacidad V4", "Estado 3.2", "Brecha"],
        [
            ["IDs estables (UUID)", "Parcial (sí en create)", "Asegurar en 100% entidades + categorías"],
            ["Clock / version por fila", "No", "Añadir updatedAt + revision"],
            ["Tombstones (delete sync)", "Parcial (skipped)", "deletedAt global por entidad"],
            ["Separar UI vs dominio", "No", "Partir snapshot"],
            ["Ops incrementales", "No (full snapshot)", "Command/event API"],
            ["Backend + auth", "No", "Nuevo servicio"],
            ["Canal realtime", "No", "WS/Realtime provider"],
            ["Offline queue", "No", "Outbox local"],
            ["Resolución conflictos", "No", "LWW / CRDT / reglas de dominio"],
            ["Cliente web móvil", "Retirado en 3.2", "Nuevo front compartiendo core"],
            ["Cifrado / multi-tenant", "No", "Diseño de seguridad V4"],
            ["finance-core reutilizable", "Sí (JS puro)", "Publicar como paquete compartido"],
        ],
        [4.2 * cm, 4 * cm, 8.3 * cm],
    ))

    story.append(h2("10.3 Arquitectura recomendada para V4"))
    story.append(p("<b>Principio:</b> local-first + sync, no 'cloud como única verdad sin cache'."))
    for t in [
        "<b>Household</b> como tenant. Cada hogar tiene su dataset. Miembros se invitan.",
        "<b>Source of truth sincronizable:</b> entidades de dominio con id, createdAt, updatedAt, deletedAt, updatedBy, rev.",
        "<b>Outbox pattern:</b> cada mutación local escribe (1) estado local SQLite y (2) operación en cola outbox; un sync worker envía ops al servidor.",
        "<b>Inbox / apply remote:</b> ops remotas se aplican en orden de vector clock o timestamp servidor + desempate por deviceId.",
        "<b>Realtime:</b> suscripción por householdId (WebSocket). Desktop Tauri y web iPhone comparten el mismo protocolo.",
        "<b>Reglas de conflicto de dominio (no solo LWW):</b> un mes cerrado no se reabre remotamente sin confirmación; un pago (paid) gana sobre pending si no hay reopen explícito; edición de serie genera nueva serie desde mes X (como ya hace future scope) para evitar reescribir historia.",
        "<b>Cliente compartido:</b> empaquetar finance-core (+ mutators) como librería TS usada por Tauri y por la web.",
        "<b>Backend:</b> API + realtime. Opciones pragmáticas: Supabase Realtime, PowerSync, ElectricSQL, o backend propio con Postgres. Elegir según control vs velocidad.",
        "<b>Auth:</b> email mágico / OAuth; sesiones por dispositivo; revocación.",
        "<b>Migración 3.2 → 4:</b> export JSON firmado o upload del snapshot una vez autenticado; el servidor crea el household inicial.",
    ]:
        story.append(bullet(t))

    story.append(h2("10.4 Qué NO hacer en V4"))
    for t in [
        "Sincronizar el snapshot JSON completo en cada cambio (colisiones y bandwidth).",
        "Usar solo 'último write gana' sin reglas de meses cerrados y pagos.",
        "Compartir la misma base SQLite por carpeta de red o iCloud Drive (corrupción casi garantizada).",
        "Meter la web iPhone otra vez como PWA sin auth y con localStorage como storage principal.",
        "Acoplar activeView del iPhone al de la PC.",
    ]:
        story.append(bullet(t))

    story.append(h2("10.5 Fases sugeridas hacia V4"))
    story.append(make_table(
        ["Fase", "Objetivo", "Entregable"],
        [
            ["V3.3 Foundation", "Sync-ready sin nube aún", "IDs, timestamps, soft-delete, split UI/domain, mutators, writes incrementales"],
            ["V3.4 Multi-client core", "Mismo core en web", "Paquete TS compartido + shell web responsive (offline local)"],
            ["V4.0 Cloud sync", "Cuentas + sync", "Backend, auth, outbox, realtime, migración desde 3.2"],
            ["V4.1 Hardening", "Confianza multi-dispositivo", "Conflict UI, audit log, E2E tests de sync, cifrado"],
        ],
        [3.2 * cm, 5 * cm, 8.3 * cm],
    ))
    story.append(p(
        "Intentar 'V4 sync' sin la fase Foundation es el mayor riesgo de proyecto: se termina parcheando conflictos "
        "en la UI porque el modelo no puede expresar la verdad distribuida."
    ))

    story.append(PageBreak())
    story.append(h1("11. Matriz consolidada de hallazgos"))
    story.append(make_table(
        ["ID", "Sev.", "Hallazgo", "Área"],
        [
            ["H01", "ALTO", "app.js monolítico (~1780 líneas)", "Mantenibilidad"],
            ["H02", "ALTO", "Full snapshot rewrite en cada save", "Persistencia / Sync"],
            ["H03", "ALTO", "Sin metadatos de sync (rev, updatedAt, deletedAt)", "Modelo datos"],
            ["H04", "ALTO", "person/category por nombre, no por ID", "Modelo datos"],
            ["H05", "ALTO", "TypeScript incompleto; sin contrato FE/Rust", "Calidad"],
            ["H06", "MEDIO", "UI state mezclado con dominio", "Arquitectura"],
            ["H07", "MEDIO", "Doble verdad JSON + tablas", "Persistencia"],
            ["H08", "MEDIO", "Mutaciones de series sin tests unitarios", "Pruebas"],
            ["H09", "MEDIO", "Sin cifrado en reposo de ilara.db", "Seguridad"],
            ["H10", "MEDIO", "Sin E2E automatizado de UI", "Pruebas"],
            ["H11", "MEDIO", "Lógica de series acoplada al DOM", "Arquitectura"],
            ["H12", "MEDIO", "Onboarding débil", "Producto"],
            ["H13", "BAJO", "CSP style-src unsafe-inline", "Seguridad"],
            ["H14", "BAJO", "GLOB month_key SQL laxo", "Datos"],
            ["H15", "BAJO", "Instalador sin code signing", "Release"],
            ["H16", "BAJO", "Sin CI remoto", "Ops"],
            ["H17", "INFO", "Moneda ARS fija", "Producto"],
            ["H18", "—", "finance-core puro y testeado", "Fortaleza"],
            ["H19", "—", "Validación + TX SQLite + rollback", "Fortaleza"],
            ["H20", "—", "Pipeline verify/release + SHA256", "Fortaleza"],
        ],
        [1.4 * cm, 1.8 * cm, 9.5 * cm, 3.8 * cm],
    ))

    story.append(PageBreak())
    story.append(h1("12. Sugerencias, oportunidades de mejora y qué agregaría"))
    story.append(p(
        "Esta sección responde de forma directa al pedido de cierre del informe: recomendaciones accionables, "
        "oportunidades de producto y lo que yo sumaría — con el norte de V4 multi-PC + web iPhone en tiempo real."
    ))

    story.append(h2("12.1 Sugerencias prioritarias (hacer pronto)"))
    story.append(h3("P0 — Fundación sync-ready (antes de escribir backend)"))
    for t in [
        "<b>Separar estado local vs sincronizable.</b> preferences (tema, mes activo, vista) locales; ledger del hogar sincronizable.",
        "<b>Envelope de entidad:</b> id, createdAt, updatedAt, deletedAt?, rev, originDeviceId en people, categories, transactions, occurrences, budgets, closed_months.",
        "<b>personId / categoryId</b> en series y, donde aplique, en presupuestos. Nombres denormalizados solo en ocurrencias históricas.",
        "<b>Extraer mutators de dominio</b> fuera de app.js (applyPay, applyEditSeries, applyCloseMonth…) con tests unitarios por scope.",
        "<b>Writes incrementales en SQLite</b> en lugar de DELETE-all + INSERT-all.",
        "<b>Modularizar app.js</b> en views / dialogs / state / io.",
    ]:
        story.append(bullet(t))

    story.append(h3("P1 — Calidad y confianza"))
    for t in [
        "Suite de tests de mutación de recurrencias (current/future/all) + meses cerrados.",
        "Fixture de import corrupto y de versión futura desconocida.",
        "CI Windows con npm run verify.",
        "Backup automático al cerrar mes + rotación de N copias en disco.",
        "Pantalla de diagnóstico en Ajustes: conteos, integridad, tamaño DB, última escritura.",
    ]:
        story.append(bullet(t))

    story.append(h3("P2 — Producto 3.x (valor inmediato, útil también en V4)"))
    for t in [
        "Vista 'Cuotas activas' con progreso y saldo restante global.",
        "Reporte por persona y por categoría (mes y YTD).",
        "Onboarding de 3 pasos.",
        "Atajos de teclado (N nuevo, flechas de mes).",
        "Resumen obligatorio al cerrar mes (pendientes, desvío de presupuesto).",
        "Modo oscuro.",
    ]:
        story.append(bullet(t))

    story.append(h2("12.2 Oportunidades de mejora"))
    story.append(make_table(
        ["Oportunidad", "Por qué importa", "Esfuerzo"],
        [
            ["Paquete @ilara/core compartido", "Una sola verdad de cálculos desktop+web", "Medio"],
            ["Modo offline-first desde 3.3", "La web iPhone fallará sin red si no se diseña ya", "Alto"],
            ["Audit log de cambios", "Confianza en hogar compartido + debug de sync", "Medio"],
            ["Presupuestos con alertas", "Notificación al superar 80/100%", "Bajo"],
            ["Import CSV bancario simple", "Reduce carga manual (sin open banking aún)", "Medio"],
            ["Tags además de categorías", "Flexibilidad sin romper reportes", "Bajo"],
            ["Export PDF del mes", "Compartir con contador/pareja sin dar la app", "Medio"],
            ["Widgets / tray resumen", "Enganche diario en desktop", "Medio"],
            ["Modo 'solo lectura' invitado", "Pareja ve pero no edita (base de permisos V4)", "Medio"],
            ["Simulador 'qué pasa si…'", "Proyección con gastos hipotéticos", "Medio"],
        ],
        [4.5 * cm, 8 * cm, 3.5 * cm],
    ))

    story.append(h2("12.3 Qué agregaría yo (opinión de producto + arquitectura)"))
    story.append(p("Si continuara el desarrollo con el norte V4, agregaría en este orden:"))

    story.append(h3("A. Capa de dominio versionable (imprescindible)"))
    story.append(p(
        "Un módulo TypeScript 'ledger' con tipos, mutators y tests. Desktop y web solo renderizan y llaman mutators. "
        "Esto es más importante que elegir Supabase u otro proveedor."
    ))

    story.append(h3("B. Eventos de dominio (base del tiempo real)"))
    story.append(p(
        "En lugar de 'guardar el mundo', emitir eventos: OccurrencePaid, SeriesSplitFromMonth, MonthClosed, "
        "BudgetSet, PersonRenamed… El estado es el fold de eventos (o snapshot + eventos desde un checkpoint). "
        "El canal realtime transporta eventos, no blobs."
    ))

    story.append(h3("C. Outbox local en SQLite"))
    story.append(p(
        "Tabla sync_outbox (id, entity, entity_id, op, payload, created_at, sent_at). "
        "Incluso antes de tener servidor, se puede simular sync entre dos perfiles locales para validar el protocolo."
    ))

    story.append(h3("D. Backend mínimo viable de sync"))
    story.append(p(
        "Auth + tabla de eventos por household + endpoint pull(since) + push(ops) + websocket de notify. "
        "No hace falta un ERP: hace falta un log confiable y reglas de aplicación idénticas en todos los clientes."
    ))

    story.append(h3("E. Cliente web iPhone (Safari)"))
    story.append(p(
        "Una SPA responsive (o PWA con service worker solo de assets, no de 'servidor de verdad') que use el mismo "
        "@ilara/core. Navegación inferior, inputs de monto nativos, y diseño touch. "
        "La DB local puede ser IndexedDB/SQLite-WASM con el mismo schema lógico."
    ))

    story.append(h3("F. Funciones de hogar compartido"))
    for t in [
        "Roles: admin / editor / viewer.",
        "Feed de actividad: 'María marcó Luz como pagada ($18.400)'.",
        "Comentarios cortos en un movimiento (opcional).",
        "Recordatorios de vencimiento (push web + toast desktop).",
    ]:
        story.append(bullet(t))

    story.append(h3("G. Seguridad V4 que no puede faltar"))
    for t in [
        "TLS everywhere, sesiones rotables, dispositivos listados y revocables.",
        "Rate limit y validación server-side igual de estricta que validate_snapshot.",
        "Backups server-side + export user-owned (derecho a salir con sus datos).",
        "Política clara: el servidor no es dueño eterno; el export JSON sigue existiendo.",
    ]:
        story.append(bullet(t))

    story.append(h2("12.4 Roadmap concreto recomendado"))
    story.append(make_table(
        ["Momento", "Trabajo", "Resultado medible"],
        [
            ["Ahora (1–2 sem)", "Split app.js + mutators + tests de series", "Menos riesgo al tocar código"],
            ["Luego (2–4 sem)", "Envelope sync + FKs person/category + writes delta", "Modelo listo para nube"],
            ["Después", "Web shell + core compartido offline", "Mismo ledger en browser"],
            ["V4.0", "Auth + outbox + realtime + migración 3.2", "2 PCs + iPhone mismos datos"],
            ["V4.1", "Conflictos UX, roles, audit, alerts", "Hogar multi-usuario confiable"],
        ],
        [3.2 * cm, 7 * cm, 6.3 * cm],
    ))

    story.append(PageBreak())
    story.append(h1("13. Conclusiones"))
    story.append(p(
        "Ilara Finanzas 3.2 es un proyecto <b>notablemente bien ejecutado</b> para su escala: cuida el dinero "
        "(centavos, previsto/real, historia), cuida la persistencia (SQLite transaccional, migraciones, validación Rust) "
        "y cuida la entrega (verify, release, hashes, docs)."
    ))
    story.append(p(
        "La auditoría no encontró indicios de corrupción sistemática de datos ni de prácticas inseguras graves "
        "en el modelo local de un dispositivo. Los riesgos principales son de <b>evolución</b>: monolito de frontend, "
        "snapshot global y modelo aún no preparado para distribución."
    ))
    story.append(p(
        "Con la meta de V4 (multi-PC + web iPhone + sync en tiempo real), la recomendación estratégica es clara: "
        "<b>no saltar a la nube sobre el snapshot actual</b>. Invertir primero en una foundation sync-ready "
        "(entidades versionadas, mutators, outbox, core compartido). Eso convierte la sincronización en un problema "
        "de transporte y políticas, no en una reescritura de emergencia."
    ))
    story.append(Spacer(1, 8))
    story.append(hr())
    story.append(h2("Calificación final"))
    story.append(make_table(
        ["Dimensión", "Nota", "Comentario"],
        [
            ["Uso local actual (3.2)", "8,5 / 10", "Listo para producción personal"],
            ["Calidad ingenieril general", "7,4 / 10", "Fuerte en dominio y release; deuda en FE"],
            ["Preparación V4 realtime", "3,5 / 10", "Cimientos de dominio sí; sync stack no"],
            ["Recomendación", "GO con plan", "Usar 3.2; planificar 3.3 foundation antes de V4"],
        ],
        [4.5 * cm, 2.5 * cm, 9.5 * cm],
    ))
    story.append(Spacer(1, 12))
    story.append(p(
        "Documento generado por Grok a partir del código y la documentación del workspace "
        "<b>Escritorio\\Finanzas personales</b> el 2 de agosto de 2026. "
        "Nombre de archivo: <b>Auditoria Grok.pdf</b>.",
        "Small",
    ))
    story.append(p("Fin del informe.", "Meta"))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        title="Auditoria Grok — Ilara Finanzas 3.2.0",
        author="Grok (xAI)",
        subject="Auditoría técnica completa y preparación V4 sync",
    )
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    build()
