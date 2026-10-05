import importlib.metadata
import sys
import traceback
import os

# Monkey-patch for Python 3.14 metadata incompatibility in huggingface_hub/transformers
def patched_version(distribution_name):
    try:
        return importlib.metadata.version(distribution_name)
    except Exception:
        return "0.0.0" # Fallback to prevent crash during ML library imports

importlib.metadata.version = patched_version

from axoniz.core.runner import main

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        error_file = "error.txt"
        with open(error_file, "a") as f:
            f.write(f"\n--- FATAL CRASH: {os.path.basename(sys.argv[0])} ---\n")
            f.write(traceback.format_exc())
        print(f"\n[FATAL ERROR] Axoniz crashed. Detailed error logged to {error_file}")
        sys.exit(1)
