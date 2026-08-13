"""ZappyFood backend - FastAPI + Motor (MongoDB)"""
import os
import uuid
import asyncio
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


def brl_py(v: float) -> str:
    return f"R$ {v:.2f}".replace(".", ",")


import math

ROAD_FACTOR = 1.3  # aproxima distância de rota a partir da linha reta


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def compute_delivery_quote(store: dict, addr: Optional[dict], subtotal: float = 0.0) -> dict:
    """Retorna taxa de entrega automática por distância.
    Fórmula: taxa = max(taxa_mínima, taxa_base + km * valor_por_km).
    Aplica raio de atendimento e frete grátis acima de X.
    Se faltarem coordenadas, usa taxa base (não é possível medir distância)."""
    base = store.get("base_delivery_fee", store.get("delivery_fee", 5.0) or 5.0)
    per_km = store.get("price_per_km", 1.5)
    min_fee = store.get("min_delivery_fee", base)
    max_radius = store.get("max_radius_km", 8.0)
    free_above = store.get("free_above", 0.0) or 0.0
    est = store.get("est_delivery_min", 30)
    mode = store.get("pricing_mode", "per_km")
    bands = sorted(store.get("delivery_bands", []) or [], key=lambda b: b["max_km"])

    s_lat, s_lng = store.get("lat"), store.get("lng")
    a_lat = addr.get("lat") if addr else None
    a_lng = addr.get("lng") if addr else None

    if s_lat is None or s_lng is None or a_lat is None or a_lng is None:
        # sem coordenadas -> taxa base, entregável
        fee = 0.0 if (free_above and subtotal >= free_above) else round(max(min_fee, base), 2)
        return {
            "distance_km": None, "fee": fee, "deliverable": True,
            "eta_min": est, "reason": "Taxa base (distância indisponível)",
            "max_radius_km": max_radius,
        }

    dist = round(haversine_km(s_lat, s_lng, a_lat, a_lng) * ROAD_FACTOR, 2)

    if mode == "bands" and bands:
        band = next((b for b in bands if dist <= b["max_km"]), None)
        effective_radius = bands[-1]["max_km"]
        deliverable = band is not None
        fee = round(band["fee"], 2) if band else 0.0
        max_radius = effective_radius
    else:
        deliverable = dist <= max_radius
        fee = round(max(min_fee, base + per_km * dist), 2)

    free = bool(free_above and subtotal >= free_above)
    if free and deliverable:
        fee = 0.0
    eta = int(est + round(dist * 3))  # ~3 min por km
    reason = None
    if not deliverable:
        reason = f"Fora do raio de atendimento ({max_radius:.0f} km)"
    elif free:
        reason = "Frete grátis"
    return {
        "distance_km": dist, "fee": fee, "deliverable": deliverable,
        "eta_min": eta, "reason": reason, "max_radius_km": max_radius,
    }


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


class DeliveryBand(BaseModel):
    max_km: float
    fee: float


class StoreIn(BaseModel):
    fantasy_name: str
    cnpj: Optional[str] = ""
    phone: Optional[str] = ""
    category: str  # e.g., Hamburgueria, Pizzaria
    description: Optional[str] = ""
    logo_url: Optional[str] = ""
    banner_url: Optional[str] = ""
    delivery_fee: float = 0.0          # legacy/fallback
    min_order: float = 0.0
    est_delivery_min: int = 30
    address: Optional[dict] = None
    # Distance-based delivery pricing
    lat: Optional[float] = None
    lng: Optional[float] = None
    pricing_mode: str = "per_km"       # "per_km" ou "bands"
    base_delivery_fee: float = 5.0     # taxa base
    price_per_km: float = 1.5          # valor por km
    min_delivery_fee: float = 5.0      # taxa mínima
    max_radius_km: float = 8.0         # raio de atendimento
    free_above: float = 0.0            # frete grátis acima de (0 = desativado)
    delivery_bands: List[DeliveryBand] = []  # faixas: [{max_km, fee}]


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
    discount: float = 0.0   # desconto em R$ (cupom/promoção do lojista)
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


class QuoteIn(BaseModel):
    store_id: str
    address_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    subtotal: float = 0.0


