import os
import sys
import subprocess
import shutil

def run_cmd(cmd, cwd=None):
    print(f"Running: {cmd} in {cwd or '.'}")
    res = subprocess.run(cmd, shell=True, cwd=cwd)
    if res.returncode != 0:
        print(f"Error executing: {cmd}")
        sys.exit(res.returncode)

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "web", "frontend")
    static_dir = os.path.join(root_dir, "web", "static")

    # 1. Build Vite frontend
    print("--- Building React + Vite Frontend ---")
    if os.path.exists(frontend_dir):
        run_cmd("npm run build", cwd=frontend_dir)
    else:
        print("Error: web/frontend directory not found")
        sys.exit(1)

    # 2. Check PyInstaller installation
    print("--- Verifying PyInstaller ---")
    try:
        import PyInstaller
    except ImportError:
        print("Installing pyinstaller...")
        run_cmd("pip install pyinstaller")

    # 3. Compile standalone executable
    print("--- Compiling Python standalone executable via PyInstaller ---")
    
    # We include web/static folder and any fallback binary configurations
    pyinstaller_args = [
        "python",
        "-m",
        "PyInstaller",
        "--onefile",
        "--name=axoniz",
        f'--add-data=web/static{os.pathsep}web/static',
        "--hidden-import=llama_cpp",
        "--hidden-import=kokoro_onnx",
        "--hidden-import=sounddevice",
        "--hidden-import=soundfile",
        "--hidden-import=transformers",
        "--hidden-import=torch",
        "axoniz_main.py"
    ]
    
    cmd = " ".join(pyinstaller_args)
    run_cmd(cmd, cwd=root_dir)

    print("\n--- STANDALONE COMPILATION COMPLETE ---")
    print(f"Executable built successfully at: {os.path.join(root_dir, 'dist', 'axoniz.exe')}")

if __name__ == "__main__":
    main()
