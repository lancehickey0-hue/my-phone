from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Literal, Optional
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage

from auth import create_access_token, hash_password, require_user, verify_password



ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# Create the main app without a prefix
app = FastAPI(title="My Phone API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ---------------------------
# Constants
# ---------------------------
DEFAULT_WAKE_PHRASE = "my phone where are you"
DEFAULT_STOP_PHRASE = "i've found you"

SYSTEM_PROMPT = (
    "You are My Phone, a helpful voice-controlled assistant. "
    "Be concise, actionable, and ask a clarifying question when needed. "
    "If asked to do something you cannot do in-app, explain what you can do instead."
)

# ---------------------------
# Models
# ---------------------------
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class DeviceRegisterIn(BaseModel):
    device_id: str
    platform: str
    user_id: Optional[str] = None


class LocatorSettings(BaseModel):
    device_id: str
    enabled: bool = True
    wake_phrase: str = DEFAULT_WAKE_PHRASE
    stop_phrase: str = DEFAULT_STOP_PHRASE
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LocatorSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    wake_phrase: Optional[str] = None
    stop_phrase: Optional[str] = None


class DeviceRegisterOut(BaseModel):
    ok: bool = True
    device_id: str
    settings: LocatorSettings


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatRequest(BaseModel):
    device_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str


class ChatHistoryResponse(BaseModel):
    device_id: str

class AuthRegisterIn(BaseModel):
    email: str
    password: str


class AuthLoginIn(BaseModel):
    email: str
    password: str


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

    messages: List[ChatMessage]


# ---------------------------
# Helpers
# ---------------------------
def _normalize_phrase(text: str) -> str:
    return " ".join(text.strip().lower().split())


async def _get_or_create_locator_settings(device_id: str) -> LocatorSettings:
    existing = await db.locator_settings.find_one({"device_id": device_id})
    if existing:
        return LocatorSettings(**existing)

    settings = LocatorSettings(device_id=device_id)
    await db.locator_settings.insert_one(settings.model_dump())
    return settings


async def _append_chat_message(device_id: str, role: str, content: str) -> None:
    await db.chat_messages.insert_one(
        {
            "device_id": device_id,
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc),
        }
    )


async def _get_chat_history(device_id: str, limit: int = 20) -> List[ChatMessage]:
    docs = (
        await db.chat_messages.find({"device_id": device_id})
        .sort("timestamp", -1)
        .limit(limit)
        .to_list(length=limit)
    )
    # reverse to chronological
    return [ChatMessage(**d) for d in reversed(docs)]


def _build_chat_prompt(history: List[ChatMessage], new_user_message: str) -> str:
    lines: List[str] = []
    if history:
        lines.append("Conversation so far:")
        for m in history:
            speaker = "User" if m.role == "user" else "Assistant"
            lines.append(f"{speaker}: {m.content}")
        lines.append("---")

    lines.append(f"User: {new_user_message}")
    lines.append("Assistant:")
    return "\n".join(lines)


async def _send_llm_chat(device_id: str, prompt: str) -> str:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    chat = LlmChat(api_key=api_key, session_id=device_id, system_message=SYSTEM_PROMPT).with_model(
        "openai", "gpt-5.2"
    )
    # emergentintegrations returns plain string
    reply = await chat.send_message(UserMessage(text=prompt))
    if not isinstance(reply, str) or not reply.strip():
        raise HTTPException(status_code=502, detail="Empty LLM response")
    return reply.strip()


# ---------------------------
# Routes
# ---------------------------

@api_router.post("/auth/register", response_model=AuthOut)
async def auth_register(body: AuthRegisterIn):
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="valid email required")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="password must be at least 8 characters")

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="email already registered")

    user_id = str(uuid.uuid4())
    await db.users.insert_one(
        {
            "_id": user_id,
            "email": email,
            "password_hash": hash_password(body.password),
            "created_at": datetime.now(timezone.utc),
        }
    )

    token = create_access_token(sub=user_id, extra={"email": email})
    return AuthOut(access_token=token)


@api_router.post("/auth/login", response_model=AuthOut)
async def auth_login(body: AuthLoginIn):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="invalid credentials")

    if not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="invalid credentials")

    token = create_access_token(sub=str(user.get("_id")), extra={"email": email})
    return AuthOut(access_token=token)


class SecurityPinSetIn(BaseModel):
    pin: str


class VerifyPinIn(BaseModel):
    pin: str


class PushTokenIn(BaseModel):
    device_id: str
    expo_push_token: str


class LocatorCommandIn(BaseModel):
    device_id: str

@api_router.post("/security/pin/set")
async def set_security_pin(body: SecurityPinSetIn, user=Depends(require_user)):
    pin = body.pin.strip()
    if len(pin) < 4 or len(pin) > 12:
        raise HTTPException(status_code=400, detail="pin must be 4-12 chars")

    await db.users.update_one(
        {"_id": user["sub"]},
        {"$set": {"security_pin_hash": hash_password(pin), "pin_updated_at": datetime.now(timezone.utc)}},
        upsert=False,
    )
    return {"ok": True}


