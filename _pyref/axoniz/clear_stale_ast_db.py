"""
Run this once to clear the stale AST index DB so it gets recreated
with the fixed schema on next axoniz startup.
"""
import os, glob

ast_dir = os.path.expanduser("~/.axoniz/ast_indexes")
for f in glob.glob(os.path.join(ast_dir, "*.db")):
    print(f"Deleting stale DB: {f}")
    os.remove(f)
print("Done. Stale AST index DBs cleared.")
