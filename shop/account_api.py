import json
import logging
from binascii import Error as Base64Error
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import DatabaseError, IntegrityError, transaction
from django.http import JsonResponse
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_POST

from .api_common import _error, _json_body

logger = logging.getLogger("shop")
User = get_user_model()

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
        logger.exception("Could not send verification email for newly registered account")
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
def password_reset_request(request):
    """Send a short-lived reset link without revealing whether an account exists."""
    generic_response = JsonResponse({
        "ok": True,
        "message": "If an active account matches that email, a password reset link will be sent shortly.",
    })
    try:
        payload = _json_body(request)
        email = str(payload.get("email", "")).strip().lower()
        validate_email(email)
        if len(email) > 150:
            return generic_response
        user = User.objects.filter(email=email, is_active=True).first()
        if user is None:
            return generic_response
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        query = urlencode({"reset_uid": uid, "reset_token": token})
        reset_url = f"{settings.SITE_URL.rstrip('/')}/account.html?{query}"
        send_mail(
            "Reset your ProShop password",
            f"Hello {user.first_name or 'there'},\n\nUse this link within one hour to choose a new password:\n{reset_url}\n\nIf you did not request this, you can ignore this email.",
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False,
        )
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError, ValidationError):
        return generic_response
    except DatabaseError:
        logger.exception("Password reset request could not access the account database")
        return _error("Password reset is temporarily unavailable. Please try again.", 503)
    except Exception:
        logger.exception("Could not send password reset email")
    return generic_response


@require_POST
def password_reset_confirm(request):
    try:
        payload = _json_body(request)
        uid = force_str(urlsafe_base64_decode(payload.get("uid", "")))
        token = payload.get("token", "")
        password = payload.get("password", "")
    except (ValueError, TypeError, UnicodeDecodeError, Base64Error, json.JSONDecodeError):
        return _error("This password reset link is invalid or has expired.", 400)
    if not isinstance(token, str) or not isinstance(password, str) or not password or len(password) > 256:
        return _error("Enter a valid new password.", 400)
    try:
        user = User.objects.get(pk=uid, is_active=True)
    except User.DoesNotExist:
        return _error("This password reset link is invalid or has expired.", 400)
    except DatabaseError:
        logger.exception("Password reset could not access the account database")
        return _error("Password reset is temporarily unavailable. Please try again.", 503)
    if not default_token_generator.check_token(user, token):
        return _error("This password reset link is invalid or has expired.", 400)
    try:
        validate_password(password, user)
    except ValidationError as exc:
        return _error(" ".join(exc.messages), 400)
    try:
        user.set_password(password)
        user.save(update_fields=["password"])
    except DatabaseError:
        logger.exception("Password reset could not save the new password")
        return _error("Password reset is temporarily unavailable. Please try again.", 503)
    return JsonResponse({"ok": True, "message": "Your password has been reset. You can sign in now."})


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
