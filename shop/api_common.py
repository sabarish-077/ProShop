import json

from django.http import JsonResponse

def _json_body(request, max_bytes=32_768):
    if len(request.body) > max_bytes:
        raise ValueError("Request is too large.")
    payload = json.loads(request.body.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Invalid request.")
    return payload


def _error(message, status=400):
    return JsonResponse({"ok": False, "error": message}, status=status)
