"""Run a MongoDB transaction body with retry on transient server faults.

A single-node replica set can still raise transient errors (primary
step-down during an election, write conflicts under concurrency, lock
timeouts). MongoDB marks these with the ``TransientTransactionError``
label; retrying the *whole body* in a fresh session is safe because the
aborted attempt left no partial state behind.

Callers must make the body re-runnable: reset any document fields the
body accumulates (e.g. lists it appends to) at the start of each attempt.
"""

import asyncio
import logging
from typing import Any, Awaitable, Callable, TypeVar

from pymongo.errors import (
    ConnectionFailure,
    DuplicateKeyError,
    OperationFailure,
    PyMongoError,
)

log = logging.getLogger("invento")

T = TypeVar("T")

# Server error codes that indicate a transient cluster/transaction condition.
_TRANSIENT_CODES = frozenset({
    6,      # HostUnreachable
    7,      # HostNotFound
    24,     # LockTimeout
    64,     # PrimarySteppedDown
    89,     # NetworkTimeout
    91,     # ShutdownInProgress
    112,    # WriteConflict
    189,    # SteppedDown
    251,    # NoSuchTransaction
    262,    # ExceededTimeLimit
    9001,   # SocketException
    10107,  # SocketException (internal)
    11600,  # InterruptedAtShutdown
    11602,  # InterruptedDueToReplStateChange
    13435,  # NotPrimaryNoSecondaryOk
    13436,  # NotPrimaryOrSecondary
})


def is_transient(exc: PyMongoError) -> bool:
    """Whether retrying the same transaction body may succeed."""
    if isinstance(exc, DuplicateKeyError):
        # Business outcome (idempotency-key race), never a transient fault.
        return False
    if isinstance(exc, ConnectionFailure):
        return True
    if isinstance(exc, OperationFailure):
        try:
            if exc.has_error_label("TransientTransactionError") or exc.has_error_label(
                "UnknownTransactionCommitResult"
            ):
                return True
        except Exception:  # noqa: BLE001 - label lookup must never mask the error
            pass
        return exc.code in _TRANSIENT_CODES
    return False


async def run_in_transaction(
    db: Any,
    body: Callable[[Any], Awaitable[T]],
    *,
    attempts: int = 3,
    backoff_seconds: float = 0.1,
) -> T:
    """Run ``body(session)`` inside a transaction, retrying transient faults.

    Non-transient PyMongo errors, duplicate-key errors, and application
    errors (BusinessRuleError etc.) propagate to the caller immediately.
    """
    attempt = 0
    while True:
        try:
            async with await db.client.start_session() as session:
                async with session.start_transaction():
                    return await body(session)
        except PyMongoError as exc:
            attempt += 1
            if attempt >= attempts or not is_transient(exc):
                raise
            log.warning(
                "Transient transaction fault (attempt %d/%d): %s",
                attempt, attempts, exc,
            )
            await asyncio.sleep(backoff_seconds * (2 ** (attempt - 1)))
