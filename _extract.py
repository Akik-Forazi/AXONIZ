import zipfile, os
z = zipfile.ZipFile("axoniz.zip")
out = "_pyref"
os.makedirs(out, exist_ok=True)
skip = ("axoniz/integrations/Axodex/", "axoniz/integrations/Axodex\\")
n = 0
tot = 0
for name in z.namelist():
    if not name.startswith("axoniz/") or name.endswith("/"): continue
    if "__pycache__" in name: continue
    if "/integrations/Axodex/" in name: continue
    base = name.split("/")[-1]
    if "." in base:
        ext = base.rsplit(".",1)[-1].lower()
        if ext not in ("py","html","css","js","json","md","txt","bat","ps1","spec","yml","yaml","toml","cfg","ini"): continue
    else:
        continue
    data = z.read(name)
    dest = os.path.join(out, name)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f: f.write(data)
    n += 1; tot += len(data)
print("extracted", n, "files,", tot, "bytes")
