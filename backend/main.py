import os
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from calendar import monthrange
from typing import Literal

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict, field_validator
from sqlalchemy import create_engine, String, Date, DateTime, Numeric, ForeignKey, func, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker, Session, selectinload

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./budget.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

class Movement(Base):
    __tablename__ = "movements"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    category: Mapped[str] = mapped_column(String(80), index=True)
    description: Mapped[str] = mapped_column(String(250), default="")
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    movement_date: Mapped[date] = mapped_column(Date, default=date.today, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class CreditPurchase(Base):
    __tablename__ = "credit_purchases"
    id: Mapped[int] = mapped_column(primary_key=True)
    merchant: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(80))
    purchase_date: Mapped[date] = mapped_column(Date, default=date.today, index=True)
    note: Mapped[str] = mapped_column(String(250), default="")
    items: Mapped[list["CreditItem"]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    payments: Mapped[list["CreditPayment"]] = relationship(cascade="all, delete-orphan", lazy="selectin")
    installments: Mapped[list["CreditInstallment"]] = relationship(cascade="all, delete-orphan", lazy="selectin")

class CreditInstallment(Base):
    __tablename__ = "credit_installments"
    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("credit_purchases.id", ondelete="CASCADE"), index=True)
    due_date: Mapped[date] = mapped_column(Date, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    paid: Mapped[bool] = mapped_column(default=False)

class MedicalAppointment(Base):
    __tablename__ = "medical_appointments"
    id: Mapped[int] = mapped_column(primary_key=True)
    doctor: Mapped[str] = mapped_column(String(160))
    appointment_date: Mapped[date] = mapped_column(Date, index=True)
    consultation_amount: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=Decimal("0"))
    note: Mapped[str] = mapped_column(String(250), default="")
    completed: Mapped[bool] = mapped_column(default=False)

class CreditItem(Base):
    __tablename__ = "credit_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("credit_purchases.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    price: Mapped[Decimal] = mapped_column(Numeric(14, 3))

class CreditPayment(Base):
    __tablename__ = "credit_payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("credit_purchases.id", ondelete="CASCADE"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    payment_date: Mapped[date] = mapped_column(Date, default=date.today)
    note: Mapped[str] = mapped_column(String(250), default="")

Base.metadata.create_all(bind=engine)
app = FastAPI(title="Gestion Budget DT", version="2.0.0", description="Suivi des revenus, dépenses et achats à crédit en dinars tunisiens.")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:8080").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Content-Type"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def clean_text(value: str) -> str:
    return value.strip()

class MovementIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    kind: Literal["income", "expense"]
    category: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=250)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    movement_date: date = Field(default_factory=date.today)

    @field_validator("category")
    @classmethod
    def category_not_blank(cls, value):
        if not value.strip(): raise ValueError("La catégorie est obligatoire")
        return value

class MovementUpdate(MovementIn):
    pass

class ItemIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=160)
    price: Decimal = Field(gt=0, max_digits=14, decimal_places=3)

class InstallmentIn(BaseModel):
    due_date: date
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=3)

class CreditIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    merchant: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=80)
    purchase_date: date = Field(default_factory=date.today)
    note: str = Field(default="", max_length=250)
    items: list[ItemIn] = Field(min_length=1, max_length=100)
    installments: list[InstallmentIn] = Field(default_factory=list, max_length=120)

class AppointmentIn(BaseModel):
    doctor: str = Field(min_length=1, max_length=160)
    appointment_date: date
    consultation_amount: Decimal = Field(ge=0, max_digits=14, decimal_places=3)
    note: str = Field(default="", max_length=250)

class PaymentIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    payment_date: date = Field(default_factory=date.today)
    note: str = Field(default="", max_length=250)

def purchase_dict(p):
    total = sum((Decimal(i.price) for i in p.items), Decimal("0"))
    paid = sum((Decimal(x.amount) for x in p.payments), Decimal("0"))
    return {"id": p.id, "merchant": p.merchant, "category": p.category,
            "purchase_date": p.purchase_date.isoformat(), "note": p.note,
            "items": [{"id": i.id, "name": i.name, "price": float(i.price)} for i in p.items],
            "total": float(total), "paid": float(paid), "remaining": float(max(total-paid, Decimal("0"))),
            "payments": [{"id": x.id, "amount": float(x.amount), "payment_date": x.payment_date.isoformat(), "note": x.note} for x in p.payments],
            "installments": [{"id": i.id, "due_date": i.due_date.isoformat(), "amount": float(i.amount), "paid": i.paid} for i in p.installments]}

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected", "version": app.version}

