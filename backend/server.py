"""ZappyFood backend - FastAPI + Motor (MongoDB)"""
import os
import uuid
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional, Literal

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
ACCESS_MIN = int(os.environ.get("ACCESS_MINUTES", "60"))
REFRESH_DAYS = int(os.environ.get("REFRESH_DAYS", "30"))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="ZappyFood API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("zappyfood")


# ============== Utils ==============
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(pw: str) -> str:
    if len(pw.encode()) > 72:
        raise HTTPException(422, "Senha muito longa")
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str, role: str, ttype: str, lifetime: timedelta) -> str:
    issued = now_utc()
    payload = {
        "sub": user_id,
        "role": role,
        "type": ttype,
        "iat": issued,
        "exp": issued + lifetime,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str, expected_type: str) -> dict:
    try:
        p = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if p.get("type") != expected_type:
            raise ValueError("bad type")
        return p
    except Exception:
        raise HTTPException(401, "Token inválido ou expirado")


async def current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not creds:
        raise HTTPException(401, "Não autenticado")
    payload = decode_token(creds.credentials, "access")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "Usuário não encontrado")
    return user


def require_role(*roles):
    async def dep(user: dict = Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Permissão insuficiente")
        return user
    return dep


# ============== Models ==============
Role = Literal["cliente", "lojista", "admin"]
OrderStatus = Literal[
    "AGUARDANDO_CONFIRMACAO", "ACEITO", "EM_PREPARO",
    "SAIU_PARA_ENTREGA", "FINALIZADO", "CANCELADO"
]
PaymentMethod = Literal["PIX", "CARTAO", "DINHEIRO"]


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: Optional[str] = None
    password: str = Field(min_length=6, max_length=72)
    role: Role = "cliente"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    role: Role
    active_role: Role
    loyalty_points: int = 0


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut


class RoleSwitchIn(BaseModel):
    active_role: Role


class AddressIn(BaseModel):
    label: str
    street: str
    number: str
    complement: Optional[str] = ""
    neighborhood: str
    city: str
    state: str
    zip: str
    is_default: bool = False
    lat: Optional[float] = None
    lng: Optional[float] = None


class StoreIn(BaseModel):
    fantasy_name: str
    cnpj: Optional[str] = ""
    phone: Optional[str] = ""
    category: str  # e.g., Hamburgueria, Pizzaria
    description: Optional[str] = ""
    logo_url: Optional[str] = ""
    banner_url: Optional[str] = ""
    delivery_fee: float = 0.0
    min_order: float = 0.0
    est_delivery_min: int = 30
    address: Optional[dict] = None


class StoreStatusIn(BaseModel):
    status: Literal["ABERTA", "FECHADA", "PAUSA", "FERIAS"]


class VariationOption(BaseModel):
    name: str
    price_delta: float = 0.0


class VariationGroup(BaseModel):
    name: str
    required: bool = False
    options: List[VariationOption] = []


class Addon(BaseModel):
    name: str
    price: float = 0.0


class ProductIn(BaseModel):
    name: str
    description: Optional[str] = ""
    category: str
    price: float
    image_url: Optional[str] = ""
    stock: int = 100
    available: bool = True
    variation_groups: List[VariationGroup] = []
    addons: List[Addon] = []


class CartItem(BaseModel):
    product_id: str
    quantity: int
    notes: Optional[str] = ""
    variations: dict = {}       # {group_name: option_name}
    addons: List[str] = []      # addon names


class OrderCreateIn(BaseModel):
    store_id: str
    items: List[CartItem]
    address_id: Optional[str] = None
    payment_method: PaymentMethod = "PIX"
    notes: Optional[str] = ""
    coupon_code: Optional[str] = None
    redeem_points: int = 0


class OrderStatusIn(BaseModel):
    status: OrderStatus


class ChatMessageIn(BaseModel):
    text: str


class RatingIn(BaseModel):
    stars: int = Field(ge=1, le=5)
    comment: Optional[str] = ""


# ============== Auth Routes ==============
def to_user_out(user: dict) -> UserOut:
    return UserOut(
        id=user["id"], name=user["name"], email=user["email"],
        phone=user.get("phone", ""), role=user["role"],
        active_role=user.get("active_role", user["role"]),
        loyalty_points=user.get("loyalty_points", 0),
    )


@api.post("/auth/register", response_model=TokenOut, status_code=201)
async def register(data: RegisterIn):
    if data.role == "admin":
        raise HTTPException(403, "Cadastro admin não permitido")
    exists = await db.users.find_one({"email": data.email.lower()})
    if exists:
        raise HTTPException(409, "E-mail já cadastrado")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "name": data.name,
        "email": data.email.lower(),
        "phone": data.phone or "",
        "password_hash": hash_password(data.password),
        "role": data.role,
        "active_role": data.role,
        "loyalty_points": 0,
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    access = make_token(uid, data.role, "access", timedelta(minutes=ACCESS_MIN))
    refresh = make_token(uid, data.role, "refresh", timedelta(days=REFRESH_DAYS))
    return TokenOut(access_token=access, refresh_token=refresh, user=to_user_out(doc))


@api.post("/auth/login", response_model=TokenOut)
async def login(data: LoginIn):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "E-mail ou senha inválidos")
    access = make_token(user["id"], user["role"], "access", timedelta(minutes=ACCESS_MIN))
    refresh = make_token(user["id"], user["role"], "refresh", timedelta(days=REFRESH_DAYS))
    return TokenOut(access_token=access, refresh_token=refresh, user=to_user_out(user))


