from django.contrib import admin
from django.urls import path, re_path
from django.views.generic.base import RedirectView
from django.views.decorators.http import require_http_methods

from shop import api, views

urlpatterns = [
    path("admin/login/", views.staff_admin_login, name="staff-admin-login"),
    path("admin/", admin.site.urls),
    path("api/health/", views.health, name="health"),
    path("api/products/", api.products, name="products"),
    path("api/products/<slug:product_id>/", api.product_detail, name="product-detail"),
    path("api/auth/status/", api.auth_status, name="auth-status"),
    path("api/auth/register/", api.register, name="register"),
    path("api/auth/verify/", api.verify_email, name="verify-email"),
    path("api/auth/resend-verification/", api.resend_verification, name="resend-verification"),
    path("api/auth/login/", api.login_view, name="login"),
    path("api/auth/logout/", api.logout_view, name="logout"),
    path("api/orders/", require_http_methods(["GET", "POST"])(api.orders), name="orders"),
    path("api/payments/razorpay/verify/", api.verify_payment, name="verify-payment"),
    path("", views.home, name="home"),
    path("index.html", views.home, name="home-page"),
    path("shop.html", views.shop_page, name="shop-page"),
    path("product.html", views.product_page, name="product-page"),
    path("cart.html", views.cart_page, name="cart-page"),
    path("account.html", views.account_page, name="account-page"),
    re_path(r"^admin-dashboard/\*+/?$", RedirectView.as_view(url="/admin-dashboard/", permanent=False)),
    path("admin-dashboard/", views.admin_dashboard, name="admin-dashboard"),
]
