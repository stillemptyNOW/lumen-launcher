import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, r"C:\Users\7ims (admin)\Desktop\ИИ проекты\Grok\minecraft-26.2-launcher\launcher")
import minecraft_launcher_lib
from java_util import find_java

d = r"C:\Users\7ims (admin)\AppData\Roaming\Lumen Launcher\data\minecraft"
inst = r"C:\Users\7ims (admin)\AppData\Roaming\Lumen Launcher\data\instances\de376771-3c5"
vid = "fabric-loader-0.19.3-26.2"
j = find_java(d) or find_java(
    r"C:\Users\7ims (admin)\Desktop\ИИ проекты\Grok\minecraft-26.2-launcher\data\minecraft"
)
print("java", j)
opts = {
    "username": "dnlkxz",
    "uuid": "545200e5df1b4a65a7e1c7f8011a6cbc",
    "token": "0",
    "launcherName": "Lumen",
    "launcherVersion": "1.0",
    "gameDirectory": inst,
    "jvmArguments": ["-Xmx2G", "-Xms512M"],
    "executablePath": j,
}
cmd = minecraft_launcher_lib.command.get_minecraft_command(vid, d, opts)
log = Path(inst) / "test-appdata.log"
with open(log, "w", encoding="utf-8") as f:
    f.write("\n".join(cmd) + "\n\n---\n")
with open(log, "a", encoding="utf-8", errors="replace") as f:
    p = subprocess.Popen(cmd, cwd=inst, stdout=f, stderr=subprocess.STDOUT)
    for i in range(12):
        time.sleep(1)
        if p.poll() is not None:
            print("exited", p.returncode, "after", i + 1)
            break
    else:
        print("RUNNING ok pid", p.pid)
        p.terminate()
print(log.read_text(encoding="utf-8", errors="replace")[-1500:])