@api.post("/auth/refresh", response_model=TokenOut)
async def refresh(body: dict):
    rtok = body.get("refresh_token")
    if not rtok:
        raise HTTPException(400, "refresh_token requerido")
    p = decode_token(rtok, "refresh")
    user = await db.users.find_one({"id": p["sub"]})
    if not user:
        raise HTTPException(401, "Usuário não encontrado")
    access = make_token(user["id"], user["role"], "access", timedelta(minutes=ACCESS_MIN))
    refresh_new = make_token(user["id"], user["role"], "refresh", timedelta(days=REFRESH_DAYS))
    return TokenOut(access_token=access, refresh_token=refresh_new, user=to_user_out(user))


@api.get("/auth/me", response_model=UserOut)
async def me(user=Depends(current_user)):
    return to_user_out(user)


@api.get("/loyalty")
async def loyalty(user=Depends(current_user)):
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    pts = fresh.get("loyalty_points", 0)
    return {"points": pts, "value_brl": round(pts * 0.10, 2), "rate": "R$ 1 = 1 ponto • 100 pontos = R$ 10"}


@api.post("/auth/switch-role", response_model=UserOut)
async def switch_role(data: RoleSwitchIn, user=Depends(current_user)):
    if data.active_role == "admin":
        raise HTTPException(403, "Não pode alternar para admin")
    update = {"active_role": data.active_role}
    if data.active_role == "lojista" and user["role"] == "cliente":
        update["role"] = "lojista"
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return to_user_out(fresh)


# ============== Address Routes ==============
@api.get("/addresses")
async def list_addresses(user=Depends(current_user)):
    docs = await db.addresses.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    return docs


@api.post("/addresses")
async def create_address(data: AddressIn, user=Depends(current_user)):
    aid = str(uuid.uuid4())
    count = await db.addresses.count_documents({"user_id": user["id"]})
    make_default = data.is_default or count == 0
    doc = {"id": aid, "user_id": user["id"], **data.dict(), "created_at": now_utc().isoformat()}
    doc["is_default"] = make_default
    if make_default:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    await db.addresses.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.patch("/addresses/{aid}/default")
async def set_default_address(aid: str, user=Depends(current_user)):
    target = await db.addresses.find_one({"id": aid, "user_id": user["id"]})
    if not target:
        raise HTTPException(404, "Endereço não encontrado")
    await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    await db.addresses.update_one({"id": aid}, {"$set": {"is_default": True}})
    return {"ok": True}


@api.delete("/addresses/{aid}")
async def delete_address(aid: str, user=Depends(current_user)):
    await db.addresses.delete_one({"id": aid, "user_id": user["id"]})
    return {"ok": True}


