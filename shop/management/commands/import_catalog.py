import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from shop.models import Product


class Command(BaseCommand):
    help = "Import the current ProShop product catalog into the SQL database."

    def handle(self, *args, **options):
        catalog_file = settings.BASE_DIR / "js" / "products-data.js"
        try:
            source = catalog_file.read_text(encoding="utf-8")
            start = source.index("[")
            end = source.rindex("];", start) + 1
            catalog = json.loads(source[start:end])
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            raise CommandError(f"Could not read catalog file {catalog_file}: {exc}") from exc
        if not isinstance(catalog, list) or not catalog:
            raise CommandError("The product catalog is empty or invalid.")

        with transaction.atomic():
            for item in catalog:
                try:
                    product_id = item["id"]
                    current = Product.objects.filter(pk=product_id).only("catalog_data").first()
                    current_stock = None
                    if current is not None:
                        current_stock = int((current.catalog_data or {}).get("stock", item.get("stock", 1)))
                    catalog_data = dict(item)
                    if current_stock is not None:
                        catalog_data["stock"] = current_stock
                    Product.objects.update_or_create(
                        id=product_id,
                        defaults={
                            "title": item["title"],
                            "brand": item["brand"],
                            "department": item["department"],
                            "category": item.get("category", ""),
                            "price": item["price"],
                            "original_price": item.get("originalPrice"),
                            "image": item.get("image", ""),
                            "description": item.get("description", ""),
                            "in_stock": catalog_data.get("stock", 1) > 0,
                            "catalog_data": catalog_data,
                        },
                    )
                except (KeyError, TypeError, ValueError) as exc:
                    raise CommandError(f"Invalid product entry: {exc}") from exc
        self.stdout.write(self.style.SUCCESS(f"Imported {len(catalog)} products."))
