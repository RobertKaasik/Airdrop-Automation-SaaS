#!/usr/bin/env python3
"""Low-noise production monitoring for AIRDROP-X.

It checks the systemd services, local health endpoint, disk capacity, and the
freshness of the latest backup.  Email is sent only when the state changes:
once when an incident begins and once after recovery.
"""

from __future__ import annotations

import json
import os
import shutil
import smtplib
import ssl
import subprocess
import time
import urllib.request
from email.message import EmailMessage
from pathlib import Path


APP_DIR = Path("/srv/airdrop-x")
ENV_FILE = APP_DIR / ".env"
BACKUP_DIR = Path("/var/backups/airdrop-x")
STATE_FILE = Path("/var/lib/airdrop-x-monitor/state.json")
DISK_WARN_PERCENT = 85
BACKUP_MAX_AGE_SECONDS = 30 * 60 * 60
SERVICES = ("airdrop-x-web", "airdrop-x-bot", "nginx", "fail2ban")


def read_env_value(name: str) -> str:
    try:
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip()
    except OSError:
        pass
    return ""


def service_is_active(name: str) -> bool:
    result = subprocess.run(
        ["/bin/systemctl", "is-active", "--quiet", name],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def check_health() -> str | None:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if payload.get("status") != "ok" or payload.get("database") != "ok":
            return "health endpoint returned an unhealthy database state"
        return None
    except Exception as error:  # noqa: BLE001 - monitoring must report all failures
        return f"health endpoint failed: {type(error).__name__}"


def check_backup() -> str | None:
    archives = list(BACKUP_DIR.glob("airdrop-x-*.tar.gz"))
    if not archives:
        return "no local AIRDROP-X backup exists"
    newest = max(archives, key=lambda item: item.stat().st_mtime)
    age = time.time() - newest.stat().st_mtime
    if age > BACKUP_MAX_AGE_SECONDS:
        return "latest local backup is older than 30 hours"
    return None


def collect_failures() -> list[str]:
    failures = [f"service inactive: {name}" for name in SERVICES if not service_is_active(name)]
    health_failure = check_health()
    if health_failure:
        failures.append(health_failure)
    disk = shutil.disk_usage("/")
    used_percent = int((disk.used / disk.total) * 100)
    if used_percent >= DISK_WARN_PERCENT:
        failures.append(f"root filesystem usage is {used_percent}%")
    backup_failure = check_backup()
    if backup_failure:
        failures.append(backup_failure)
    return failures


def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"healthy": True}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = STATE_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(state), encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(STATE_FILE)


def send_alert(subject: str, body: str) -> None:
    recipient = read_env_value("MONITOR_ALERT_EMAIL")
    password = "".join(read_env_value("SMTP_PASSWORD").split())
    if not recipient or not password:
        print("AIRDROP-X monitor: alert email is not configured")
        return
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = "Airdrop-X Monitor <airdrop.x.support@gmail.com>"
    message["To"] = recipient
    message.set_content(body)
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context, timeout=20) as smtp:
        smtp.login("airdrop.x.support@gmail.com", password)
        smtp.send_message(message)


def main() -> None:
    failures = collect_failures()
    healthy = not failures
    previous = load_state()
    was_healthy = bool(previous.get("healthy", True))
    now = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    if healthy and not was_healthy:
        send_alert("[AIRDROP-X] Service recovered", f"Monitoring recovered at {now}. All checks are healthy.")
        print("AIRDROP-X monitor: recovered")
    elif not healthy and was_healthy:
        send_alert("[AIRDROP-X] Monitoring alert", f"Incident detected at {now}:\n- " + "\n- ".join(failures))
        print("AIRDROP-X monitor alert: " + "; ".join(failures))
    else:
        print("AIRDROP-X monitor: healthy" if healthy else "AIRDROP-X monitor: incident unchanged")
    save_state({"healthy": healthy, "checked_at": int(time.time()), "failures": failures})


if __name__ == "__main__":
    main()
