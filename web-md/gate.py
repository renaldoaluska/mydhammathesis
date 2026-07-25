import json
import os
from pathlib import Path
from flask import Blueprint, request, redirect, url_for, session, render_template, current_app

gate_bp = Blueprint("gate", __name__, url_prefix="/gate")

CONFIG_PATH = Path(__file__).resolve().parent / "gate_config.json"

def get_gate_config():
    if not CONFIG_PATH.exists():
        return {"enabled": False, "code": ""}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading gate_config.json: {e}")
        return {"enabled": False, "code": ""}

@gate_bp.before_app_request
def check_gate():
    config = get_gate_config()
    
    # If gate is disabled, allow all
    if not config.get("enabled", False):
        return None

    # Exemptions
    if request.path.startswith("/gate"):
        return None
    if request.path.startswith("/static"):
        return None

    # Check session
    current_code = session.get("gate_code")
    expected_code = config.get("code")
    
    if current_code != expected_code:
        # Code mismatch or missing, kick out
        if request.path.startswith("/api"):
            return {"error": "gate_unauthorized"}, 401
        return redirect(url_for("gate.login", next=request.url))
    
    return None

@gate_bp.route("/login", methods=["GET", "POST"])
def login():
    config = get_gate_config()
    if not config.get("enabled", False):
        return redirect("/")

    error = None
    if request.method == "POST":
        code = request.form.get("code", "")
        if code == config.get("code"):
            session["gate_code"] = code
            next_url = request.args.get("next") or "/"
            return redirect(next_url)
        else:
            error = "Kode akses salah. Silakan coba lagi."

    return render_template("gate.html", error=error)
