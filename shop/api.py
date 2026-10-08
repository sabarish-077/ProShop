import json
import logging
import hashlib
import hmac
from binascii import Error as Base64Error
from urllib.parse import urlencode
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import timedelta

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.password_validation import validate_password
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.core.validators import validate_email
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils import timezone
import requests
from django.db import DatabaseError, IntegrityError, transaction
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_POST

from .models import Order, OrderItem, Product

logger = logging.getLogger("shop")
User = get_user_model()
CENT = Decimal("0.01")
TAX_RATE = Decimal("0.0825")
GIFT_WRAP_COST = Decimal("25.00")
GIFT_WRAP_FREE_OVER = Decimal("96150.00")
PROTECTION_PLAN_COST = Decimal("120.00")
PROMO_CODES = {"AUTUMN2025": Decimal("0.10"), "VIPNOIR": Decimal("0.15")}


def _json_body(request, max_bytes=32_768):
    if len(request.body) > max_bytes:
        raise ValueError("Request is too large.")
    payload = json.loads(request.body.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Invalid request.")
    return payload


def _error(message, status=400):
    return JsonResponse({"ok": False, "error": message}, status=status)


def _available_stock(product):
    try:
        return max(0, int((product.catalog_data or {}).get("stock", 1)))
    except (TypeError, ValueError):
        logger.error("Invalid stock value for product %s", product.pk)
        return 0


def _send_verification(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    query = urlencode({"verify": uid, "token": token})
    verify_url = f"{settings.SITE_URL.rstrip('/')}/account.html?{query}"
    send_mail(
        "Verify your ProShop account",
        f"Hello {user.first_name or 'there'},\n\nOpen this link to verify your email, then select Verify account:\n{verify_url}\n\nIf you did not create this account, you can ignore this email.",
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
    )


def _razorpay_client():
    key_id = settings.RAZORPAY_KEY_ID
    key_secret = settings.RAZORPAY_KEY_SECRET
    if not key_id or not key_secret:
        raise RuntimeError("Online payments are not configured yet.")
    return (key_id, key_secret), key_id


@require_GET
def products(request):
    queryset = Product.objects.all()
    q = request.GET.get("q", "").strip()[:100]
    department = request.GET.get("department", "").strip()[:120]
    brand = request.GET.get("brand", "").strip()[:120]
    if q:
        queryset = queryset.filter(title__icontains=q) | queryset.filter(brand__icontains=q)
    if department:
        queryset = queryset.filter(department=department)
    if brand:
        queryset = queryset.filter(brand=brand)
    try:
        return JsonResponse({"products": [product.as_catalog_dict() for product in queryset]})
    except (DatabaseError, ValueError):
        logger.exception("Could not read product catalog")
        return _error("The product list is temporarily unavailable. Please try again.", 503)


@require_GET
def product_detail(request, product_id):
    try:
        product = Product.objects.get(pk=product_id)
    except Product.DoesNotExist:
        return _error("Product not found.", 404)
    except DatabaseError:
        logger.exception("Could not read product %s", product_id)
        return _error("Product details are temporarily unavailable. Please try again.", 503)
    return JsonResponse({"product": product.as_catalog_dict()})


@require_GET
@never_cache
def auth_status(request):
    try:
        user = request.user
        authenticated = user.is_authenticated
    except DatabaseError:
        logger.exception("Could not read account session")
        return _error("Account service is temporarily unavailable.", 503)
    return JsonResponse({
        "authenticated": authenticated,
        "user": {
            "name": user.get_full_name() or user.get_username(),
            "email": user.email,
            "is_staff": user.is_staff,
        } if authenticated else None,
    })


@require_POST
def register(request):
    try:
        payload = _json_body(request)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return _error("Please check the information and try again.")
    email = str(payload.get("email", "")).strip().lower()
    name = str(payload.get("name", "")).strip()
    password = payload.get("password", "")
    try:
        validate_email(email)
    except ValidationError:
        return _error("Enter a valid name and email address.")
    if not name or len(email) > 150 or len(name) > 150:
        return _error("Enter a valid name and email address.")
    if not isinstance(password, str) or not password or len(password) > 256:
        return _error("Enter a valid password.")
    user = User(username=email, email=email, first_name=name, is_active=False)
    try:
        validate_password(password, user)
    except ValidationError as exc:
        return _error(" ".join(exc.messages))
    try:
        with transaction.atomic():
            user.save()
            user.set_password(password)
            user.save(update_fields=["password"])
    except IntegrityError:
        return _error("An account with this email already exists.", 409)
    except DatabaseError:
        logger.exception("Could not create account")
        return _error("Account service is temporarily unavailable. Please try again.", 503)
    try:
        _send_verification(user)
    except Exception:
        logger.exception("Could not send verification email to newly registered account")
        return JsonResponse({"ok": True, "verification_sent": False}, status=201)
    return JsonResponse({"ok": True, "verification_sent": True}, status=201)


@require_POST
def verify_email(request):
    try:
        payload = _json_body(request)
        uid = force_str(urlsafe_base64_decode(payload.get("uid", "")))
        token = payload.get("token", "")
    except (ValueError, TypeError, UnicodeDecodeError, Base64Error, json.JSONDecodeError):
        return _error("This verification link is invalid or has expired.", 400)
    try:
        user = User.objects.get(pk=uid)
    except User.DoesNotExist:
        return _error("This verification link is invalid or has expired.", 400)
    except DatabaseError:
        logger.exception("Could not find account for email verification")
        return _error("Account service is temporarily unavailable. Please try again.", 503)
    if not isinstance(token, str) or not default_token_generator.check_token(user, token):
        return _error("This verification link is invalid or has expired.", 400)
    if not user.is_active:
        user.is_active = True
        try:
            user.save(update_fields=["is_active"])
        except DatabaseError:
            logger.exception("Could not activate account after email verification")
            return _error("Account service is temporarily unavailable. Please try again.", 503)
    return JsonResponse({"ok": True})


@require_POST
def resend_verification(request):
    try:
        payload = _json_body(request)
        email = str(payload.get("email", "")).strip().lower()
        validate_email(email)
        user = User.objects.filter(email=email, is_active=False).first()
        if user:
            _send_verification(user)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError, ValidationError):
        pass
    except Exception:
        logger.exception("Could not process verification email resend")
    return JsonResponse({"ok": True})


@require_POST
def login_view(request):
    try:
        payload = _json_body(request)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return _error("Enter your email and password.")
    email = str(payload.get("email", "")).strip().lower()
    password = payload.get("password", "")
    if not email or not isinstance(password, str):
        return _error("Enter your email and password.")
    try:
        user = authenticate(request, username=email, password=password)
    except DatabaseError:
        logger.exception("Could not authenticate account")
        return _error("Account service is temporarily unavailable. Please try again.", 503)
    if user is None:
        return _error("Email or password is incorrect.", 401)
    login(request, user)
    return JsonResponse({"ok": True, "user": {"name": user.get_full_name() or email,
                                                "email": user.email, "is_staff": user.is_staff}})


@require_POST
def logout_view(request):
    try:
        logout(request)
    except DatabaseError:
        logger.exception("Could not close account session")
        return _error("Account service is temporarily unavailable. Please try again.", 503)
    return JsonResponse({"ok": True})


def _order_json(order):
    return {
        "reference": order.reference,
        "status": order.status,
        "razorpay_order_id": order.razorpay_order_id,
        "total": str(order.total),
        "gift_packaging": order.gift_packaging,
        "gift_wrap_cost": str(order.gift_wrap_cost),
        "promo_code": order.promo_code,
        "created_at": order.created_at.isoformat(),
        "items": [{"title": item.title_snapshot, "quantity": item.quantity,
                   "unit_price": str(item.unit_price)} for item in order.items.all()],
    }


def _release_expired_orders():
    """Release inventory from abandoned payment attempts after one hour."""
    stale_orders = list(Order.objects.select_for_update().filter(
        status=Order.Status.PENDING,
        created_at__lt=timezone.now() - timedelta(hours=1),
    ).prefetch_related("items")[:200])
    for stale in stale_orders:
        for item in stale.items.all():
            product = Product.objects.select_for_update().filter(pk=item.product_id).first()
            if product is None:
                continue
            stock = _available_stock(product) + item.quantity
            product.catalog_data = {**(product.catalog_data or {}), "stock": stock}
            product.in_stock = stock > 0
            product.save(update_fields=["catalog_data", "in_stock", "updated_at"])
        stale.status = Order.Status.CANCELLED
        stale.save(update_fields=["status"])


@never_cache
def orders(request):
    if request.method == "POST":
        return create_order(request)
    if request.method != "GET":
        return _error("Method not allowed.", 405)
    if not request.user.is_authenticated:
        return _error("Please sign in to view your orders.", 401)
    try:
        order_list = Order.objects.filter(user=request.user).prefetch_related("items")[:100]
        return JsonResponse({"orders": [_order_json(order) for order in order_list]})
    except DatabaseError:
        logger.exception("Could not read orders for user %s", request.user.pk)
        return _error("Your orders are temporarily unavailable. Please try again.", 503)


@require_POST
def create_order(request):
    if not request.user.is_authenticated:
        return _error("Please sign in before placing an order.", 401)
    if not request.user.is_active:
        return _error("Verify your email before placing an order.", 403)
    try:
        razorpay_auth, razorpay_key_id = _razorpay_client()
    except RuntimeError:
        return _error("Online payments are temporarily unavailable. Please try again later.", 503)
    try:
        payload = _json_body(request)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return _error("Please check your order and try again.")
    raw_items = payload.get("items")
    address = payload.get("address")
    if not isinstance(raw_items, list) or not 1 <= len(raw_items) <= 50:
        return _error("Your bag must have between 1 and 50 products.")
    if not isinstance(address, dict):
        return _error("Enter your delivery address.")
    fields = {key: str(address.get(key, "")).strip() for key in ("address", "city", "region", "postal_code")}
    max_lengths = {"address": 300, "city": 120, "region": 120, "postal_code": 24}
    if any(not fields[key] or len(fields[key]) > max_lengths[key] for key in fields):
        return _error("Complete each delivery address field.")
    recipient_name = " ".join(str(address.get(key, "")).strip() for key in ("first_name", "last_name")).strip()
    if not recipient_name or len(recipient_name) > 150:
        return _error("Enter a valid delivery name.")
    quantities = {}
    plan_items = set()
    for item in raw_items:
        if not isinstance(item, dict):
            return _error("One of the items in your bag is invalid.")
        product_id = str(item.get("product_id", ""))[:120]
        quantity = item.get("quantity")
        has_protection_plan = item.get("has_protection_plan", False)
        if not product_id or isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1 or quantity > 20:
            return _error("Each item must have a valid quantity (1 to 20).")
        if not isinstance(has_protection_plan, bool):
            return _error("One of the protection plan selections is invalid.")
        if product_id in quantities:
            return _error("Each product should appear only once in your bag.")
        quantities[product_id] = quantity
        if has_protection_plan:
            plan_items.add(product_id)
    promo_code = str(payload.get("promo_code", "")).strip().upper()
    if promo_code and promo_code not in PROMO_CODES:
        return _error("This discount code is invalid or has expired.")
    gift_packaging = payload.get("gift_packaging", False)
    if not isinstance(gift_packaging, bool):
        return _error("Gift packaging selection is invalid.")
    protection_plan_ids = plan_items
    product_quantities = quantities
    try:
        with transaction.atomic():
            _release_expired_orders()
            products_by_id = list(Product.objects.select_for_update().filter(id__in=product_quantities, in_stock=True))
            if len(products_by_id) != len(product_quantities):
                return _error("One or more products are unavailable. Refresh your bag and try again.", 409)
            for product in products_by_id:
                available = _available_stock(product)
                if available < product_quantities[product.id]:
                    return _error(f"Only {available} of {product.title} are available.", 409)
            subtotal = sum((p.price * product_quantities[p.id]
                            + (PROTECTION_PLAN_COST * product_quantities[p.id] if p.id in protection_plan_ids else Decimal("0.00"))
                            for p in products_by_id), Decimal("0.00")).quantize(CENT)
            discount = (subtotal * PROMO_CODES.get(promo_code, Decimal("0"))).quantize(CENT, rounding=ROUND_HALF_UP)
            gift_wrap = GIFT_WRAP_COST if gift_packaging and subtotal <= GIFT_WRAP_FREE_OVER else Decimal("0.00")
            taxable_total = max(Decimal("0.00"), subtotal - discount)
            tax = (taxable_total * TAX_RATE).quantize(CENT, rounding=ROUND_HALF_UP)
            total = subtotal - discount + gift_wrap + tax
            order = Order.objects.create(user=request.user, recipient_name=recipient_name, **fields,
                                         subtotal=subtotal, discount=discount, promo_code=promo_code,
                                         gift_packaging=gift_packaging, gift_wrap_cost=gift_wrap,
                                         tax=tax, total=total)
            payment_response = requests.post("https://api.razorpay.com/v1/orders", auth=razorpay_auth, json={
                "amount": int(total * 100), "currency": "INR", "receipt": order.reference,
                "notes": {"proshop_order": order.reference, "account_id": str(request.user.pk)},
            }, timeout=(3.05, 10))
            payment_response.raise_for_status()
            payment_order = payment_response.json()
            order.razorpay_order_id = payment_order["id"]
            order.save(update_fields=["razorpay_order_id"])
            OrderItem.objects.bulk_create([
                OrderItem(order=order, product=product, product_id_snapshot=product.id,
                          title_snapshot=product.title, unit_price=product.price, quantity=product_quantities[product.id],
                          protection_plan_cost=PROTECTION_PLAN_COST if product.id in protection_plan_ids else Decimal("0.00"))
                for product in products_by_id
            ])
            for product in products_by_id:
                product.catalog_data = {**(product.catalog_data or {}),
                                        "stock": _available_stock(product) - product_quantities[product.id]}
                product.in_stock = product.catalog_data["stock"] > 0
                product.save(update_fields=["catalog_data", "in_stock", "updated_at"])
    except Exception:
        logger.exception("Could not create order for user %s", request.user.pk)
        return _error("We could not start checkout just now. Your bag is saved; please try again.", 503)
    return JsonResponse({"ok": True, "key_id": razorpay_key_id, "currency": "INR",
                         "amount": int(total * 100), "order": _order_json(order)}, status=201)


@require_POST
def verify_payment(request):
    if not request.user.is_authenticated or not request.user.is_active:
        return _error("Please sign in with a verified account before paying.", 401)
    try:
        payload = _json_body(request)
        local_reference = str(payload.get("reference", ""))
        payment_id = str(payload.get("razorpay_payment_id", ""))
        supplied_order_id = str(payload.get("razorpay_order_id", ""))
        signature = str(payload.get("razorpay_signature", ""))
        order = Order.objects.get(user=request.user, reference=local_reference)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError, Order.DoesNotExist):
        return _error("We could not verify this payment.", 400)
    if not all((payment_id, supplied_order_id, signature)) or supplied_order_id != order.razorpay_order_id:
        return _error("We could not verify this payment.", 400)
    if order.status != Order.Status.PENDING:
        return _error("This order is no longer awaiting payment.", 409)
    try:
        auth, _ = _razorpay_client()
        signed_payload = f"{order.razorpay_order_id}|{payment_id}".encode("utf-8")
        expected_signature = hmac.new(auth[1].encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_signature, signature):
            return _error("We could not verify this payment.", 400)
        payment_response = requests.get(f"https://api.razorpay.com/v1/payments/{payment_id}", auth=auth, timeout=(3.05, 10))
        payment_response.raise_for_status()
        payment = payment_response.json()
        if payment.get("order_id") != order.razorpay_order_id or payment.get("status") != "captured":
            return _error("Payment is not confirmed yet. Please check again shortly.", 409)
        if int(payment.get("amount", -1)) != int(order.total * 100) or payment.get("currency") != "INR":
            return _error("Payment amount does not match this order.", 400)
        with transaction.atomic():
            locked_order = Order.objects.select_for_update().get(pk=order.pk, user=request.user)
            if locked_order.razorpay_payment_id and locked_order.razorpay_payment_id != payment_id:
                return _error("A different payment is already attached to this order.", 409)
            locked_order.razorpay_payment_id = payment_id
            locked_order.status = Order.Status.CONFIRMED
            locked_order.save(update_fields=["razorpay_payment_id", "status"])
    except Exception:
        logger.exception("Could not confirm payment for order %s", order.reference)
        return _error("Payment status is temporarily unavailable. Please contact support before retrying.", 503)
    return JsonResponse({"ok": True, "order": _order_json(locked_order)})
