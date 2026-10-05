"""Client HTTP condiviso: retry con backoff esponenziale su 429/5xx (rispettando
Retry-After) e intervallo minimo tra chiamate verso lo stesso host, per stare
sotto i limiti delle API gratuite."""

from __future__ import annotations

import threading
import time
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Pausa minima (secondi) tra due richieste allo stesso host.
# CoinGecko senza chiave: ~5-30 chiamate/min; SoSoValue: 20/min; FRED: 120/min.
MIN_INTERVAL_BY_HOST = {
    "api.coingecko.com": 6.0,
    "openapi.sosovalue.com": 3.5,
    "api.stlouisfed.org": 0.6,
    "fred.stlouisfed.org": 1.0,
}


class HttpError(RuntimeError):
    pass


class HttpClient:
    def __init__(
        self,
        user_agent: str,
        timeout: float = 20.0,
        retries: int = 4,
        min_interval_by_host: dict[str, float] | None = None,
    ):
        self.timeout = timeout
        self.min_interval_by_host = (
            MIN_INTERVAL_BY_HOST if min_interval_by_host is None else min_interval_by_host
        )
        self.session = requests.Session()
        self.session.headers["User-Agent"] = user_agent
        retry = Retry(
            total=retries,
            # Host irraggiungibile (DNS, proxy, firewall): un solo nuovo tentativo,
            # inutile insistere per mezzo minuto a ogni giro orario.
            connect=min(retries, 1),
            other=min(retries, 1),  # es. proxy che rifiuta il tunnel
            backoff_factor=2.0,  # 2s, 4s, 8s, 16s
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=("GET", "POST"),
            respect_retry_after_header=True,
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
        self._last_call: dict[str, float] = {}
        self._lock = threading.Lock()

    def _throttle(self, url: str) -> None:
        host = urlparse(url).hostname or ""
        interval = self.min_interval_by_host.get(host, 0.0)
        with self._lock:
            wait = self._last_call.get(host, 0.0) + interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last_call[host] = time.monotonic()

    def request(self, method: str, url: str, **kwargs) -> requests.Response:
        self._throttle(url)
        kwargs.setdefault("timeout", self.timeout)
        try:
            response = self.session.request(method, url, **kwargs)
        except requests.RequestException as exc:
            raise HttpError(f"{method} {url}: {exc}") from exc
        if response.status_code >= 400:
            body = response.text[:300].replace("\n", " ")
            raise HttpError(f"{method} {url}: HTTP {response.status_code} {body}")
        return response

    def get_json(self, url: str, **kwargs):
        response = self.request("GET", url, **kwargs)
        try:
            return response.json()
        except ValueError as exc:
            raise HttpError(f"GET {url}: risposta non JSON") from exc

    def post_json(self, url: str, **kwargs):
        response = self.request("POST", url, **kwargs)
        try:
            return response.json()
        except ValueError as exc:
            raise HttpError(f"POST {url}: risposta non JSON") from exc

    def get_text(self, url: str, **kwargs) -> str:
        return self.request("GET", url, **kwargs).text
