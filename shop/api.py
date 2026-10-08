"""Compatibility exports for the storefront's existing API URL configuration."""

from .account_api import (
    User, auth_status, login_view, logout_view, password_reset_confirm,
    password_reset_request, register, resend_verification, verify_email,
)
from .catalog_api import product_detail, products
from .checkout_api import create_order, orders, verify_payment
