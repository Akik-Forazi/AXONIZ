"""
Zero-cost local authentication using JWT tokens.
No external services required.
"""
import jwt
import secrets
import hashlib
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

class LocalAuth:
    """Local JWT-based authentication."""
    
    def __init__(self, secret_file: Path = None):
        if secret_file is None:
            secret_file = Path.home() / ".axoniz" / "secret.key"
        
        self.secret_file = secret_file
        self.secret_key = self._load_or_create_secret()
    
    def _load_or_create_secret(self) -> str:
        """Load existing secret or create new one."""
        if self.secret_file.exists():
            return self.secret_file.read_text().strip()
        
        # Generate cryptographically secure secret
        secret = secrets.token_urlsafe(32)
        self.secret_file.parent.mkdir(parents=True, exist_ok=True)
        self.secret_file.write_text(secret)
        # chmod not available on all Windows environments via Path, but we try
        try:
            os.chmod(self.secret_file, 0o600)
        except:
            pass
        return secret
    
    def create_token(self, username: str, expires_hours: int = 24) -> str:
        """Create JWT token for user."""
        payload = {
            "username": username,
            "exp": datetime.utcnow() + timedelta(hours=expires_hours),
            "iat": datetime.utcnow()
        }
        return jwt.encode(payload, self.secret_key, algorithm="HS256")
    
    def verify_token(self, token: str) -> Optional[str]:
        """Verify JWT token and return username if valid."""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=["HS256"])
            return payload["username"]
        except jwt.ExpiredSignatureError:
            return None  # Token expired
        except jwt.InvalidTokenError:
            return None  # Invalid token
    
    def create_user(self, username: str, password: str):
        """Create user with hashed password (stored locally)."""
        users_file = self.secret_file.parent / "users.json"
        users = {}
        
        if users_file.exists():
            try:
                users = json.loads(users_file.read_text())
            except:
                users = {}
        
        # Hash password with salt
        salt = secrets.token_hex(16)
        password_hash = hashlib.pbkdf2_hmac(
            'sha256', 
            password.encode(), 
            salt.encode(), 
            100000
        ).hex()
        
        users[username] = {
            "password_hash": password_hash,
            "salt": salt,
            "created": datetime.utcnow().isoformat()
        }
        
        users_file.write_text(json.dumps(users, indent=2))
        try:
            os.chmod(users_file, 0o600)
        except:
            pass
    
    def verify_password(self, username: str, password: str) -> bool:
        """Verify user password."""
        users_file = self.secret_file.parent / "users.json"
        if not users_file.exists():
            return False
        
        try:
            users = json.loads(users_file.read_text())
        except:
            return False

        if username not in users:
            return False
        
        user_data = users[username]
        salt = user_data["salt"]
        stored_hash = user_data["password_hash"]
        
        # Hash provided password with stored salt
        password_hash = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode(),
            salt.encode(),
            100000
        ).hex()
        
        return password_hash == stored_hash
