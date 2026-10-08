from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth import get_user_model
from django.db import DatabaseError, transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse

from .checkout_api import _restore_order_stock
from .models import Order, Product


@staff_member_required(login_url="/admin/login/")
def manage_orders(request):
    if request.method == "POST":
        reference = request.POST.get("reference", "")
        action = request.POST.get("action", "")
        try:
            with transaction.atomic():
                order = Order.objects.select_for_update().filter(reference=reference).first()
                if order is None:
                    messages.error(request, "Order not found.")
                elif order.payment_method != Order.PaymentMethod.CASH_ON_DELIVERY:
                    messages.error(request, "Customer edits and manual status changes are limited to COD orders.")
                elif order.status != Order.Status.COD_PENDING:
                    messages.error(request, "This COD order is no longer awaiting payment.")
                elif action == "save_delivery":
                    fields = {
                        "recipient_name": (150, "recipient_name"),
                        "address": (300, "address"),
                        "city": (120, "city"),
                        "region": (120, "region"),
                        "postal_code": (24, "postal_code"),
                    }
                    updated = {}
                    for field, (limit, label) in fields.items():
                        value = request.POST.get(field, "").strip()
                        if not value or len(value) > limit:
                            raise ValueError(f"Enter a valid {label.replace('_', ' ')}.")
                        updated[field] = value
                    for field, value in updated.items():
                        setattr(order, field, value)
                    order.save(update_fields=list(updated))
                    messages.success(request, f"Delivery details saved for {order.reference}.")
                elif action == "mark_paid":
                    order.status = Order.Status.CONFIRMED
                    order.save(update_fields=["status"])
                    messages.success(request, f"{order.reference} marked collected and confirmed.")
                elif action == "cancel":
                    order = Order.objects.prefetch_related("items").get(pk=order.pk)
                    _restore_order_stock(order)
                    order.status = Order.Status.CANCELLED
                    order.save(update_fields=["status"])
                    messages.success(request, f"{order.reference} cancelled and reserved stock returned.")
                else:
                    messages.error(request, "Choose a valid order action.")
        except ValueError as exc:
            messages.error(request, str(exc))
        except DatabaseError:
            messages.error(request, "The order could not be updated right now. Please try again.")
        return redirect("admin-dashboard-orders")

    orders = Order.objects.select_related("user").prefetch_related("items")[:100]
    return render(request, "shop/admin_orders.html", {"orders": orders})


@staff_member_required(login_url="/admin/login/")
def manage_products(request):
    if request.method == "POST":
        product_id = request.POST.get("product_id", "")
        try:
            raw_stock = request.POST.get("stock", "")
            stock = int(raw_stock)
            if stock < 0 or stock > 1_000_000:
                raise ValueError
            with transaction.atomic():
                product = Product.objects.select_for_update().get(pk=product_id)
                product.catalog_data = {**(product.catalog_data or {}), "stock": stock}
                product.in_stock = stock > 0
                product.save(update_fields=["catalog_data", "in_stock", "updated_at"])
            messages.success(request, f"Stock updated for {product.title}.")
        except (ValueError, Product.DoesNotExist):
            messages.error(request, "Enter a valid product and stock quantity.")
        except DatabaseError:
            messages.error(request, "Stock could not be updated right now. Please try again.")
        return redirect("admin-dashboard-products")

    products = Product.objects.all()[:250]
    return render(request, "shop/admin_products.html", {
        "products": products,
        "add_product_url": reverse("admin:shop_product_add"),
        "edit_product_url": reverse("admin:shop_product_changelist"),
    })


@staff_member_required(login_url="/admin/login/")
def manage_customers(request):
    User = get_user_model()
    customers = User.objects.filter(is_staff=False, is_superuser=False).annotate(
        orders_count=Count("shop_orders")
    ).order_by("-date_joined")[:200]
    return render(request, "shop/admin_customers.html", {"customers": customers})


@staff_member_required(login_url="/admin/login/")
def customer_detail(request, user_id):
    User = get_user_model()
    customer = get_object_or_404(
        User.objects.filter(is_staff=False, is_superuser=False), pk=user_id
    )
    orders = customer.shop_orders.prefetch_related("items")[:100]
    return render(request, "shop/admin_customer_detail.html", {
        "customer": customer,
        "orders": orders,
    })