@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    movements = db.query(Movement).all()
    income = sum((Decimal(m.amount) for m in movements if m.kind == "income"), Decimal("0"))
    expenses = sum((Decimal(m.amount) for m in movements if m.kind == "expense"), Decimal("0"))
    purchases = db.query(CreditPurchase).options(selectinload(CreditPurchase.items), selectinload(CreditPurchase.payments)).all()
    credit_rows = [purchase_dict(p) for p in purchases]
    remaining = sum((Decimal(str(p["remaining"])) for p in credit_rows), Decimal("0"))
    payments = sum((Decimal(x.amount) for p in purchases for x in p.payments), Decimal("0"))
    today = date.today()
    month_rows = [m for m in movements if m.movement_date.year == today.year and m.movement_date.month == today.month]
    month_income = sum((Decimal(m.amount) for m in month_rows if m.kind == "income"), Decimal("0"))
    month_expenses = sum((Decimal(m.amount) for m in month_rows if m.kind == "expense"), Decimal("0"))
    by_category = {}
    for m in month_rows:
        if m.kind == "expense": by_category[m.category] = by_category.get(m.category, Decimal("0")) + Decimal(m.amount)
    monthly = []
    for offset in range(5, -1, -1):
        year, month = today.year, today.month - offset
        while month <= 0: year -= 1; month += 12
        rows = [m for m in movements if m.movement_date.year == year and m.movement_date.month == month]
        monthly.append({"label": f"{month:02d}/{str(year)[-2:]}",
                        "income": float(sum((Decimal(m.amount) for m in rows if m.kind == "income"), Decimal("0"))),
                        "expenses": float(sum((Decimal(m.amount) for m in rows if m.kind == "expense"), Decimal("0")))})
    return {"income": float(income), "expenses": float(expenses), "credit_remaining": float(remaining),
            "credit_payments": float(payments), "balance": float(income-expenses-payments),
            "month_income": float(month_income), "month_expenses": float(month_expenses),
            "month_balance": float(month_income-month_expenses),
            "expense_categories": [{"category": k, "amount": float(v)} for k, v in sorted(by_category.items(), key=lambda x: x[1], reverse=True)],
            "monthly_history": monthly}

@app.get("/api/movements")
def list_movements(db: Session = Depends(get_db)):
    rows = db.query(Movement).order_by(Movement.movement_date.desc(), Movement.id.desc()).all()
    return [{"id": m.id, "kind": m.kind, "category": m.category, "description": m.description,
             "amount": float(m.amount), "movement_date": m.movement_date.isoformat()} for m in rows]

