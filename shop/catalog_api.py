import logging

from django.db import DatabaseError
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .api_common import _error
from .models import Product

logger = logging.getLogger("shop")

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
