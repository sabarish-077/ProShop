import json
from io import StringIO
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.db import DatabaseError
from django.test import TestCase, override_settings
from django.utils.crypto import get_random_string

from proshop_site.settings import _database_url_from_environment

from .models import Order, Product


class PublicPageTests(TestCase):
    def test_vercel_prefers_project_scoped_database_url(self):
        with patch("proshop_site.settings.IS_VERCEL", True), patch.dict("os.environ", {
            "DATABASE_URL": "postgresql://generic.example/db",
            "PROSHOP_DB_DATABASE_URL": "postgresql://proshop.example/db",
        }):
            self.assertEqual(
                _database_url_from_environment(),
                "postgresql://proshop.example/db",
            )

    def test_local_database_url_precedence_is_unchanged(self):
        with patch("proshop_site.settings.IS_VERCEL", False), patch.dict("os.environ", {
            "VERCEL": "1",
            "DATABASE_URL": "postgresql://generic.example/db",
            "PROSHOP_DB_DATABASE_URL": "postgresql://proshop.example/db",
        }):
            self.assertEqual(
                _database_url_from_environment(),
                "postgresql://generic.example/db",
            )

    def test_configured_site_host_is_allowed(self):
        site_host = urlparse(settings.SITE_URL).hostname
        self.assertIsNotNone(site_host)
        self.assertIn(site_host, settings.ALLOWED_HOSTS)

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

    def test_staff_can_sign_in_through_admin_login(self):
        password = get_random_string(32)
        get_user_model().objects.create_user(
            username="admin-login-test", password=password, is_staff=True
        )

        response = self.client.post(
            "/admin/login/?next=/admin-dashboard/",
            {"username": "admin-login-test", "password": password},
        )

        self.assertRedirects(response, "/admin-dashboard/", fetch_redirect_response=False)
        self.assertTrue(self.client.get("/api/auth/status/").json()["authenticated"])

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
        self.assertEqual(response.json(), {"status": "unavailable", "check": "migrations"})

    @patch("django.db.migrations.executor.MigrationExecutor.migration_plan", return_value=[])
    @patch("django.db.backends.base.introspection.BaseDatabaseIntrospection.table_names", return_value=[])
    def test_health_reports_missing_database_tables(self, _table_names, _migration_plan):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable", "check": "schema"})

    @patch("django.db.connection.cursor", side_effect=RuntimeError("hidden database detail"))
    def test_health_reports_database_connection_failure_without_details(self, _cursor):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable", "check": "database"})


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


class CatalogImportTests(TestCase):
    def test_import_catalog_is_repeatable_and_preserves_stock(self):
        call_command("import_catalog", stdout=StringIO())
        self.assertEqual(Product.objects.count(), 16)

        product = Product.objects.get(pk="horizon-x")
        product.catalog_data = {**product.catalog_data, "stock": 2}
        product.save(update_fields=["catalog_data"])

        call_command("import_catalog", stdout=StringIO())

        self.assertEqual(Product.objects.count(), 16)
        product.refresh_from_db()
        self.assertEqual(product.catalog_data["stock"], 2)


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

    def test_expired_verification_token_is_reported(self):
        response = self.register()
        self.assertEqual(response.status_code, 201)
        verify_url = next(
            line for line in mail.outbox[0].body.splitlines()
            if line.startswith("https://example.test/account.html?")
        )
        uid = parse_qs(urlparse(verify_url).query)["verify"][0]
        response = self.client.post(
            "/api/auth/verify/",
            data=json.dumps({"uid": uid, "token": "invalid-token"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "This verification link is invalid or has expired.")

    @patch("shop.api.User.objects.get", side_effect=DatabaseError("database unavailable"))
    def test_verification_database_error_is_reported_as_unavailable(self, _get_user):
        response = self.client.post(
            "/api/auth/verify/",
            data=json.dumps({"uid": "MQ", "token": "token"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"], "Account service is temporarily unavailable. Please try again.")

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


@override_settings(RAZORPAY_KEY_ID="", RAZORPAY_KEY_SECRET="")
class CashOnDeliveryTests(TestCase):
    @patch("shop.checkout_api.requests.post")
    def test_cod_order_does_not_require_or_call_razorpay(self, razorpay_post):
        user = get_user_model().objects.create_user(
            username="cod-customer@example.test",
            email="cod-customer@example.test",
            password="Strong-Test-Password-2026!",
            is_active=True,
        )
        product = Product.objects.create(
            id="cod-test-item",
            title="COD test item",
            brand="Test",
            department="Electronics",
            price="1200.00",
            catalog_data={"stock": 2},
        )
        self.client.force_login(user)
        response = self.client.post(
            "/api/orders/",
            data=json.dumps({
                "payment_method": "cod",
                "items": [{"product_id": product.pk, "quantity": 1}],
                "address": {
                    "first_name": "COD", "last_name": "Customer", "address": "1 Main Street",
                    "city": "Chennai", "region": "Tamil Nadu", "postal_code": "600001",
                },
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        result = response.json()
        self.assertEqual(result["payment_method"], "cod")
        self.assertNotIn("key_id", result)
        self.assertEqual(result["order"]["status"], Order.Status.COD_PENDING)
        self.assertIsNone(result["order"]["razorpay_order_id"])
        razorpay_post.assert_not_called()
        product.refresh_from_db()
        self.assertEqual(product.catalog_data["stock"], 1)