@api_router.post("/security/pin/verify")
async def verify_security_pin(body: VerifyPinIn, user=Depends(require_user)):
    u = await db.users.find_one({"_id": user["sub"]})
    if not u or not u.get("security_pin_hash"):
        raise HTTPException(status_code=400, detail="security pin not set")

    if not verify_password(body.pin.strip(), u.get("security_pin_hash", "")):
        raise HTTPException(status_code=401, detail="invalid pin")

    return {"ok": True}


@api_router.post("/devices/push-token")
async def set_push_token(body: PushTokenIn, user=Depends(require_user)):
    # Ensure device belongs to user
    device = await db.devices.find_one({"device_id": body.device_id})
    if not device or device.get("user_id") != user["sub"]:
        raise HTTPException(status_code=403, detail="device not owned by user")

    await db.devices.update_one(
        {"device_id": body.device_id},
        {"$set": {"expo_push_token": body.expo_push_token, "push_updated_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True}


@api_router.post("/locator/remote/start")
async def remote_start_locator(body: LocatorCommandIn, user=Depends(require_user)):
    device = await db.devices.find_one({"device_id": body.device_id})
    if not device or device.get("user_id") != user["sub"]:
        raise HTTPException(status_code=403, detail="device not owned by user")
    if not device.get("expo_push_token"):
        raise HTTPException(status_code=400, detail="device has no push token")

    # For MVP: store a command in DB (push delivery wired next)
    await db.locator_commands.insert_one(
        {
            "device_id": body.device_id,
            "user_id": user["sub"],
            "type": "start",
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"ok": True, "queued": True}


@api_router.post("/locator/remote/stop")
async def remote_stop_locator(body: LocatorCommandIn, user=Depends(require_user)):
    device = await db.devices.find_one({"device_id": body.device_id})
    if not device or device.get("user_id") != user["sub"]:
        raise HTTPException(status_code=403, detail="device not owned by user")
    if not device.get("expo_push_token"):
        raise HTTPException(status_code=400, detail="device has no push token")

    await db.locator_commands.insert_one(
        {
            "device_id": body.device_id,
            "user_id": user["sub"],
            "type": "stop",
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"ok": True, "queued": True}

@api_router.get("/")
async def root():
    return {"message": "My Phone API"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(client_name=input.client_name)
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


@api_router.post("/devices/register", response_model=DeviceRegisterOut)
async def register_device(body: DeviceRegisterIn):
    if not body.device_id.strip():
        raise HTTPException(status_code=400, detail="device_id is required")

    await db.devices.update_one(
        {"device_id": body.device_id},
        {
            "$set": {
                "device_id": body.device_id,
                "platform": body.platform,
                "last_seen_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
        },
        upsert=True,
    )

    settings = await _get_or_create_locator_settings(body.device_id)
    return DeviceRegisterOut(device_id=body.device_id, settings=settings)


@api_router.get("/locator/settings/{device_id}", response_model=LocatorSettings)
async def get_locator_settings(device_id: str):
    return await _get_or_create_locator_settings(device_id)


@api_router.put("/locator/settings/{device_id}", response_model=LocatorSettings)
async def update_locator_settings(device_id: str, body: LocatorSettingsUpdate):
    settings = await _get_or_create_locator_settings(device_id)

    updated = settings.model_dump()
    if body.enabled is not None:
        updated["enabled"] = body.enabled
    if body.wake_phrase is not None:
        updated["wake_phrase"] = _normalize_phrase(body.wake_phrase)
    if body.stop_phrase is not None:
        updated["stop_phrase"] = _normalize_phrase(body.stop_phrase)
    updated["updated_at"] = datetime.now(timezone.utc)

    await db.locator_settings.update_one({"device_id": device_id}, {"$set": updated}, upsert=True)
    return LocatorSettings(**updated)


@api_router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest):
    if not body.device_id.strip():
        raise HTTPException(status_code=400, detail="device_id is required")
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="message is required")

    # Persist user message
    await _append_chat_message(body.device_id, "user", body.message.strip())

    history = await _get_chat_history(body.device_id, limit=20)
    prompt = _build_chat_prompt(history[:-1], body.message.strip())
    reply = await _send_llm_chat(body.device_id, prompt)

    await _append_chat_message(body.device_id, "assistant", reply)
    return ChatResponse(reply=reply)


@api_router.get("/chat/history/{device_id}", response_model=ChatHistoryResponse)
async def chat_history(device_id: str):
    msgs = await _get_chat_history(device_id, limit=50)
    return ChatHistoryResponse(device_id=device_id, messages=msgs)


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