@app.post("/api/movements")
def add_movement(data: MovementIn, db: Session = Depends(get_db)):
    row = Movement(**data.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return {"id": row.id}

@app.put("/api/movements/{movement_id}")
def update_movement(movement_id: int, data: MovementUpdate, db: Session = Depends(get_db)):
    row = db.get(Movement, movement_id)
    if not row: raise HTTPException(404, "Mouvement introuvable")
    for key, value in data.model_dump().items(): setattr(row, key, value)
    db.commit()
    return {"ok": True}

@app.delete("/api/movements/{movement_id}")
def delete_movement(movement_id: int, db: Session = Depends(get_db)):
    row = db.get(Movement, movement_id)
    if not row: raise HTTPException(404, "Mouvement introuvable")
    db.delete(row); db.commit()
    return {"ok": True}

@app.get("/api/credits")
def list_credits(db: Session = Depends(get_db)):
    rows = db.query(CreditPurchase).options(selectinload(CreditPurchase.items), selectinload(CreditPurchase.payments)).order_by(CreditPurchase.purchase_date.desc(), CreditPurchase.id.desc()).all()
    return [purchase_dict(p) for p in rows]

@app.post("/api/credits")
def add_credit(data: CreditIn, db: Session = Depends(get_db)):
    total_items = sum((i.price for i in data.items), Decimal("0"))
    total_installments = sum((i.amount for i in data.installments), Decimal("0"))
    if data.installments and total_installments > total_items:
        raise HTTPException(400, "Le total des échéances dépasse le total de l’achat")
    p = CreditPurchase(merchant=data.merchant, category=data.category, purchase_date=data.purchase_date, note=data.note)
    p.items = [CreditItem(name=i.name, price=i.price) for i in data.items]
    p.installments = [CreditInstallment(due_date=i.due_date, amount=i.amount) for i in data.installments]
    db.add(p); db.commit(); db.refresh(p)
    return {"id": p.id}

@app.post("/api/credits/{credit_id}/payments")
def add_payment(credit_id: int, data: PaymentIn, db: Session = Depends(get_db)):
    p = db.query(CreditPurchase).filter(CreditPurchase.id == credit_id).with_for_update().first()
    if not p: raise HTTPException(404, "Crédit introuvable")
    total = sum((Decimal(i.price) for i in p.items), Decimal("0"))
    paid = sum((Decimal(x.amount) for x in p.payments), Decimal("0"))
    remaining = total - paid
    if remaining <= 0: raise HTTPException(400, "Ce crédit est déjà entièrement payé")
    if data.amount > remaining: raise HTTPException(400, "Le paiement dépasse le reste dû")
    db.add(CreditPayment(purchase_id=credit_id, **data.model_dump())); db.commit()
    return {"ok": True}

@app.get("/api/appointments")
def list_appointments(db: Session = Depends(get_db)):
    rows = db.query(MedicalAppointment).order_by(MedicalAppointment.appointment_date.asc()).all()
    return [{"id": x.id, "doctor": x.doctor, "appointment_date": x.appointment_date.isoformat(),
             "consultation_amount": float(x.consultation_amount), "note": x.note, "completed": x.completed} for x in rows]

@app.post("/api/appointments")
def add_appointment(data: AppointmentIn, db: Session = Depends(get_db)):
    row = MedicalAppointment(**data.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return {"id": row.id}

@app.put("/api/appointments/{appointment_id}/complete")
def complete_appointment(appointment_id: int, db: Session = Depends(get_db)):
    row = db.get(MedicalAppointment, appointment_id)
    if not row: raise HTTPException(404, "Rendez-vous introuvable")
    row.completed = True; db.commit()
    return {"ok": True}

@app.delete("/api/appointments/{appointment_id}")
def delete_appointment(appointment_id: int, db: Session = Depends(get_db)):
    row = db.get(MedicalAppointment, appointment_id)
    if not row: raise HTTPException(404, "Rendez-vous introuvable")
    db.delete(row); db.commit()
    return {"ok": True}

@app.put("/api/installments/{installment_id}/paid")
def mark_installment_paid(installment_id: int, db: Session = Depends(get_db)):
    row = db.get(CreditInstallment, installment_id)
    if not row: raise HTTPException(404, "Échéance introuvable")
    if row.paid: return {"ok": True}
    purchase = db.get(CreditPurchase, row.purchase_id)
    total = sum((Decimal(i.price) for i in purchase.items), Decimal("0"))
    paid_total = sum((Decimal(x.amount) for x in purchase.payments), Decimal("0"))
    if row.amount > total - paid_total:
        raise HTTPException(400, "Le montant de cette échéance dépasse le reste dû")
    row.paid = True
    db.add(CreditPayment(purchase_id=purchase.id, amount=row.amount, payment_date=date.today(), note="Paiement de l’échéance"))
    db.commit()
    return {"ok": True}

@app.get("/api/backup")
def backup(db: Session = Depends(get_db)):
    movements = db.query(Movement).order_by(Movement.id).all()
    credits = db.query(CreditPurchase).options(selectinload(CreditPurchase.items), selectinload(CreditPurchase.payments)).order_by(CreditPurchase.id).all()
    return {"version": 1, "exported_at": datetime.utcnow().isoformat(),
            "movements": [{"kind": m.kind, "category": m.category, "description": m.description, "amount": str(m.amount), "movement_date": m.movement_date.isoformat()} for m in movements],
            "appointments": [{"doctor": a.doctor, "appointment_date": a.appointment_date.isoformat(), "consultation_amount": str(a.consultation_amount), "note": a.note, "completed": a.completed} for a in db.query(MedicalAppointment).all()],
            "credits": [{"merchant": p.merchant, "category": p.category, "purchase_date": p.purchase_date.isoformat(), "note": p.note,
                         "items": [{"name": i.name, "price": str(i.price)} for i in p.items],
                         "payments": [{"amount": str(x.amount), "payment_date": x.payment_date.isoformat(), "note": x.note} for x in p.payments],
                         "installments": [{"due_date": i.due_date.isoformat(), "amount": str(i.amount), "paid": i.paid} for i in p.installments]} for p in credits]}

@app.post("/api/restore")
def restore(payload: dict, db: Session = Depends(get_db)):
    if payload.get("version") != 1: raise HTTPException(400, "Format de sauvegarde non reconnu")
    movements = payload.get("movements", [])
    credits = payload.get("credits", [])
    if not isinstance(movements, list) or not isinstance(credits, list): raise HTTPException(400, "Structure de sauvegarde invalide")
    try:
        staged_movements = []
        staged_credits = []
        for m in movements:
            data = MovementIn(kind=m["kind"], category=m["category"], description=m.get("description", ""), amount=Decimal(str(m["amount"])), movement_date=date.fromisoformat(m["movement_date"]))
            staged_movements.append(Movement(**data.model_dump()))
        for c in credits:
            items = [ItemIn(name=i["name"], price=Decimal(str(i["price"]))) for i in c["items"]]
            payments = [PaymentIn(amount=Decimal(str(x["amount"])), payment_date=date.fromisoformat(x["payment_date"]), note=x.get("note", "")) for x in c.get("payments", [])]
            total = sum((i.price for i in items), Decimal("0")); paid = sum((x.amount for x in payments), Decimal("0"))
            if paid > total: raise ValueError(f"Paiements supérieurs au total pour {c['merchant']}")
            insts = [InstallmentIn(due_date=date.fromisoformat(i["due_date"]), amount=Decimal(str(i["amount"]))) for i in c.get("installments", [])]
            staged_credits.append(CreditPurchase(merchant=c["merchant"].strip(), category=c["category"].strip(), purchase_date=date.fromisoformat(c["purchase_date"]), note=c.get("note", ""), items=[CreditItem(name=i.name, price=i.price) for i in items], payments=[CreditPayment(amount=x.amount, payment_date=x.payment_date, note=x.note) for x in payments], installments=[CreditInstallment(due_date=i.due_date, amount=i.amount, paid=bool(raw.get("paid", False))) for i, raw in zip(insts, c.get("installments", []))]))
        staged_appointments = [MedicalAppointment(doctor=a["doctor"], appointment_date=date.fromisoformat(a["appointment_date"]), consultation_amount=Decimal(str(a.get("consultation_amount", 0))), note=a.get("note", ""), completed=bool(a.get("completed", False))) for a in payload.get("appointments", [])]
        db.add_all(staged_movements + staged_credits + staged_appointments); db.commit()
    except (KeyError, TypeError, ValueError, InvalidOperation) as e:
        db.rollback(); raise HTTPException(400, f"Sauvegarde invalide : {e}")
    return {"ok": True, "movements_imported": len(staged_movements), "credits_imported": len(staged_credits)}

# Sauvegarde automatique quotidienne sur le volume persistant du serveur.
# Les fichiers JSON sont conservés 30 jours ; les sauvegardes manuelles restent disponibles.
import json
import threading
import time
from pathlib import Path

_BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "/app/backups"))
_backup_thread_started = False