@api.post("/delivery/quote")
async def delivery_quote(data: QuoteIn, user=Depends(current_user)):
    store = await db.stores.find_one({"id": data.store_id}, {"_id": 0})
    if not store:
        raise HTTPException(404, "Loja não encontrada")
    addr = None
    if data.address_id:
        addr = await db.addresses.find_one({"id": data.address_id, "user_id": user["id"]}, {"_id": 0})
    elif data.lat is not None and data.lng is not None:
        addr = {"lat": data.lat, "lng": data.lng}
    q = compute_delivery_quote(store, addr, data.subtotal)
    return q


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
async def push_notification(user_id: str, title: str, body: str, order_id: str = None, ntype: str = "order"):
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "order_id": order_id,
        "title": title,
        "body": body,
        "type": ntype,
        "read": False,
        "created_at": now_utc().isoformat(),
    })


STATUS_NOTIFY = {
    "ACEITO": ("Pedido confirmado ✅", "A loja aceitou seu pedido e vai começar a preparar."),
    "EM_PREPARO": ("Em preparo 🍳", "Seu pedido está sendo preparado."),
    "SAIU_PARA_ENTREGA": ("Saiu para entrega 🛵", "O entregador está a caminho do seu endereço."),
    "FINALIZADO": ("Pedido entregue 🎉", "Seu pedido foi entregue. Bom apetite!"),
    "CANCELADO": ("Pedido cancelado", "Seu pedido foi cancelado."),
}


async def apply_status_change(oid: str, order: dict, new_status: str,
                              store: dict = None, confirmed_by_customer: bool = False,
                              auto: bool = False):
    """Aplica mudança de status: grava histórico, pontos de fidelidade e notificações.
    Reutilizado pela rota manual e pela tarefa de auto-finalização."""
    entry = {"status": new_status, "at": now_utc().isoformat()}
    if auto:
        entry["auto"] = True
    await db.orders.update_one(
        {"id": oid},
        {"$set": {"status": new_status}, "$push": {"status_history": entry}},
    )
    # Loyalty side-effects
    if new_status == "FINALIZADO" and not order.get("points_credited"):
        earned = int(order["total"])  # R$1 = 1 ponto
        if earned > 0:
            await db.users.update_one({"id": order["customer_id"]}, {"$inc": {"loyalty_points": earned}})
        await db.orders.update_one({"id": oid}, {"$set": {"points_credited": True, "points_earned": earned}})
    if new_status == "CANCELADO" and order.get("points_redeemed", 0) > 0 and not order.get("points_refunded"):
        await db.users.update_one({"id": order["customer_id"]}, {"$inc": {"loyalty_points": order["points_redeemed"]}})
        await db.orders.update_one({"id": oid}, {"$set": {"points_refunded": True}})
    # Notify the customer about the status change
    notify = STATUS_NOTIFY.get(new_status)
    if notify:
        title, body = notify
        if new_status == "FINALIZADO" and auto:
            body = "Confirmamos a entrega automaticamente. Bom apetite!"
        await push_notification(order["customer_id"], f"{order['store_name']}: {title}", body, oid, "status")
    # Notify the store owner when delivered
    if new_status == "FINALIZADO":
        if store is None:
            store = await db.stores.find_one({"id": order["store_id"]})
        if store:
            if auto:
                body = f"Pedido de {order['customer_name']} finalizado automaticamente (sem confirmação em 30 min)."
            elif confirmed_by_customer:
                body = f"{order['customer_name']} confirmou o recebimento do pedido."
            else:
                body = f"Pedido de {order['customer_name']} finalizado."
            await push_notification(store["owner_id"], "Pedido entregue ✅", body, oid, "delivered")


