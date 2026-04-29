"""
Bodaify — Email OTP Authentication
Two-step login: email -> 6-digit code sent -> verify -> JWT issued.
"""

import os, re, time, random, string, smtplib, hmac, hashlib, base64, json
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

SMTP_HOST     = os.getenv("SMTP_HOST",     "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER",     "")
SMTP_PASS     = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL    = os.getenv("FROM_EMAIL",    "noreply@bodaify.ug")
OTP_TTL       = 600
SECRET_KEY    = os.getenv("BI_SECRET", "bodaify-kampala-2026-jwt-secret-key")
ACCESS_EXPIRE = 60 * 60 * 8

_OTP_STORE: dict = {}

def _valid_email(e): return bool(re.match(r"[^@]+@[^@]+\.[^@]+", e))
def _gen_otp():      return "".join(random.choices(string.digits, k=6))

def _b64u(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _make_token(payload):
    hdr  = _b64u(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
    pl   = dict(payload, iat=int(time.time()), exp=int(time.time())+ACCESS_EXPIRE)
    body = _b64u(json.dumps(pl).encode())
    sig  = _b64u(hmac.new(SECRET_KEY.encode(), f"{hdr}.{body}".encode(), hashlib.sha256).digest())
    return f"{hdr}.{body}.{sig}"

def _send(to, subject, html):
    if not SMTP_USER or not SMTP_PASS:
        codes = re.findall(r'\b\d{6}\b', html)
        print(f"\n{'='*55}")
        print(f"  BODAIFY OTP  →  {to}")
        print(f"  CODE: {codes[0] if codes else '??????'}")
        print(f"  (Set SMTP_USER + SMTP_PASSWORD env vars for real email)")
        print(f"{'='*55}\n")
        return True
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"Bodaify <{FROM_EMAIL}>"
        msg["To"]      = to
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as s:
            s.ehlo(); s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(FROM_EMAIL, [to], msg.as_string())
        return True
    except Exception as e:
        print(f"[SMTP ERROR] {e}")
        return False

def _html(code, email):
    return f"""<!DOCTYPE html><html><body style="margin:0;background:#0D1117;font-family:sans-serif">
<div style="max-width:460px;margin:40px auto;background:#111318;border:1px solid #252930;border-radius:16px;overflow:hidden">
  <div style="background:#F5A623;padding:22px 32px;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#000">Bodaify</div>
    <div style="font-size:11px;color:rgba(0,0,0,.55);letter-spacing:.1em">FLEET INTELLIGENCE · KAMPALA</div>
  </div>
  <div style="padding:36px 32px;text-align:center">
    <p style="color:#8B93A5;font-size:14px;margin:0 0 6px">Your sign-in code:</p>
    <div style="background:#0A0C10;border:2px solid #F5A623;border-radius:12px;padding:20px 36px;display:inline-block;margin:14px 0">
      <span style="font-size:44px;font-weight:800;color:#F5A623;letter-spacing:12px;font-family:monospace">{code}</span>
    </div>
    <p style="color:#5A6070;font-size:12px;margin:14px 0 0;font-family:monospace">
      Valid for <b style="color:#E8ECF4">10 minutes</b> &nbsp;·&nbsp; Do not share this code
    </p>
  </div>
  <div style="padding:14px 32px;border-top:1px solid #252930;text-align:center">
    <p style="color:#3A4050;font-size:11px;margin:0;font-family:monospace">Sent to {email} · bodaify.ug</p>
  </div>
</div></body></html>"""

class OTPReq(BaseModel):
    email: str

class OTPVerify(BaseModel):
    email: str
    code:  str

@router.post("/request-otp")
async def request_otp(req: OTPReq):
    email = req.email.lower().strip()
    if not _valid_email(email):
        raise HTTPException(400, "Invalid email address")
    existing = _OTP_STORE.get(email)
    if existing and (time.time() - (existing["expires_at"] - OTP_TTL)) < 60:
        raise HTTPException(429, "Wait 60 seconds before requesting another code")
    code = _gen_otp()
    _OTP_STORE[email] = {"code": code, "expires_at": time.time() + OTP_TTL, "attempts": 0}
    sent = _send(email, "Your Bodaify verification code", _html(code, email))
    return {"message": f"Code sent to {email}", "sent": sent,
            "note": "Check server console if SMTP not configured"}

@router.post("/verify-otp")
async def verify_otp(req: OTPVerify):
    email  = req.email.lower().strip()
    code   = req.code.strip()
    record = _OTP_STORE.get(email)
    if not record:
        raise HTTPException(400, "No code requested. Please request a new code.")
    if time.time() > record["expires_at"]:
        del _OTP_STORE[email]
        raise HTTPException(400, "Code expired. Please request a new one.")
    record["attempts"] += 1
    if record["attempts"] > 5:
        del _OTP_STORE[email]
        raise HTTPException(429, "Too many attempts. Please request a new code.")
    if record["code"] != code:
        left = 5 - record["attempts"]
        raise HTTPException(400, f"Incorrect code. {left} attempt{'s' if left!=1 else ''} left.")
    del _OTP_STORE[email]

    # Get or auto-create user
    from routers.auth import _USERS, _hash_pw, create_token, _public_user
    if email not in _USERS:
        name = email.split("@")[0].replace(".", " ").replace("_", " ").title()
        initials = "".join(w[0].upper() for w in name.split()[:2])
        _USERS[email] = {
            "full_name": name, "sacco": "Independent", "role": "rider",
            "password_hash": _hash_pw(f"otp-auto-{code}"),
            "created_at": int(time.time()),
            "rider_id": f"OTP-{len(_USERS)+1:03d}", "avatar": initials,
        }
    user  = _public_user(email)
    token = create_token({"sub": email, "role": _USERS[email]["role"],
                          "name": user["first_name"]})
    return {"access_token": token, "token_type": "bearer",
            "user": user, "message": f"Welcome, {user['first_name']}!"}

@router.get("/otp-status/{email}")
async def otp_status(email: str):
    r = _OTP_STORE.get(email.lower().strip())
    if not r or time.time() > r["expires_at"]:
        return {"has_otp": False, "expires_in": 0}
    return {"has_otp": True, "expires_in": int(r["expires_at"] - time.time())}
