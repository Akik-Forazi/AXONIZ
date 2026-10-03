import zipfile, collections, os
z = zipfile.ZipFile("axoniz.zip")
names = [n for n in z.namelist() if n.startswith("axoniz/") and n.endswith(".py") and "__pycache__" not in n]
def bucket(n):
    parts = n.split("/")
    return "/".join(parts[:3]) if len(parts) >= 3 else "/".join(parts[:2])
groups = collections.defaultdict(lambda: [0,0])
for n in names:
    groups[bucket(n)][0] += 1
    groups[bucket(n)][1] += z.getinfo(n).file_size
print(f"{'bucket':46} {'files':>6} {'KB':>9}")
for k,(c,s) in sorted(groups.items(), key=lambda kv: -kv[1][1]):
    print(f"{k:46} {c:6} {s/1024:9.1f}")
app = {k:v for k,v in groups.items() if "/site-packages/" not in k and not k.startswith("axoniz/node_modules")}
print()
print("PROJECT CODE ONLY:", sum(v[0] for v in app.values()), "files,", round(sum(v[1] for v in app.values())/1024,1), "KB")