def now_utc_helpers_marker():
    pass


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
        prod_discount = max(0.0, p.get("discount", 0.0) or 0.0)
        unit = max(0.0, p["price"] - prod_discount)  # preço com desconto do lojista
        option_labels = []
        if prod_discount > 0:
            option_labels.append(f"Desconto R$ {prod_discount:.2f}")
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
    # Endereço de entrega + taxa automática por distância
    addr = None
    if data.address_id:
        addr = await db.addresses.find_one({"id": data.address_id, "user_id": user["id"]}, {"_id": 0})
    quote = compute_delivery_quote(store, addr, subtotal)
    if not quote["deliverable"]:
        raise HTTPException(400, quote.get("reason") or "Endereço fora da área de entrega")
    delivery_fee = quote["fee"]
    est_delivery_min = quote["eta_min"]
    distance_km = quote["distance_km"]
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
        "est_delivery_min": est_delivery_min,
        "distance_km": distance_km,
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
        "address": addr,
        "status": "AGUARDANDO_CONFIRMACAO",
        "status_history": [{"status": "AGUARDANDO_CONFIRMACAO", "at": now_utc().isoformat()}],
        "points_credited": False,
        "points_refunded": False,
        "created_at": now_utc().isoformat(),
    }
    # reserve redeemed points now
    if redeem > 0:
        await db.users.update_one({"id": user["id"]}, {"$inc": {"loyalty_points": -redeem}})
    await db.orders.insert_one(order)
    # notify store owner about new order
    await push_notification(
        store["owner_id"], "Novo pedido 🛎️",
        f"{user['name']} fez um pedido de {brl_py(order['total'])}.", oid, "new_order",
    )
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
    is_owner = store and store["owner_id"] == user["id"]
    is_customer = order["customer_id"] == user["id"]
    confirmed_by_customer = False
    if data.status == "CANCELADO":
        if not (is_owner or (is_customer and order["status"] == "AGUARDANDO_CONFIRMACAO")):
            raise HTTPException(403, "Não permitido")
    elif data.status == "FINALIZADO" and is_customer and order["status"] == "SAIU_PARA_ENTREGA":
        # Cliente confirma o recebimento do pedido
        confirmed_by_customer = True
    elif not is_owner:
        raise HTTPException(403, "Apenas lojista")
    await apply_status_change(oid, order, data.status, store=store,
                              confirmed_by_customer=confirmed_by_customer)
    return await db.orders.find_one({"id": oid}, {"_id": 0})


# ============== Notification Routes ==============
@api.get("/notifications")
async def list_notifications(user=Depends(current_user)):
    docs = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return docs


@api.get("/notifications/unread_count")
async def unread_count(user=Depends(current_user)):
    n = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"count": n}


@api.post("/notifications/read_all")
async def read_all(user=Depends(current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/{nid}/read")
async def read_one(nid: str, user=Depends(current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


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
        "lat": -23.5505, "lng": -46.6333,
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
        "lat": -23.5629, "lng": -46.6544,
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
        "lat": -23.5475, "lng": -46.6361,
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
            "lat": s["lat"], "lng": s["lng"],
            "base_delivery_fee": s["delivery_fee"], "price_per_km": 1.5,
            "min_delivery_fee": s["delivery_fee"], "max_radius_km": 8.0, "free_above": 0.0,
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
    cliente_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": cliente_id,
        "name": "Demo Cliente",
        "email": "cliente@zappyfood.com",
        "phone": "11988888888",
        "password_hash": hash_password("cliente123"),
        "role": "cliente",
        "active_role": "cliente",
        "loyalty_points": 150,
        "created_at": now_utc().isoformat(),
    })
    # Endereço padrão do cliente (~2 km das lojas) para demonstrar taxa por distância
    await db.addresses.insert_one({
        "id": str(uuid.uuid4()), "user_id": cliente_id, "label": "Casa",
        "street": "Av. Paulista", "number": "1000", "complement": "Apto 52",
        "neighborhood": "Bela Vista", "city": "São Paulo", "state": "SP", "zip": "01310100",
        "lat": -23.5614, "lng": -46.6559, "is_default": True,
        "created_at": now_utc().isoformat(),
    })
    log.info("Seed complete")


AUTO_FINALIZE_AFTER_MIN = 30  # minutos após o horário previsto de entrega


async def auto_finalize_loop():
    """Finaliza automaticamente pedidos 'SAIU_PARA_ENTREGA' que passaram
    de 30 min do horário previsto de entrega sem confirmação do cliente."""
    while True:
        try:
            now = now_utc()
            pending = await db.orders.find({"status": "SAIU_PARA_ENTREGA"}, {"_id": 0}).to_list(500)
            for order in pending:
                try:
                    created = datetime.fromisoformat(order["created_at"])
                    if created.tzinfo is None:
                        created = created.replace(tzinfo=timezone.utc)
                    eta = created + timedelta(minutes=order.get("est_delivery_min", 30))
                    cutoff = eta + timedelta(minutes=AUTO_FINALIZE_AFTER_MIN)
                    if now >= cutoff:
                        await apply_status_change(order["id"], order, "FINALIZADO", auto=True)
                        log.info(f"Auto-finalizado pedido {order['id']}")
                except Exception as e:
                    log.error(f"auto_finalize erro no pedido {order.get('id')}: {e}")
        except Exception as e:
            log.error(f"auto_finalize_loop erro: {e}")
        await asyncio.sleep(60)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await seed_data()
    asyncio.create_task(auto_finalize_loop())


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
