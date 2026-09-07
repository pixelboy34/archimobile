#!/usr/bin/env python3
"""Sauvegarde FORMA vers github.com/pixelboy34/archimobile.

Ne pousse jamais un studio vide (évite d'écraser le dépôt avec le scaffold).
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path(os.environ.get("FORMA_WORKSPACE", "/workspace"))
REPO_DIR = Path(os.environ.get("FORMA_BACKUP_DIR", "/tmp/archimobile-backup"))
REMOTE = "https://github.com/pixelboy34/archimobile.git"
STUDIO = WORKSPACE / "src" / "components" / "studio"

SKIP_DIR = {
    "node_modules",
    ".git",
    "artifacts",
    "attachments",
    "screenshots",
    ".grok",
}
SKIP_FILE = {
    "AGENTS.md",
    "AGENTS.project.md",
    ".env",
    "forma-studio.zip",
}
SKIP_SUFFIX = {".zip"}


def log(msg: str) -> None:
    print(f"[forma-backup] {msg}", flush=True)


def run(cmd: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, check=check, text=True, capture_output=True)


def git(args: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    return run(["git", *args], cwd=cwd, check=check)


def keep(rel: Path) -> bool:
    if set(rel.parts) & SKIP_DIR:
        return False
    if rel.name in SKIP_FILE or rel.name.startswith(".env"):
        return False
    if rel.suffix in SKIP_SUFFIX:
        return False
    return True


def studio_present() -> bool:
    return STUDIO.is_dir() and any(STUDIO.glob("*.tsx"))


def ensure_clone() -> None:
    if (REPO_DIR / ".git").is_dir():
        git(["fetch", "origin", "main"], cwd=REPO_DIR)
        git(["checkout", "main"], cwd=REPO_DIR, check=False)
        git(["pull", "--ff-only", "origin", "main"], cwd=REPO_DIR, check=False)
        return
    if REPO_DIR.exists():
        shutil.rmtree(REPO_DIR)
    run(["git", "clone", REMOTE, str(REPO_DIR)])


def restore_workspace() -> str:
    """Copy GitHub tree into workspace, keep platform AGENTS.md."""
    ensure_clone()
    agents = WORKSPACE / "AGENTS.md"
    bak = Path("/tmp/AGENTS.platform.md")
    if agents.exists():
        shutil.copy2(agents, bak)
    for name in os.listdir(REPO_DIR):
        if name in SKIP_DIR:
            continue
        src, dst = REPO_DIR / name, WORKSPACE / name
        if src.is_dir():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("node_modules", ".git"))
        else:
            shutil.copy2(src, dst)
    if bak.exists():
        shutil.copy2(bak, agents)
    sha = git(["rev-parse", "--short", "HEAD"], cwd=REPO_DIR).stdout.strip()
    return sha


def copy_workspace_into_clone() -> None:
    for dirpath, dirnames, filenames in os.walk(WORKSPACE):
        rel_dir = Path(dirpath).relative_to(WORKSPACE)
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR]
        for name in filenames:
            rel = rel_dir / name if rel_dir != Path(".") else Path(name)
            if not keep(rel):
                continue
            src = WORKSPACE / rel
            dst = REPO_DIR / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)


def commit_and_push() -> str:
    git(["add", "-A"], cwd=REPO_DIR)
    status = git(["status", "--porcelain"], cwd=REPO_DIR).stdout.strip()
    if not status:
        sha = git(["rev-parse", "--short", "HEAD"], cwd=REPO_DIR).stdout.strip()
        log(f"aucun changement · {sha}")
        return f"aucun changement · {sha}"
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    git(
        [
            "-c",
            "user.email=pixelboy34@users.noreply.github.com",
            "-c",
            "user.name=pixelboy34",
            "commit",
            "-m",
            f"chore: sauvegarde auto FORMA {stamp}",
        ],
        cwd=REPO_DIR,
    )
    push = git(["push", "origin", "HEAD:main"], cwd=REPO_DIR, check=False)
    if push.returncode != 0:
        log(push.stderr.strip() or push.stdout.strip())
        sys.exit(push.returncode)
    sha = git(["rev-parse", "--short", "HEAD"], cwd=REPO_DIR).stdout.strip()
    n = len([ln for ln in status.splitlines() if ln.strip()])
    log(f"poussé {sha} · {n} fichiers")
    return f"poussé {sha} · {n} fichiers"


def main() -> int:
    if not studio_present():
        sha = restore_workspace()
        log(f"restauré depuis GitHub · {sha} · rien à pousser")
        print(f"restauré · {sha}")
        return 0
    ensure_clone()
    copy_workspace_into_clone()
    print(commit_and_push())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
