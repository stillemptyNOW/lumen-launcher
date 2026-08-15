import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, r"C:\Users\7ims (admin)\Desktop\ИИ проекты\Grok\minecraft-26.2-launcher\launcher")
import minecraft_launcher_lib
from java_util import find_java

dirs = [
    r"C:\Users\7ims (admin)\AppData\Roaming\Lumen Launcher\data\minecraft",
    r"C:\Users\7ims (admin)\Desktop\ИИ проекты\Grok\minecraft-26.2-launcher\data\minecraft",
]
inst = r"C:\Users\7ims (admin)\AppData\Roaming\Lumen Launcher\data\instances\de376771-3c5"
vid = "fabric-loader-0.19.3-26.2"

for d in dirs:
    print("DIR", d, "exists", Path(d).exists())
    fab = Path(d) / "libraries" / "net" / "fabricmc" / "fabric-loader"
    print("  fabric-loader libs", list(fab.rglob("*.jar")) if fab.exists() else None)
    print("  version", (Path(d) / "versions" / vid).exists())

d = next(x for x in dirs if (Path(x) / "versions" / vid).exists())
# prefer dir that has fabric-loader jar
for x in dirs:
    if list((Path(x) / "libraries" / "net" / "fabricmc").rglob("*.jar")):
        d = x
        break
print("using", d)
j = find_java(d)
print("java", j)
opts = {
    "username": "dnlkxz",
    "uuid": "545200e5df1b4a65a7e1c7f8011a6cbc",
    "token": "0",
    "launcherName": "Lumen",
    "launcherVersion": "1.0",
    "gameDirectory": inst,
    "jvmArguments": ["-Xmx2G", "-Xms512M"],
}
if j:
    opts["executablePath"] = j
cmd = minecraft_launcher_lib.command.get_minecraft_command(vid, d, opts)
print("args", len(cmd))
log = Path(inst) / "test-launch.log"
with open(log, "w", encoding="utf-8") as f:
    f.write("CMD0=" + cmd[0] + "\n")
    for i, a in enumerate(cmd[1:]):
        f.write(f"{i}: {a}\n")
    f.write("\n--- OUTPUT ---\n")
with open(log, "a", encoding="utf-8", errors="replace") as f:
    p = subprocess.Popen(cmd, cwd=inst, stdout=f, stderr=subprocess.STDOUT)
    for i in range(15):
        time.sleep(1)
        code = p.poll()
        if code is not None:
            print("exited", code, "after", i + 1, "s")
            break
    else:
        print("still running pid", p.pid)
        p.terminate()
print(log.read_text(encoding="utf-8", errors="replace")[-2500:])
