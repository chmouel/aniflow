"""GitHub sign-in for the comment routes: the redirect, the code exchange and the signed
cookie that remembers who came back.

No dependencies: urllib makes the two calls, hmac signs the session, and the session lives
in the cookie alone, so a restart signs nobody out.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

AUTHORIZE = "https://github.com/login/oauth/authorize"
TOKEN_URL = "https://github.com/login/oauth/access_token"
API = "https://api.github.com"
USER_URL = f"{API}/user"
STATE_COOKIE = "aniflow-signin"
SESSION_COOKIE = "aniflow-user"
STATE_TTL = 600
SESSION_TTL = 30 * 86400
TIMEOUT = 15
AGENT = "aniflow"


class SignInFailed(Exception):
    """The code, the state or GitHub's answer could not be trusted."""


class NotMember(SignInFailed):
    """GitHub has no membership to show: the account is not in the organisation."""


def _signature(value: str, secret: str) -> str:
    digest = hmac.new(secret.encode(), value.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def seal(payload: dict, secret: str) -> str:
    """payload base64url encoded and signed, ready for a cookie."""
    raw = json.dumps(payload, separators=(",", ":")).encode()
    body = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    return f"{body}.{_signature(body, secret)}"


def unseal(value: str, secret: str) -> dict | None:
    """The payload a cookie carries, or None when it was edited, unsigned or garbled."""
    body, _, signature = (value or "").partition(".")
    if not body or not signature:
        return None
    if not hmac.compare_digest(signature, _signature(body, secret)):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


def cookie(
    name: str,
    value: str,
    *,
    path: str = "/",
    max_age: int = SESSION_TTL,
    secure: bool = False,
) -> str:
    """One Set-Cookie header. The cookie is scoped to path so a reader mounted at /pub
    cannot have it, or hand it to, anything else on the same origin."""
    parts = [
        f"{name}={value}",
        f"Path={path}",
        f"Max-Age={max_age}",
        "HttpOnly",
        "SameSite=Lax",
    ]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)


def origin_of(host: str, forwarded_proto: str) -> tuple[str, bool]:
    """The public scheme and origin of the request, and whether the cookie needs Secure."""
    scheme = "https" if forwarded_proto.strip().lower() == "https" else "http"
    return f"{scheme}://{host}", scheme == "https"


def next_path(value: str, base: str) -> str:
    """A path under base to send the browser back to, so a link cannot be turned into an
    open redirect. Anything else falls back to the file browser."""
    home = base + "/files/"
    if not value or not value.startswith("/") or value.startswith("//"):
        return home
    if ":" in value.split("#")[0].split("?")[0] or any(c < " " for c in value):
        return home
    prefix = base + "/" if base else "/"
    return value if value.startswith(prefix) else home


def authorize_url(
    client_id: str, redirect_uri: str, state: str, scope: str = "read:user"
) -> str:
    query = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scope,
            "state": state,
            "allow_signup": "false",
        }
    )
    return f"{AUTHORIZE}?{query}"


def exchange(code: str, client_id: str, client_secret: str, redirect_uri: str) -> str:
    """The access token GitHub hands back for a code."""
    data = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        }
    ).encode()
    request = urllib.request.Request(
        TOKEN_URL,
        data=data,
        headers={"Accept": "application/json", "User-Agent": AGENT},
    )
    answer = _json(request)
    token = answer.get("access_token")
    if not isinstance(token, str) or not token:
        raise SignInFailed(str(answer.get("error_description") or "no access token"))
    return token


def user(token: str) -> dict:
    """The signed-in account: its id, its login and the name it goes by."""
    request = urllib.request.Request(
        USER_URL,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": AGENT,
        },
    )
    answer = _json(request)
    login = answer.get("login")
    if not isinstance(login, str) or not login or not isinstance(answer.get("id"), int):
        raise SignInFailed("GitHub did not name the account")
    return {
        "id": answer["id"],
        "login": login,
        "name": answer.get("name") if isinstance(answer.get("name"), str) else "",
    }


def member(token: str, org: str) -> bool:
    """Whether the signed-in account is an active member of org, private memberships
    included (the token carries read:org). An org that restricts OAuth apps answers 403
    until an owner approves this one, which is reported rather than taken as a no."""
    request = urllib.request.Request(
        f"{API}/user/memberships/orgs/{urllib.parse.quote(org, safe='')}",
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": AGENT,
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        answer = _json(request)
    except NotMember:
        return False
    return answer.get("state") == "active"


def _json(request: urllib.request.Request) -> dict:
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            answer = json.loads(response.read())
    except urllib.error.HTTPError as error:
        if error.code == 404:
            raise NotMember() from error
        if error.code == 403:
            raise SignInFailed(
                "GitHub would not show the organisation membership; the organisation "
                "may need to approve this OAuth app"
            ) from error
        raise SignInFailed(f"GitHub answered {error.code}") from error
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise SignInFailed(f"GitHub did not answer: {error}") from error
    if not isinstance(answer, dict):
        raise SignInFailed("GitHub answered with something else")
    return answer


class SignIn:
    """A GitHub OAuth app, and the rules that keep its cookie honest."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        secret: str,
        *,
        path: str = "/",
        admin: str = "",
        orgs: tuple[str, ...] = (),
    ):
        self.orgs = tuple(org.strip() for org in orgs if org.strip())
        self.client_id = client_id
        self.client_secret = client_secret
        self.secret = secret
        self.path = path if path.endswith("/") else path + "/"
        self.admin = admin.strip().lstrip("@").lower()

    def redirect_uri(self, origin: str, base: str) -> str:
        return f"{origin}{base}/auth/github/callback"

    def start(self, origin: str, base: str, wanted: str) -> tuple[str, str]:
        """The URL to send the browser to, and the state cookie that must come back."""
        state = secrets.token_urlsafe(16)
        target = next_path(wanted, base)
        redirect = self.redirect_uri(origin, base)
        sealed = seal(
            {"state": state, "next": target, "exp": time.time() + STATE_TTL},
            self.secret,
        )
        scope = "read:user read:org" if self.orgs else "read:user"
        return authorize_url(self.client_id, redirect, state, scope), sealed

    def finish(
        self, code: str, state: str, state_cookie: str, redirect_uri: str
    ) -> dict:
        """The session for a code that came back with the state this browser was given."""
        held = unseal(state_cookie, self.secret)
        if (
            not held
            or not state
            or not hmac.compare_digest(str(held.get("state", "")), state)
            or float(held.get("exp", 0)) < time.time()
        ):
            raise SignInFailed("the sign-in did not start here, or it took too long")
        token = exchange(code, self.client_id, self.client_secret, redirect_uri)
        account = user(token)
        if self.orgs and not any(member(token, org) for org in self.orgs):
            raise NotMember(
                f"{account['login']} is not a member of " + " or ".join(self.orgs)
            )
        return {
            **account,
            "admin": bool(self.admin) and account["login"].lower() == self.admin,
            "exp": time.time() + SESSION_TTL,
        }

    def session(self, value: str) -> dict | None:
        """Who a session cookie names, when it still does."""
        held = unseal(value, self.secret)
        if not held or float(held.get("exp", 0)) < time.time():
            return None
        if not isinstance(held.get("login"), str) or not isinstance(
            held.get("id"), int
        ):
            return None
        return held

    def target(self, state_cookie: str, base: str) -> str:
        """The page the browser goes back to, whether the sign-in worked or not."""
        held = unseal(state_cookie, self.secret) or {}
        return next_path(str(held.get("next", "")), base)
