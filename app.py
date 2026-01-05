import os
from flask import Flask, jsonify, request
from flask_cors import CORS
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime
from unidecode import unidecode

# =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
# CONFIGURAÇÕES
# =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def abs_path(filename):
    return os.path.join(BASE_DIR, filename)

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "YOUR_SPREADSHEET_ID")
CREDS_FILE = os.getenv("GOOGLE_CREDS_FILE", abs_path("credentials.json"))

SCOPE = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive"
]

PRINCIPAL_SHEET_NAME = "PRINCIPAL"
SUBTAREFA_SHEET_NAME = "SUBTAREFA"

app = Flask(__name__)
CORS(app)

# =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
# UTILITÁRIOS
# =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

def safe_get(row, index):
    return row[index].strip() if index < len(row) else ""


def get_gspread_client():
    creds = ServiceAccountCredentials.from_json_keyfile_name(
        CREDS_FILE, SCOPE
    )
    return gspread.authorize(creds)


def parse_date(date_str):
    if not date_str:
        return None

    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%m/%d/%Y %H:%M:%S",
        "%d/%m/%Y",
        "%Y-%m-%d",
        "%m/%d/%Y"
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue

    if " " in date_str:
        return parse_date(date_str.split(" ")[0])

    return None


def sanitize_status(status):
    if not status:
        return "status-default"

    s = unidecode(status).lower()

    if "andamento" in s:
        return "status-em-andamento"
    if "finalizado" in s or "concluido" in s:
        return "status-finalizado"
    if "atrasado" in s:
        return "status-atrasado"
    if "pendente" in s:
        return "status-pendente"
    if "cancelado" in s:
        return "status-cancelado"

    return "status-default"

# =========================================================
# GET – PROJETOS
# =========================================================

def get_projects_data():
    client = get_gspread_client()
    sheet = client.open_by_key(SPREADSHEET_ID).worksheet(PRINCIPAL_SHEET_NAME)

    data = sheet.get_all_values()
    formatted = []

    for row in data[1:]:
        project_id = safe_get(row, 24)
        if not project_id:
            continue

        name = safe_get(row, 3)
        responsible = safe_get(row, 7)
        status = safe_get(row, 10)
        sector = safe_get(row, 26)
        classification = safe_get(row, 6)

        date_solicitation = parse_date(safe_get(row, 1))
        date_start_planned = parse_date(safe_get(row, 28))
        date_end_planned = parse_date(safe_get(row, 31))
        date_end_real = parse_date(safe_get(row, 23))

        # Fallback: se não houver início planejado, usa solicitação
        planned_start = date_start_planned or date_solicitation
        planned_end = date_end_planned

        if not planned_start or not planned_end:
            continue

        if planned_end < planned_start:
            planned_end = planned_start

        color_class = sanitize_status(status)

        formatted.append([
            project_id,
            name,
            status,
            planned_start.year,
            planned_start.month - 1,
            planned_start.day,
            planned_end.year,
            planned_end.month - 1,
            planned_end.day,
            date_solicitation.year if date_solicitation else None,
            date_solicitation.month - 1 if date_solicitation else None,
            date_solicitation.day if date_solicitation else None,
            date_end_real.year if date_end_real else None,
            date_end_real.month - 1 if date_end_real else None,
            date_end_real.day if date_end_real else None,
            responsible,
            name,
            color_class,
            *[None] * 12,
            sector,
            classification
        ])

    return formatted

# =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
# GET – TAREFAS
# =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

def get_gantt_data():
    client = get_gspread_client()
    spreadsheet = client.open_by_key(SPREADSHEET_ID)

    principal = spreadsheet.worksheet(PRINCIPAL_SHEET_NAME)
    subtarefa = spreadsheet.worksheet(SUBTAREFA_SHEET_NAME)

    project_map = {}
    for row in principal.get_all_values()[1:]:
        if len(row) >= 25:
            project_map[row[24].strip()] = row[3].strip()

    formatted = []

    for row in subtarefa.get_all_values()[1:]:
        if len(row) < 35:
            continue

        task_id = safe_get(row, 23)
        if not task_id:
            continue

        project_name = project_map.get(safe_get(row, 0), "Tarefas Soltas")

        name = safe_get(row, 4)
        responsible = safe_get(row, 8)
        status = safe_get(row, 10)
        sector = safe_get(row, 30)
        classification = safe_get(row, 7)

        date_start = parse_date(safe_get(row, 2))
        date_deadline = parse_date(safe_get(row, 33))
        date_real_start = parse_date(safe_get(row, 27))
        date_real_end = parse_date(safe_get(row, 22))

        planned_start = date_start
        planned_end = date_deadline or date_real_end

        if not planned_start or not planned_end:
            continue

        if planned_end < planned_start:
            planned_end = planned_start

        color_class = sanitize_status(status)

        formatted.append([
            task_id,
            name,
            status,
            planned_start.year,
            planned_start.month - 1,
            planned_start.day,
            planned_end.year,
            planned_end.month - 1,
            planned_end.day,
            date_real_start.year if date_real_start else None,
            date_real_start.month - 1 if date_real_start else None,
            date_real_start.day if date_real_start else None,
            date_real_end.year if date_real_end else None,
            date_real_end.month - 1 if date_real_end else None,
            date_real_end.day if date_real_end else None,
            responsible,
            project_name,
            color_class,
            *[None] * 12,
            sector,
            classification
        ])

    return formatted

# =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
# PUT – ATUALIZAÇÕES
# =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

def update_dates(sheet, id_column, target_id, updates):
    cell = sheet.find(target_id, in_column=id_column)
    if not cell:
        raise ValueError("ID não encontrado.")

    row = cell.row
    batch = []

    for col, value in updates.items():
        batch.append({
            "range": f"{col}{row}",
            "values": [[value]]
        })

    sheet.batch_update(batch, value_input_option="USER_ENTERED")


def format_sheet_date(date_str):
    if not date_str:
        return ""
    dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
    return dt.strftime("%d/%m/%Y %H:%M:%S")

# =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
# ROTAS
# =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

@app.route("/api/projects", methods=["GET"])
def api_projects():
    return jsonify(get_projects_data())


@app.route("/api/gantt", methods=["GET"])
def api_gantt():
    return jsonify(get_gantt_data())


@app.route("/api/gantt/<task_id>", methods=["PUT", "OPTIONS"])
def api_update_task(task_id):
    if request.method == "OPTIONS":
        return "", 200

    data = request.get_json()
    client = get_gspread_client()
    sheet = client.open_by_key(SPREADSHEET_ID).worksheet(SUBTAREFA_SHEET_NAME)

    update_dates(
        sheet,
        24,
        task_id,
        {
            "AB": format_sheet_date(data.get("startDate")),
            "AH": format_sheet_date(data.get("endDate"))
        }
    )

    return jsonify({"success": True})


@app.route("/api/projects/<project_id>", methods=["PUT", "OPTIONS"])
def api_update_project(project_id):
    if request.method == "OPTIONS":
        return "", 200

    data = request.get_json()
    client = get_gspread_client()
    sheet = client.open_by_key(SPREADSHEET_ID).worksheet(PRINCIPAL_SHEET_NAME)

    update_dates(
        sheet,
        25,
        project_id,
        {
            "BB": format_sheet_date(data.get("startDate")),
            "AF": format_sheet_date(data.get("endDate"))
        }
    )

    return jsonify({"success": True})


@app.route("/")
def home():
    return "Servidor Flask OK"


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
