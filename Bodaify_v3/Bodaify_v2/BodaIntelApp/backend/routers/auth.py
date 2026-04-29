"""
Bodaify Authentication System
JWT-based auth with bcrypt password hashing.
In-memory user store (swap for DB in production).
"""

import os
import json
import hashlib
import hmac
import base64
import time
import re
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, field_validator

router  = APIRouter()
bearer  = HTTPBearer(auto_error=False)

# ── CONFIG ─────────────────────────────────────────────────────────────────────
SECRET_KEY      = os.getenv("BI_SECRET", "bodaify-kampala-2026-jwt-secret-key-do-change-in-prod")
ALGO            = "HS256"
ACCESS_EXPIRE   = 60 * 60 * 8   # 8 hours in seconds

# ── IN-MEMORY USER DB ──────────────────────────────────────────────────────────
# { email: { password_hash, full_name, sacco, role, created_at } }
_USERS: dict = {}

# Seed a demo user so login works out of the box
def _seed_demo():
    _USERS["derrick@bodaify.ug"] = {
        "full_name":     "Derrick Ouma",
        "sacco":         "Kampala Boda Union",
        "role":          "rider",
        "password_hash": _hash_pw("Demo@1234"),
        "created_at":    int(time.time()),
        "rider_id":      "PIL-001",
        "avatar":        "DO",
    }
    _USERS["admin@bodaify.ug"] = {
        "full_name":     "Admin Bodaify",
        "sacco":         "Bodaify HQ",
        "role":          "admin",
        "password_hash": _hash_pw("Admin@2026!"),
        "created_at":    int(time.time()),
        "rider_id":      "ADM-001",
        "avatar":        "AB",
    }

# ── PASSWORD UTILS ─────────────────────────────────────────────────────────────
def _hash_pw(password: str) -> str:
    """PBKDF2-HMAC-SHA256 password hash (no external deps)."""
    salt = b"bodaify-salt-2026"
    dk   = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260000)
    return base64.b64encode(dk).decode()

def _verify_pw(password: str, hashed: str) -> bool:
    return hmac.compare_digest(_hash_pw(password), hashed)

# ── JWT (pure stdlib, no python-jose needed) ───────────────────────────────────
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * (pad % 4))

def create_token(payload: dict) -> str:
    header  = _b64url(json.dumps({"alg": ALGO, "typ": "JWT"}).encode())
    payload = dict(payload, iat=int(time.time()), exp=int(time.time()) + ACCESS_EXPIRE)
    body    = _b64url(json.dumps(payload).encode())
    sig_input = f"{header}.{body}".encode()
    sig = _b64url(hmac.new(SECRET_KEY.encode(), sig_input, hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"

def decode_token(token: str) -> dict:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("bad token")
        header, body, sig = parts
        # Verify signature
        expected = _b64url(hmac.new(SECRET_KEY.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            raise ValueError("invalid signature")
        payload = json.loads(_b64url_decode(body))
        if payload.get("exp", 0) < time.time():
            raise ValueError("token expired")
        return payload
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    email   = payload.get("sub")
    user    = _USERS.get(email)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {"email": email, **user}

# ── SCHEMAS ────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    full_name: str
    email:     str
    password:  str
    sacco:     str = "Independent"
    role:      str = "rider"

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not re.match(r"[^@]+@[^@]+\.[^@]+", v):
            raise ValueError("Invalid email address")
        return v.lower().strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        errors = []
        if len(v) < 8:
            errors.append("at least 8 characters")
        if not re.search(r"[A-Z]", v):
            errors.append("one uppercase letter")
        if not re.search(r"[a-z]", v):
            errors.append("one lowercase letter")
        if not re.search(r"[0-9]", v):
            errors.append("one number")
        if not re.search(r"[^A-Za-z0-9]", v):
            errors.append("one symbol (!@#$...)")
        if errors:
            raise ValueError("Password must contain: " + ", ".join(errors))
        return v

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, v):
        if len(v.strip()) < 2:
            raise ValueError("Full name is required")
        return v.strip()

class LoginRequest(BaseModel):
    email:    str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         dict

class UserProfile(BaseModel):
    email:      str
    full_name:  str
    sacco:      str
    role:       str
    rider_id:   str
    avatar:     str
    first_name: str

# ── ROUTES ─────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest):
    email = req.email.lower().strip()
    if email in _USERS:
        raise HTTPException(status_code=409, detail="Email already registered")

    first = req.full_name.strip().split()[0]
    initials = "".join(w[0].upper() for w in req.full_name.split()[:2])
    rider_id = f"PIL-{len(_USERS)+1:03d}"

    _USERS[email] = {
        "full_name":     req.full_name.strip(),
        "sacco":         req.sacco,
        "role":          req.role,
        "password_hash": _hash_pw(req.password),
        "created_at":    int(time.time()),
        "rider_id":      rider_id,
        "avatar":        initials,
    }

    token = create_token({"sub": email, "role": req.role, "name": first})
    user  = _public_user(email)
    return TokenResponse(access_token=token, user=user)


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    email = req.email.lower().strip()
    user  = _USERS.get(email)

    if not user or not _verify_pw(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    first = user["full_name"].split()[0]
    token = create_token({"sub": email, "role": user["role"], "name": first})
    return TokenResponse(access_token=token, user=_public_user(email))


@router.get("/me", response_model=UserProfile)
async def get_me(current: dict = Depends(get_current_user)):
    return UserProfile(
        email=current["email"],
        full_name=current["full_name"],
        sacco=current["sacco"],
        role=current["role"],
        rider_id=current["rider_id"],
        avatar=current["avatar"],
        first_name=current["full_name"].split()[0],
    )


@router.post("/logout")
async def logout():
    # Client-side token removal — stateless JWT
    return {"message": "Logged out successfully"}


@router.put("/profile")
async def update_profile(
    data: dict,
    current: dict = Depends(get_current_user),
):
    email = current["email"]
    allowed = {"full_name", "sacco"}
    for k, v in data.items():
        if k in allowed:
            _USERS[email][k] = v
    return {"message": "Profile updated", "user": _public_user(email)}


@router.get("/users")
async def list_users(current: dict = Depends(get_current_user)):
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return {"users": [_public_user(e) for e in _USERS]}


# ── HELPERS ────────────────────────────────────────────────────────────────────
def _public_user(email: str) -> dict:
    u = _USERS[email]
    return {
        "email":      email,
        "full_name":  u["full_name"],
        "first_name": u["full_name"].split()[0],
        "sacco":      u["sacco"],
        "role":       u["role"],
        "rider_id":   u["rider_id"],
        "avatar":     u["avatar"],
    }

# Seed demo accounts on module load
_seed_demo()
