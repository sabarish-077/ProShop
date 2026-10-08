import hashlib
import hmac
import json
import logging
from datetime import timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

import requests
from django.conf import settings
from django.db import DatabaseError, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_POST

from .api_common import _error, _json_body
from .models import Order, OrderItem, Product

logger = logging.getLogger("shop")
CENT = Decimal("0.01")
TAX_RATE = Decimal("0.0825")
GIFT_WRAP_COST = Decimal("25.00")
GIFT_WRAP_FREE_OVER = Decimal("96150.00")
PROTECTION_PLAN_COST = Decimal("120.00")
PROMO_CODES = {"AUTUMN2025": Decimal("0.10"), "VIPNOIR": Decimal("0.15")}

def _available_stock(product):
    try:
        return max(0, int((product.catalog_data or {}).get("stock", 1)))
    except (TypeError, ValueError):
        logger.error("Invalid stock value for product %s", product.pk)
        return 0


def _razorpay_client():
    key_id = settings.RAZORPAY_KEY_ID
    key_secret = settings.RAZORPAY_KEY_SECRET
    if not key_id or not key_secret:
        raise RuntimeError("Online payments are not configured yet.")
    return (key_id, key_secret), key_id


def _order_json(order, include_delivery=False):
    result = {
        "reference": order.reference,
        "status": order.status,
        "payment_method": order.payment_method,
        "razorpay_order_id": order.razorpay_order_id,
        "subtotal": str(order.subtotal),
        "discount": str(order.discount),
        "tax": str(order.tax),
        "total": str(order.total),
        "gift_packaging": order.gift_packaging,
        "gift_wrap_cost": str(order.gift_wrap_cost),
        "promo_code": order.promo_code,
        "created_at": order.created_at.isoformat(),
        "items": [{"title": item.title_snapshot, "quantity": item.quantity,
                   "unit_price": str(item.unit_price),
                   "protection_plan_cost": str(item.protection_plan_cost)} for item in order.items.all()],
    }
    if include_delivery:
        result["delivery"] = {
            "recipient_name": order.recipient_name,
            "address": order.address,
            "city": order.city,
            "region": order.region,
            "postal_code": order.postal_code,
        }
    return result


def _restore_order_stock(order):
    for item in order.items.all():
        product = Product.objects.select_for_update().filter(pk=item.product_id).first()
        if product is None:
            continue
        stock = _available_stock(product) + item.quantity
        product.catalog_data = {**(product.catalog_data or {}), "stock": stock}
        product.in_stock = stock > 0
        product.save(update_fields=["catalog_data", "in_stock", "updated_at"])


def _release_expired_orders():
    """Release inventory from abandoned payment attempts after one hour."""
    stale_orders = list(Order.objects.select_for_update().filter(
        status=Order.Status.PENDING,
        created_at__lt=timezone.now() - timedelta(hours=1),
    ).prefetch_related("items")[:200])
    for stale in stale_orders:
        _restore_order_stock(stale)
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


@never_cache
@require_GET
def order_detail(request, reference):
    if not request.user.is_authenticated:
        return _error("Please sign in to view this order.", 401)
    try:
        order = get_object_or_404(
            Order.objects.prefetch_related("items"),
            user=request.user,
            reference=reference,
        )
        return JsonResponse({"order": _order_json(order, include_delivery=True)})
    except DatabaseError:
        logger.exception("Could not read order details for user %s", request.user.pk)
        return _error("Order details are temporarily unavailable. Please try again.", 503)


@require_POST
def update_order_delivery(request, reference):
    if not request.user.is_authenticated or not request.user.is_active:
        return _error("Please sign in to edit this order.", 401)
    try:
        payload = _json_body(request)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return _error("Check the delivery details and try again.")
    field_limits = {"recipient_name": 150, "address": 300, "city": 120, "region": 120, "postal_code": 24}
    delivery = {}
    for field, limit in field_limits.items():
        value = payload.get(field)
        if not isinstance(value, str):
            return _error("Complete each delivery detail.")
        value = value.strip()
        if not value or len(value) > limit:
            return _error("Complete each delivery detail with valid information.")
        delivery[field] = value
    try:
        with transaction.atomic():
            order = Order.objects.select_for_update().filter(
                user=request.user, reference=reference
            ).first()
            if order is None:
                return _error("Order not found.", 404)
            if (order.payment_method != Order.PaymentMethod.CASH_ON_DELIVERY
                    or order.status != Order.Status.COD_PENDING):
                return _error("Only unpaid COD orders can be edited.", 409)
            for field, value in delivery.items():
                setattr(order, field, value)
            order.save(update_fields=list(delivery))
        return JsonResponse({"ok": True, "order": _order_json(order, include_delivery=True)})
    except DatabaseError:
        logger.exception("Could not update order delivery for user %s", request.user.pk)
        return _error("This order could not be updated right now. Please try again.", 503)


@require_POST
def cancel_order(request, reference):
    if not request.user.is_authenticated or not request.user.is_active:
        return _error("Please sign in to cancel this order.", 401)
    try:
        with transaction.atomic():
            order = Order.objects.select_for_update().filter(
                user=request.user, reference=reference
            ).first()
            if order is None:
                return _error("Order not found.", 404)
            if (order.payment_method != Order.PaymentMethod.CASH_ON_DELIVERY
                    or order.status != Order.Status.COD_PENDING):
                return _error("Only unpaid COD orders can be cancelled online.", 409)
            order = Order.objects.prefetch_related("items").get(pk=order.pk)
            _restore_order_stock(order)
            order.status = Order.Status.CANCELLED
            order.save(update_fields=["status"])
        return JsonResponse({"ok": True, "order": _order_json(order, include_delivery=True)})
    except DatabaseError:
        logger.exception("Could not cancel order for user %s", request.user.pk)
        return _error("This order could not be cancelled right now. Please try again.", 503)


@require_POST
def create_order(request):
    if not request.user.is_authenticated:
        return _error("Please sign in before placing an order.", 401)
    if not request.user.is_active:
        return _error("Verify your email before placing an order.", 403)
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
    payment_method = str(payload.get("payment_method", Order.PaymentMethod.RAZORPAY)).strip().lower()
    if payment_method not in Order.PaymentMethod.values:
        return _error("Choose a valid payment method.")
    razorpay_auth = None
    razorpay_key_id = ""
    if payment_method == Order.PaymentMethod.RAZORPAY:
        try:
            razorpay_auth, razorpay_key_id = _razorpay_client()
        except RuntimeError:
            return _error("Online payments are temporarily unavailable. Please try again later.", 503)
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
            order_status = (Order.Status.PENDING if payment_method == Order.PaymentMethod.RAZORPAY
                            else Order.Status.COD_PENDING)
            order = Order.objects.create(user=request.user, recipient_name=recipient_name, **fields,
                                         subtotal=subtotal, discount=discount, promo_code=promo_code,
                                         gift_packaging=gift_packaging, gift_wrap_cost=gift_wrap,
                                         tax=tax, total=total, payment_method=payment_method,
                                         status=order_status)
            if payment_method == Order.PaymentMethod.RAZORPAY:
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
    response_data = {"ok": True, "payment_method": payment_method,
                     "amount": int(total * 100), "order": _order_json(order)}
    if payment_method == Order.PaymentMethod.RAZORPAY:
        response_data.update({"key_id": razorpay_key_id, "currency": "INR"})
    return JsonResponse(response_data, status=201)


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
    if order.payment_method != Order.PaymentMethod.RAZORPAY:
        return _error("This order does not use online payment.", 400)
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
