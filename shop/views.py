from pathlib import Path

from django.conf import settings
from django.contrib import admin
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth import get_user_model
from django.db.models import Count, Sum
from django.http import FileResponse, JsonResponse
from django.shortcuts import render
from django.shortcuts import redirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from .models import Order, Product

FRONTEND_PAGES = {
    "index.html": "index.html",
    "shop.html": "shop.html",
    "product.html": "product.html",
    "cart.html": "cart.html",
    "account.html": "account.html",
}


@ensure_csrf_cookie
def serve_page(request, page):
    frontend_root = settings.BASE_DIR.resolve()
    file_path = (frontend_root / page).resolve()
    if file_path.parent != frontend_root or not file_path.is_file():
        from django.http import Http404
        raise Http404
    return FileResponse(file_path.open("rb"), content_type="text/html; charset=utf-8")


def home(request):
    return serve_page(request, FRONTEND_PAGES["index.html"])


def shop_page(request):
    return serve_page(request, FRONTEND_PAGES["shop.html"])


def product_page(request):
    return serve_page(request, FRONTEND_PAGES["product.html"])


def cart_page(request):
    return serve_page(request, FRONTEND_PAGES["cart.html"])


def account_page(request):
    return serve_page(request, FRONTEND_PAGES["account.html"])


@staff_member_required(login_url="/admin/login/")
def admin_dashboard(request):
    confirmed_orders = Order.objects.filter(status=Order.Status.CONFIRMED)
    context = {
        "products_count": Product.objects.count(),
        "customers_count": get_user_model().objects.filter(is_staff=False).count(),
        "orders_count": Order.objects.count(),
        "pending_count": Order.objects.filter(status=Order.Status.PENDING).count(),
        "confirmed_count": confirmed_orders.count(),
        "revenue": confirmed_orders.aggregate(total=Sum("total"))["total"] or 0,
        "recent_orders": Order.objects.select_related("user").prefetch_related("items")[:8],
        "low_stock_products": Product.objects.filter(in_stock=False)[:8],
    }
    return render(request, "shop/admin_dashboard.html", context)


def staff_admin_login(request):
    if request.user.is_authenticated and request.user.is_active and request.user.is_staff:
        return redirect("admin-dashboard")
    return admin.site.login(request)


@require_GET
def health(request):
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        return JsonResponse({"status": "unavailable"}, status=503)
    return JsonResponse({"status": "ok"})