# ============== Store Routes ==============
@api.get("/stores")
async def list_stores(q: Optional[str] = None, category: Optional[str] = None):
    query = {"status": {"$ne": "FECHADA"}}
    if q:
        query["fantasy_name"] = {"$regex": q, "$options": "i"}
    if category:
        query["category"] = category
    docs = await db.stores.find(query, {"_id": 0}).to_list(200)
    return docs


@api.get("/stores/categories")
async def list_categories():
    cats = await db.stores.distinct("category")
    return sorted([c for c in cats if c])


@api.get("/stores/{store_id}")
async def get_store(store_id: str):
    store = await db.stores.find_one({"id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(404, "Loja não encontrada")
    products = await db.products.find({"store_id": store_id}, {"_id": 0}).to_list(500)
    store["products"] = products
    return store


@api.get("/my/store")
async def my_store(user=Depends(require_role("lojista", "admin"))):
    store = await db.stores.find_one({"owner_id": user["id"]}, {"_id": 0})
    return store


@api.post("/my/store")
async def create_or_update_store(data: StoreIn, user=Depends(require_role("lojista", "admin"))):
    existing = await db.stores.find_one({"owner_id": user["id"]})
    payload = data.dict()
    if existing:
        await db.stores.update_one({"id": existing["id"]}, {"$set": payload})
        doc = await db.stores.find_one({"id": existing["id"]}, {"_id": 0})
        return doc
    sid = str(uuid.uuid4())
    doc = {
        "id": sid, "owner_id": user["id"], **payload,
        "status": "ABERTA", "rating": 4.7, "num_reviews": 0,
        "subscription": {"plan": "trial", "status": "ATIVA",
                         "trial_ends_at": (now_utc() + timedelta(days=7)).isoformat()},
        "created_at": now_utc().isoformat(),
    }
    await db.stores.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.patch("/my/store/status")
async def update_store_status(data: StoreStatusIn, user=Depends(require_role("lojista", "admin"))):
    store = await db.stores.find_one({"owner_id": user["id"]})
    if not store:
        raise HTTPException(404, "Sem loja")
    await db.stores.update_one({"id": store["id"]}, {"$set": {"status": data.status}})
    return {"ok": True, "status": data.status}


# ============== Product Routes ==============
@api.get("/my/products")
async def my_products(user=Depends(require_role("lojista", "admin"))):
    store = await db.stores.find_one({"owner_id": user["id"]})
    if not store:
        return []
    return await db.products.find({"store_id": store["id"]}, {"_id": 0}).to_list(500)


@api.post("/my/products")
async def create_product(data: ProductIn, user=Depends(require_role("lojista", "admin"))):
    store = await db.stores.find_one({"owner_id": user["id"]})
    if not store:
        raise HTTPException(400, "Crie uma loja primeiro")
    pid = str(uuid.uuid4())
    doc = {"id": pid, "store_id": store["id"], **data.dict(),
           "created_at": now_utc().isoformat()}
    await db.products.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.patch("/my/products/{pid}")
async def update_product(pid: str, data: ProductIn, user=Depends(require_role("lojista", "admin"))):
    store = await db.stores.find_one({"owner_id": user["id"]})
    if not store:
        raise HTTPException(404, "Sem loja")
    r = await db.products.update_one(
        {"id": pid, "store_id": store["id"]}, {"$set": data.dict()}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Produto não encontrado")
    return await db.products.find_one({"id": pid}, {"_id": 0})


@api.delete("/my/products/{pid}")
async def delete_product(pid: str, user=Depends(require_role("lojista", "admin"))):
    store = await db.stores.find_one({"owner_id": user["id"]})
    if not store:
        raise HTTPException(404, "Sem loja")
    await db.products.delete_one({"id": pid, "store_id": store["id"]})
    return {"ok": True}


# ============== Order Routes ==============
async def _load_products(product_ids: List[str]) -> dict:
    docs = await db.products.find({"id": {"$in": product_ids}}, {"_id": 0}).to_list(500)
    return {p["id"]: p for p in docs}


@api.post("/orders")
async def create_order(data: OrderCreateIn, user=Depends(current_user)):
    store = await db.stores.find_one({"id": data.store_id}, {"_id": 0})
    if not store:
        raise HTTPException(404, "Loja não encontrada")
    products_map = await _load_products([i.product_id for i in data.items])
    if len(products_map) != len(set(i.product_id for i in data.items)):
        raise HTTPException(400, "Produto inválido")
    subtotal = 0.0
    items_snapshot = []
    for it in data.items:
        p = products_map[it.product_id]
        unit = p["price"]
        option_labels = []
        # variation deltas
        for group in p.get("variation_groups", []):
            sel = (it.variations or {}).get(group["name"])
            if sel:
                for opt in group.get("options", []):
                    if opt["name"] == sel:
                        unit += opt.get("price_delta", 0.0)
                        option_labels.append(f"{group['name']}: {sel}")
                        break
        # addon prices
        addon_map = {a["name"]: a["price"] for a in p.get("addons", [])}
        for aname in (it.addons or []):
            if aname in addon_map:
                unit += addon_map[aname]
                option_labels.append(f"+ {aname}")
        line = unit * it.quantity
        subtotal += line
        items_snapshot.append({
            "product_id": p["id"], "name": p["name"], "price": p["price"],
            "unit_price": round(unit, 2), "quantity": it.quantity,
            "line_total": round(line, 2), "notes": it.notes or "",
            "image_url": p.get("image_url", ""),
            "options": option_labels,
            "variations": it.variations or {}, "addons": it.addons or [],
        })
    delivery_fee = store.get("delivery_fee", 0.0)
    discount = 0.0
    if data.coupon_code:
        coupon = await db.coupons.find_one({"code": data.coupon_code.upper(), "store_id": store["id"]})
        if coupon:
            if coupon["type"] == "PERCENT":
                discount = subtotal * (coupon["value"] / 100.0)
            elif coupon["type"] == "FIXED":
                discount = coupon["value"]
            elif coupon["type"] == "FREE_SHIPPING":
                delivery_fee = 0.0
    # Loyalty points redemption (1 point = R$ 0.10)
    fresh_user = await db.users.find_one({"id": user["id"]})
    available_points = fresh_user.get("loyalty_points", 0)
    redeem = max(0, min(int(data.redeem_points or 0), available_points))
    # cap redemption so total never goes below 0
    max_redeem_value = max(0.0, subtotal + delivery_fee - discount)
    if redeem * 0.10 > max_redeem_value:
        redeem = int(max_redeem_value / 0.10)
    points_discount = round(redeem * 0.10, 2)
    total = max(0.0, subtotal + delivery_fee - discount - points_discount)
    oid = str(uuid.uuid4())
    order = {
        "id": oid,
        "customer_id": user["id"],
        "customer_name": user["name"],
        "store_id": store["id"],
        "store_name": store["fantasy_name"],
        "est_delivery_min": store.get("est_delivery_min", 30),
        "items": items_snapshot,
        "subtotal": round(subtotal, 2),
        "delivery_fee": round(delivery_fee, 2),
        "discount": round(discount, 2),
        "points_redeemed": redeem,
        "points_discount": points_discount,
        "total": round(total, 2),
        "payment_method": data.payment_method,
        "notes": data.notes or "",
        "address_id": data.address_id,
        "status": "AGUARDANDO_CONFIRMACAO",
        "status_history": [{"status": "AGUARDANDO_CONFIRMACAO", "at": now_utc().isoformat()}],
        "points_credited": False,
        "points_refunded": False,
        "created_at": now_utc().isoformat(),
    }
    # attach address snapshot
    if data.address_id:
        addr = await db.addresses.find_one({"id": data.address_id, "user_id": user["id"]}, {"_id": 0})
        order["address"] = addr
    # reserve redeemed points now
    if redeem > 0:
        await db.users.update_one({"id": user["id"]}, {"$inc": {"loyalty_points": -redeem}})
    await db.orders.insert_one(order)
    return {k: v for k, v in order.items() if k != "_id"}


@api.get("/orders")
async def list_my_orders(user=Depends(current_user)):
    docs = await db.orders.find({"customer_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@api.get("/orders/{oid}")
async def get_order(oid: str, user=Depends(current_user)):
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Pedido não encontrado")
    # allow customer or store owner
    if order["customer_id"] != user["id"]:
        store = await db.stores.find_one({"id": order["store_id"]})
        if not store or store["owner_id"] != user["id"]:
            raise HTTPException(403, "Sem acesso")
    return order


@api.get("/my/store/orders")
async def store_orders(user=Depends(require_role("lojista", "admin"))):
    store = await db.stores.find_one({"owner_id": user["id"]})
    if not store:
        return []
    return await db.orders.find({"store_id": store["id"]}, {"_id": 0}).sort("created_at", -1).to_list(300)


@api.patch("/orders/{oid}/status")
async def update_order_status(oid: str, data: OrderStatusIn, user=Depends(current_user)):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(404, "Pedido não encontrado")
    store = await db.stores.find_one({"id": order["store_id"]})
    # store owner or customer (customer can only cancel while AGUARDANDO)
    is_owner = store and store["owner_id"] == user["id"]
    is_customer = order["customer_id"] == user["id"]
    if data.status == "CANCELADO":
        if not (is_owner or (is_customer and order["status"] == "AGUARDANDO_CONFIRMACAO")):
            raise HTTPException(403, "Não permitido")
    else:
        if not is_owner:
            raise HTTPException(403, "Apenas lojista")
    entry = {"status": data.status, "at": now_utc().isoformat()}
    await db.orders.update_one(
        {"id": oid},
        {"$set": {"status": data.status}, "$push": {"status_history": entry}},
    )
    # Loyalty side-effects
    if data.status == "FINALIZADO" and not order.get("points_credited"):
        earned = int(order["total"])  # R$1 = 1 ponto
        if earned > 0:
            await db.users.update_one({"id": order["customer_id"]}, {"$inc": {"loyalty_points": earned}})
        await db.orders.update_one({"id": oid}, {"$set": {"points_credited": True, "points_earned": earned}})
    if data.status == "CANCELADO" and order.get("points_redeemed", 0) > 0 and not order.get("points_refunded"):
        await db.users.update_one({"id": order["customer_id"]}, {"$inc": {"loyalty_points": order["points_redeemed"]}})
        await db.orders.update_one({"id": oid}, {"$set": {"points_refunded": True}})
    return await db.orders.find_one({"id": oid}, {"_id": 0})


@api.post("/orders/{oid}/rating")
async def rate_order(oid: str, data: RatingIn, user=Depends(current_user)):
    order = await db.orders.find_one({"id": oid})
    if not order or order["customer_id"] != user["id"]:
        raise HTTPException(404, "Pedido não encontrado")
    await db.orders.update_one({"id": oid}, {"$set": {"rating": data.dict()}})
    # update store rating aggregate
    all_r = await db.orders.find({"store_id": order["store_id"], "rating": {"$exists": True}}, {"_id": 0, "rating": 1}).to_list(1000)
    if all_r:
        avg = sum(r["rating"]["stars"] for r in all_r) / len(all_r)
        await db.stores.update_one({"id": order["store_id"]}, {"$set": {"rating": round(avg, 1), "num_reviews": len(all_r)}})
    return {"ok": True}


# ============== Chat Routes ==============
@api.get("/orders/{oid}/chat")
async def list_chat(oid: str, user=Depends(current_user)):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(404, "Pedido não encontrado")
    store = await db.stores.find_one({"id": order["store_id"]})
    if order["customer_id"] != user["id"] and (not store or store["owner_id"] != user["id"]):
        raise HTTPException(403, "Sem acesso")
    msgs = await db.chat.find({"order_id": oid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return msgs


@api.post("/orders/{oid}/chat")
async def post_chat(oid: str, data: ChatMessageIn, user=Depends(current_user)):
    order = await db.orders.find_one({"id": oid})
    if not order:
        raise HTTPException(404, "Pedido não encontrado")
    store = await db.stores.find_one({"id": order["store_id"]})
    if order["customer_id"] != user["id"] and (not store or store["owner_id"] != user["id"]):
        raise HTTPException(403, "Sem acesso")
    sender_role = "cliente" if order["customer_id"] == user["id"] else "lojista"
    msg = {
        "id": str(uuid.uuid4()),
        "order_id": oid,
        "sender_id": user["id"],
        "sender_name": user["name"],
        "sender_role": sender_role,
        "text": data.text,
        "created_at": now_utc().isoformat(),
    }
    await db.chat.insert_one(msg)
    return {k: v for k, v in msg.items() if k != "_id"}


# ============== Lojista Dashboard ==============
@api.get("/my/dashboard")
async def dashboard(user=Depends(require_role("lojista", "admin"))):
    store = await db.stores.find_one({"owner_id": user["id"]}, {"_id": 0})
    if not store:
        return {"has_store": False}
    today_iso = now_utc().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    orders = await db.orders.find({"store_id": store["id"]}, {"_id": 0}).to_list(500)
    today_orders = [o for o in orders if o["created_at"] >= today_iso]
    revenue_today = sum(o["total"] for o in today_orders if o["status"] == "FINALIZADO")
    active_orders = [o for o in orders if o["status"] in ("AGUARDANDO_CONFIRMACAO", "ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA")]
    total_finalized = [o for o in orders if o["status"] == "FINALIZADO"]
    return {
        "has_store": True,
        "store": store,
        "revenue_today": round(revenue_today, 2),
        "orders_today": len(today_orders),
        "active_orders": len(active_orders),
        "total_finalized": len(total_finalized),
        "avg_ticket": round(sum(o["total"] for o in total_finalized) / len(total_finalized), 2) if total_finalized else 0.0,
        "rating": store.get("rating", 0),
    }


# ============== Seed ==============
DEMO_STORES = [
    {
        "fantasy_name": "Burger House",
        "category": "Hamburgueria",
        "description": "Os melhores burgers artesanais da cidade",
        "banner_url": "https://images.unsplash.com/photo-1667329829058-ac191ba4a905?w=1200&q=80",
        "logo_url": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&q=80",
        "delivery_fee": 6.90, "min_order": 20.0, "est_delivery_min": 35, "rating": 4.8,
        "products": [
            ("X-Burger Clássico", "Pão, hambúrguer 150g, queijo, alface, tomate", 24.90,
             "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80", "Lanches"),
            ("X-Bacon", "Pão, hambúrguer 150g, queijo, bacon crocante", 29.90,
             "https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=600&q=80", "Lanches"),
            ("Batata Frita", "Porção 300g crocante", 14.90,
             "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&q=80", "Acompanhamentos"),
            ("Coca-Cola 350ml", "Lata gelada", 6.00,
             "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&q=80", "Bebidas"),
        ],
    },
    {
        "fantasy_name": "Pizzaria Bella",
        "category": "Pizzaria",
        "description": "Pizzas napolitanas com massa fermentada 48h",
        "banner_url": "https://images.unsplash.com/photo-1576458088443-04a19bb13da6?w=1200&q=80",
        "logo_url": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&q=80",
        "delivery_fee": 8.00, "min_order": 30.0, "est_delivery_min": 45, "rating": 4.7,
        "products": [
            ("Margherita", "Molho, muçarela, manjericão", 49.90,
             "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&q=80", "Pizzas"),
            ("Calabresa", "Molho, muçarela, calabresa, cebola", 54.90,
             "https://images.unsplash.com/photo-1548369937-47519962c11a?w=600&q=80", "Pizzas"),
            ("Portuguesa", "Presunto, ovos, ervilha, cebola", 59.90,
             "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80", "Pizzas"),
        ],
    },
    {
        "fantasy_name": "Açaí Tropical",
        "category": "Açaí",
        "description": "Açaí puro batido na hora",
        "banner_url": "https://images.unsplash.com/photo-1654923064926-be7e64267a31?w=1200&q=80",
        "logo_url": "https://images.unsplash.com/photo-1590301157890-4810ed352733?w=200&q=80",
        "delivery_fee": 5.00, "min_order": 15.0, "est_delivery_min": 25, "rating": 4.9,
        "products": [
            ("Açaí 500ml", "Açaí puro + 3 acompanhamentos", 22.90,
             "https://images.unsplash.com/photo-1590301157890-4810ed352733?w=600&q=80", "Açaí"),
            ("Açaí 300ml", "Açaí puro + 2 acompanhamentos", 16.90,
             "https://images.unsplash.com/photo-1590080875515-40a4b57bd591?w=600&q=80", "Açaí"),
        ],
    },
]


DEMO_EXTRAS = {
    "X-Burger Clássico": {
        "variation_groups": [
            {"name": "Tamanho", "required": True, "options": [
                {"name": "Simples", "price_delta": 0.0},
                {"name": "Duplo", "price_delta": 8.0},
            ]},
            {"name": "Ponto da carne", "required": True, "options": [
                {"name": "Ao ponto", "price_delta": 0.0},
                {"name": "Bem passado", "price_delta": 0.0},
            ]},
        ],
        "addons": [
            {"name": "Bacon extra", "price": 4.0},
            {"name": "Cheddar extra", "price": 3.0},
            {"name": "Ovo", "price": 2.5},
        ],
    },
    "X-Bacon": {
        "variation_groups": [
            {"name": "Tamanho", "required": True, "options": [
                {"name": "Simples", "price_delta": 0.0},
                {"name": "Duplo", "price_delta": 9.0},
            ]},
        ],
        "addons": [
            {"name": "Cheddar extra", "price": 3.0},
            {"name": "Cebola caramelizada", "price": 3.5},
        ],
    },
    "Açaí 500ml": {
        "variation_groups": [
            {"name": "Cremosidade", "required": True, "options": [
                {"name": "Tradicional", "price_delta": 0.0},
                {"name": "Zero açúcar", "price_delta": 2.0},
            ]},
        ],
        "addons": [
            {"name": "Granola", "price": 2.0},
            {"name": "Leite condensado", "price": 2.5},
            {"name": "Morango", "price": 3.5},
            {"name": "Paçoca", "price": 2.0},
        ],
    },
}


async def seed_data():
    if await db.stores.count_documents({}) > 0:
        return
    # Demo lojista
    lojista_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": lojista_id,
        "name": "Demo Lojista",
        "email": "lojista@zappyfood.com",
        "phone": "11999990000",
        "password_hash": hash_password("lojista123"),
        "role": "lojista",
        "active_role": "lojista",
        "loyalty_points": 0,
        "created_at": now_utc().isoformat(),
    })
    for s in DEMO_STORES:
        sid = str(uuid.uuid4())
        await db.stores.insert_one({
            "id": sid, "owner_id": lojista_id,
            "fantasy_name": s["fantasy_name"], "category": s["category"],
            "description": s["description"], "banner_url": s["banner_url"],
            "logo_url": s["logo_url"], "delivery_fee": s["delivery_fee"],
            "min_order": s["min_order"], "est_delivery_min": s["est_delivery_min"],
            "rating": s["rating"], "num_reviews": 42,
            "status": "ABERTA", "phone": "1130000000",
            "subscription": {"plan": "monthly", "status": "ATIVA"},
            "created_at": now_utc().isoformat(),
        })
        for name, desc, price, img, cat in s["products"]:
            extras = DEMO_EXTRAS.get(name, {})
            await db.products.insert_one({
                "id": str(uuid.uuid4()),
                "store_id": sid, "name": name, "description": desc,
                "category": cat, "price": price, "image_url": img,
                "stock": 100, "available": True,
                "variation_groups": extras.get("variation_groups", []),
                "addons": extras.get("addons", []),
                "created_at": now_utc().isoformat(),
            })
    # Demo cliente (com pontos de fidelidade para testar resgate)
    await db.users.insert_one({
        "id": str(uuid.uuid4()),
        "name": "Demo Cliente",
        "email": "cliente@zappyfood.com",
        "phone": "11988888888",
        "password_hash": hash_password("cliente123"),
        "role": "cliente",
        "active_role": "cliente",
        "loyalty_points": 150,
        "created_at": now_utc().isoformat(),
    })
    log.info("Seed complete")


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await seed_data()


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/health")
async def health():
    return {"ok": True, "service": "zappyfood"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
