"""
This configuration file manages the installation and packaging of AXONIZ-ZERO.
It defines dependencies, entry points, and metadata required to distribute
the application professionally as a Python package.
"""

import os
from setuptools import setup, find_packages

readme_path = os.path.join(os.path.dirname(__file__), "README.md")
long_desc = ""
if os.path.exists(readme_path):
    with open(readme_path, "r", encoding="utf-8") as f:
        long_desc = f.read()

setup(
    name="axoniz",
    version="2.0.0",
    author="AKIK FARAJI",
    author_email="akikfaraji@gmail.com",
    description="AXONIZ-ZERO: A premium, fully autonomous local AI coding agent.",
    long_description=long_desc,
    long_description_content_type="text/markdown",
    url="https://github.com/Akik-Forazi/AXONIZ",
    packages=find_packages(),
    package_data={
        "axoniz": ["web/static/*.html", "roles/*.yaml"],
    },
    install_requires=[
        "ollama",
        "llama-cpp-python",
        "requests",
        "transformers",
        "av",
    ],
    extras_require={
        "dev": ["flake8", "black", "pytest", "pyinstaller"],
    },
    entry_points={
        "console_scripts": [
            "axoniz=axoniz.core.runner:main",
        ],
    },
    python_requires=">=3.10",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: Other/Proprietary License",
        "Operating System :: Microsoft :: Windows",
        "Programming Language :: Python :: 3.10",
    ],
)
