import json
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings

from .models import Product


class PublicPageTests(TestCase):
    def test_store_pages_load(self):
        for path in ("/", "/shop.html", "/product.html", "/cart.html", "/account.html"):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response["Content-Type"], "text/html; charset=utf-8")

    def test_admin_dashboard_redirects_non_staff(self):
        response = self.client.get("/admin-dashboard/")
        self.assertRedirects(response, "/admin/login/?next=/admin-dashboard/", fetch_redirect_response=False)

    def test_staff_can_open_dashboard(self):
        user = get_user_model().objects.create_user(
            username="store-admin", password="Strong-Test-Password-2026!", is_staff=True
        )
        self.client.force_login(user)
        response = self.client.get("/admin-dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Store dashboard")
        self.assertContains(response, 'action="/admin/logout/" method="post"')

    def test_staff_can_sign_out_with_post(self):
        user = get_user_model().objects.create_user(
            username="signout-admin", password="Strong-Test-Password-2026!", is_staff=True
        )
        self.client.force_login(user)
        response = self.client.get("/admin/logout/")
        self.assertEqual(response.status_code, 405)
        response = self.client.post("/admin/logout/")
        self.assertIn(response.status_code, (200, 302))
        self.assertFalse(self.client.get("/api/auth/status/").json()["authenticated"])


class HealthCheckTests(TestCase):
    def test_health_is_ok_after_migrations(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    @patch("django.db.migrations.executor.MigrationExecutor.migration_plan", return_value=[("shop", "0001_initial")])
    def test_health_reports_pending_migrations(self, _migration_plan):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable"})


class ProductApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        Product.objects.create(
            id="test-horizon",
            title="Horizon Test Headphones",
            brand="Test Audio",
            department="Electronics",
            category="Audio",
            price="1299.00",
            catalog_data={"stock": 2},
        )

    def test_product_list_and_search(self):
        response = self.client.get("/api/products/?q=Horizon")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.json()["products"]], ["test-horizon"])

    def test_product_filter_can_return_no_results(self):
        response = self.client.get("/api/products/?brand=Missing")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"products": []})

    def test_unknown_product_returns_not_found(self):
        response = self.client.get("/api/products/not-a-real-product/")
        self.assertEqual(response.status_code, 404)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    SITE_URL="https://example.test",
    DEFAULT_FROM_EMAIL="test@example.test",
)
class AccountApiTests(TestCase):
    def register(self, email="tester@example.test"):
        return self.client.post(
            "/api/auth/register/",
            data=json.dumps({"name": "Test User", "email": email, "password": "Strong-Test-Password-2026!"}),
            content_type="application/json",
        )

    def test_register_verify_login_status_and_logout(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["verification_sent"])
        self.assertEqual(len(mail.outbox), 1)

        verify_url = next(
            line for line in mail.outbox[0].body.splitlines()
            if line.startswith("https://example.test/account.html?")
        )
        query = parse_qs(urlparse(verify_url).query)
        response = self.client.post(
            "/api/auth/verify/",
            data=json.dumps({"uid": query["verify"][0], "token": query["token"][0]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)

        response = self.client.post(
            "/api/auth/login/",
            data=json.dumps({"email": "tester@example.test", "password": "Strong-Test-Password-2026!"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.client.get("/api/auth/status/").json()["authenticated"])

        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 200)
        self.assertFalse(self.client.get("/api/auth/status/").json()["authenticated"])

    def test_registration_rejects_invalid_json_and_duplicate_email(self):
        response = self.client.post("/api/auth/register/", data="not-json", content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.register().status_code, 201)
        response = self.register()
        self.assertEqual(response.status_code, 409)

    def test_account_changes_require_csrf_token(self):
        csrf_client = self.client_class(enforce_csrf_checks=True)
        response = csrf_client.post(
            "/api/auth/register/",
            data=json.dumps({"name": "Test User", "email": "csrf@example.test", "password": "Strong-Test-Password-2026!"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)


class CheckoutAccessTests(TestCase):
    def test_orders_and_payment_require_authentication(self):
        self.assertEqual(self.client.get("/api/orders/").status_code, 401)
        self.assertEqual(self.client.post("/api/orders/", data="{}", content_type="application/json").status_code, 401)
        self.assertEqual(
            self.client.post("/api/payments/razorpay/verify/", data="{}", content_type="application/json").status_code,
            401,
        )
