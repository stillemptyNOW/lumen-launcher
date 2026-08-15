#!/usr/bin/env python3
"""Надёжный запуск Minecraft через minecraft-launcher-lib (как рабочий лаунчер)."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import traceback
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: launch_helper.py config.json", file=sys.stderr)
        return 2
    cfg_path = Path(sys.argv[1])
    cfg = json.loads(cfg_path.read_text(encoding="utf-8-sig"))
    log_path = Path(cfg.get("logFile") or (Path(cfg["gameDirectory"]) / "logs" / "lumen-launch.log"))
    log_path.parent.mkdir(parents=True, exist_ok=True)

    def log(msg: str) -> None:
        with log_path.open("a", encoding="utf-8") as f:
            f.write(msg.rstrip() + "\n")
        print(msg, flush=True)

    try:
        import minecraft_launcher_lib
    except ImportError:
        log("ERROR: minecraft-launcher-lib не установлен. pip install minecraft-launcher-lib")
        return 3

    mc_dir = cfg["minecraftDirectory"]
    game_dir = cfg["gameDirectory"]
    version_id = cfg["versionId"]
    ram = int(cfg.get("ramMb") or 4096)
    java = (cfg.get("javaPath") or "").strip() or None

    # докачать native/version только если json профиля отсутствует
    ver_json = Path(mc_dir) / "versions" / version_id / f"{version_id}.json"
    if not ver_json.is_file():
        try:
            log(f"install_minecraft_version {version_id}…")
            minecraft_launcher_lib.install.install_minecraft_version(version_id, mc_dir)
        except Exception as e:
            log(f"WARN install_minecraft_version: {e}")

    options = {
        "username": cfg["username"],
        "uuid": cfg["uuid"].replace("-", ""),
        "token": cfg.get("accessToken") or "0",
        "launcherName": "LumenLauncher",
        "launcherVersion": "1.1",
        "gameDirectory": game_dir,
        "jvmArguments": [f"-Xmx{ram}M", f"-Xms{min(ram, 1024)}M"],
    }
    if java and Path(java).is_file():
        options["executablePath"] = java

    try:
        cmd = minecraft_launcher_lib.command.get_minecraft_command(version_id, mc_dir, options)
    except Exception:
        log(traceback.format_exc())
        return 4

    log(f"CMD: {cmd[0]}")
    log(f"ARGS: {len(cmd)}")
    log(f"CWD: {game_dir}")
    log(f"VERSION: {version_id}")
    log(f"MC_DIR: {mc_dir}")

    # detached process, stdout to log
    with log_path.open("a", encoding="utf-8") as f:
        f.write("\n--- OUTPUT ---\n")
        f.flush()
        creation = 0
        if sys.platform == "win32":
            creation = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
        proc = subprocess.Popen(
            cmd,
            cwd=game_dir,
            stdout=f,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            creationflags=creation,
            close_fds=True,
        )
    log(f"PID: {proc.pid}")
    # не ждём — игра живёт отдельно
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