def _write_server_backup():
    db = SessionLocal()
    try:
        movements = db.query(Movement).order_by(Movement.id).all()
        credits = db.query(CreditPurchase).options(
            selectinload(CreditPurchase.items),
            selectinload(CreditPurchase.payments),
            selectinload(CreditPurchase.installments),
        ).order_by(CreditPurchase.id).all()
        appointments = db.query(MedicalAppointment).order_by(MedicalAppointment.id).all()
        payload = {
            "version": 1,
            "exported_at": datetime.utcnow().isoformat(),
            "movements": [{"kind": m.kind, "category": m.category, "description": m.description, "amount": str(m.amount), "movement_date": m.movement_date.isoformat()} for m in movements],
            "appointments": [{"doctor": a.doctor, "appointment_date": a.appointment_date.isoformat(), "consultation_amount": str(a.consultation_amount), "note": a.note, "completed": a.completed} for a in appointments],
            "credits": [{"merchant": c.merchant, "category": c.category, "purchase_date": c.purchase_date.isoformat(), "note": c.note,
                "items": [{"name": i.name, "price": str(i.price)} for i in c.items],
                "payments": [{"amount": str(x.amount), "payment_date": x.payment_date.isoformat(), "note": x.note} for x in c.payments],
                "installments": [{"due_date": i.due_date.isoformat(), "amount": str(i.amount), "paid": i.paid} for i in c.installments]} for c in credits]
        }
        _BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        target = _BACKUP_DIR / f"budget-dt-auto-{stamp}.json"
        temp = target.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(target)
        old = sorted(_BACKUP_DIR.glob("budget-dt-auto-*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
        for stale in old[30:]:
            stale.unlink(missing_ok=True)
    except Exception as exc:
        print(f"Échec de la sauvegarde automatique : {exc}", flush=True)
    finally:
        db.close()

def _backup_worker():
    while True:
        _write_server_backup()
        time.sleep(24 * 60 * 60)

@app.on_event("startup")
def start_daily_backup():
    global _backup_thread_started
    if not _backup_thread_started:
        threading.Thread(target=_backup_worker, name="budget-dt-daily-backup", daemon=True).start()
        _backup_thread_started = True
